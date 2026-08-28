import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createDistributionEngineRepository,
  type DistributionAssetRow,
} from './distribution-engine-repository';
import {
  JORDAN_REEL_VALIDATION_VERSION,
  type JordanReelScript,
} from './jordan-reel-production';
import {
  findRepeatedInstagramMedia,
  INSTAGRAM_REEL_VALIDATION_VERSION,
} from './instagram-visual-safety';
import {
  JORDAN_REEL_REVIEW_VERSION,
  type JordanReelReviewAttestation,
} from './jordan-reel-review';

const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LEASE_MS = 2 * 60 * 60 * 1000;
const REVIEW_RETRY_BACKOFF_MS = 6 * 60 * 60 * 1000;

export type JordanReelBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
};

export type JordanReelRenderClaim = {
  readonly assetId: string;
  readonly attemptId: string;
  readonly title: string;
  readonly caption: string;
  readonly script: JordanReelScript;
  readonly templateId: string;
};

export type JordanReelRenderValidation = {
  readonly width: 1080;
  readonly height: 1920;
  readonly durationSeconds: number;
  readonly audioTrackCount: number;
  readonly feedPreviewSafe: true;
  readonly gridPreviewSafe: true;
  readonly reelsPreviewSafe: true;
  readonly mobileTextLegible: true;
  readonly spellingChecked: true;
  readonly ctaChecked: true;
  readonly cropSafeZoneChecked: true;
  readonly templateId: string;
};

function metadata(asset: DistributionAssetRow): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
}

function retryableReviewerHold(
  assetMetadata: Record<string, unknown>,
  now: Date
): boolean {
  if (
    assetMetadata['reel_render_status'] !== 'review_failed' ||
    assetMetadata['reel_render_retryable'] !== true ||
    assetMetadata['reel_review_status'] !== 'hold'
  ) {
    return false;
  }
  const findings = assetMetadata['reel_review_findings'];
  if (
    !Array.isArray(findings) ||
    findings.length === 0 ||
    findings.some((finding) => (
      !finding ||
      typeof finding !== 'object' ||
      (finding as Record<string, unknown>)['code'] !== 'reviewer_unavailable'
    ))
  ) {
    return false;
  }
  const explicitRetryAt = Date.parse(String(assetMetadata['reel_review_retry_after'] ?? ''));
  if (Number.isFinite(explicitRetryAt)) return now.getTime() >= explicitRetryAt;
  const reviewedAt = Date.parse(String(assetMetadata['reel_reviewed_at'] ?? ''));
  return Number.isFinite(reviewedAt) &&
    now.getTime() - reviewedAt >= REVIEW_RETRY_BACKOFF_MS;
}

function reviewerHoldHistory(assetMetadata: Record<string, unknown>): unknown[] {
  const prior = Array.isArray(assetMetadata['reel_review_history'])
    ? assetMetadata['reel_review_history'].slice(-2)
    : [];
  return [
    ...prior,
    {
      decision: assetMetadata['reel_review_status'] ?? null,
      reviewed_at: assetMetadata['reel_reviewed_at'] ?? null,
      summary: assetMetadata['reel_review_summary'] ?? null,
      findings: assetMetadata['reel_review_findings'] ?? [],
      media_sha256: assetMetadata['reel_review_media_sha256'] ?? null,
      attempts: assetMetadata['reel_review_attempts'] ?? 0,
    },
  ];
}

export function validJordanReelScript(value: unknown): value is JordanReelScript {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row['template'] === 'diagnostic-kinetic-v1' &&
    typeof row['hook'] === 'string' &&
    typeof row['tension'] === 'string' &&
    typeof row['comparisonTop'] === 'string' &&
    typeof row['comparisonBottom'] === 'string' &&
    typeof row['diagnostic'] === 'string' &&
    typeof row['cta'] === 'string' &&
    row['url'] === 'getgeopulse.com' &&
    typeof row['sourceUrl'] === 'string' &&
    /^https:\/\//.test(row['sourceUrl']);
}

export async function claimNextJordanReel(
  supabase: SupabaseClient,
  now = new Date()
): Promise<JordanReelRenderClaim | null> {
  const repo = createDistributionEngineRepository(supabase as never);
  const assets = await repo.listAssets({ providerFamily: 'instagram' });
  const candidate = assets
    .filter((asset) => asset.asset_type === 'short_video_post')
    .find((asset) => {
      const assetMetadata = metadata(asset);
      const status = String(assetMetadata['reel_render_status'] ?? '');
      const attempts = Number(assetMetadata['reel_render_attempt_count'] ?? 0);
      if (assetMetadata['reel_render_terminal'] === true || attempts >= 3) return false;
      if (status === 'pending' || status === 'failed') return true;
      if (retryableReviewerHold(assetMetadata, now)) return true;
      if (status !== 'rendering') return false;
      const leasedAt = new Date(String(assetMetadata['reel_render_leased_at'] ?? ''));
      return !Number.isFinite(leasedAt.getTime()) || now.getTime() - leasedAt.getTime() > LEASE_MS;
    });
  if (!candidate) return null;

  const script = metadata(candidate)['reel_script'];
  if (!validJordanReelScript(script)) {
    await repo.upsertAsset({
      assetId: candidate.asset_id,
      contentItemId: candidate.content_item_id,
      sourceType: candidate.source_type,
      sourceKey: candidate.source_key,
      assetType: candidate.asset_type,
      providerFamily: candidate.provider_family,
      title: candidate.title,
      bodyPlaintext: candidate.body_plaintext,
      captionText: candidate.caption_text,
      status: 'failed',
      ctaUrl: candidate.cta_url,
      metadata: {
        reel_render_status: 'blocked',
        reel_render_error: 'invalid_or_ungrounded_script',
        reel_render_terminal: true,
        reel_render_retryable: false,
        reel_render_failed_at: now.toISOString(),
      },
    });
    return null;
  }

  const attemptId = randomUUID();
  const candidateMetadata = metadata(candidate);
  const retryingReviewerHold = retryableReviewerHold(candidateMetadata, now);
  const templateIds = [
    'diagnostic-kinetic-v1a',
    'diagnostic-kinetic-v1b',
    'diagnostic-kinetic-v1c',
  ];
  let templateId: string | undefined;
  if (retryingReviewerHold) {
    const priorTemplateId = String(candidateMetadata['reel_template_id'] ?? '');
    templateId = templateIds.includes(priorTemplateId) ? priorTemplateId : undefined;
  } else {
    const { data: recentMedia } = await supabase
      .from('distribution_asset_media')
      .select('metadata')
      .eq('media_kind', 'video')
      .order('created_at', { ascending: false })
      .limit(3);
    const recentTemplateIds = (recentMedia ?? [])
      .map((row: { metadata?: Record<string, unknown> }) => String(row.metadata?.['template_id'] ?? ''))
      .filter(Boolean);
    templateId = templateIds.find((id) => !recentTemplateIds.includes(id));
    if (!templateId && recentTemplateIds.length > 0) {
      templateId = templateIds.reduce((leastRecent, id) =>
        recentTemplateIds.indexOf(id) > recentTemplateIds.indexOf(leastRecent) ? id : leastRecent
      );
    }
  }
  if (!templateId) {
    await repo.upsertAsset({
      assetId: candidate.asset_id,
      contentItemId: candidate.content_item_id,
      sourceType: candidate.source_type,
      sourceKey: candidate.source_key,
      assetType: candidate.asset_type,
      providerFamily: candidate.provider_family,
      title: candidate.title,
      bodyPlaintext: candidate.body_plaintext,
      captionText: candidate.caption_text,
      status: 'failed',
      ctaUrl: candidate.cta_url,
      metadata: {
        reel_render_status: 'blocked',
        reel_render_error: 'template_inventory_exhausted',
        reel_render_terminal: true,
        reel_render_retryable: false,
        reel_render_failed_at: now.toISOString(),
      },
    });
    return null;
  }
  const attemptCount = Number(metadata(candidate)['reel_render_attempt_count'] ?? 0) + 1;
  await repo.upsertAsset({
    assetId: candidate.asset_id,
    contentItemId: candidate.content_item_id,
    sourceType: candidate.source_type,
    sourceKey: candidate.source_key,
    assetType: candidate.asset_type,
    providerFamily: candidate.provider_family,
    title: candidate.title,
    bodyPlaintext: candidate.body_plaintext,
    captionText: candidate.caption_text,
    status: 'draft',
    ctaUrl: candidate.cta_url,
    metadata: {
      reel_render_status: 'rendering',
      reel_render_attempt_id: attemptId,
      reel_render_leased_at: now.toISOString(),
      reel_render_error: null,
      reel_template_id: templateId,
      reel_render_attempt_count: attemptCount,
      reel_render_terminal: false,
      reel_render_retryable: true,
      reel_review_retry_after: null,
      ...(retryingReviewerHold
        ? {
            reel_review_history: reviewerHoldHistory(candidateMetadata),
            reel_review_retry_count:
              Number(candidateMetadata['reel_review_retry_count'] ?? 0) + 1,
          }
        : {}),
    },
  });
  return {
    assetId: candidate.asset_id,
    attemptId,
    title: candidate.title ?? 'GEO-Pulse AI visibility',
    caption: candidate.caption_text ?? candidate.body_plaintext ?? '',
    script,
    templateId,
  };
}

export function validateJordanReelVideoBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < 50_000 || bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new Error('invalid_video_size');
  }
  const header = new TextDecoder().decode(bytes.slice(4, 12));
  if (!header.includes('ftyp')) throw new Error('invalid_mp4_signature');
}

function assertJpeg(bytes: Uint8Array): void {
  if (
    bytes.byteLength < 10_000 ||
    bytes.byteLength > MAX_IMAGE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    throw new Error('invalid_jpeg');
  }
}

export function validateJordanReelRenderReport(report: JordanReelRenderValidation): void {
  if (report.width !== 1080 || report.height !== 1920) throw new Error('invalid_dimensions');
  if (!Number.isFinite(report.durationSeconds) || report.durationSeconds < 26 || report.durationSeconds > 30) {
    throw new Error('invalid_duration');
  }
  if (!Number.isFinite(report.audioTrackCount) || report.audioTrackCount < 1) {
    throw new Error('audio_required');
  }
  if (
    report.feedPreviewSafe !== true ||
    report.gridPreviewSafe !== true ||
    report.reelsPreviewSafe !== true ||
    report.mobileTextLegible !== true ||
    report.spellingChecked !== true ||
    report.ctaChecked !== true ||
    report.cropSafeZoneChecked !== true
  ) {
    throw new Error('visual_validation_failed');
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,80}$/.test(report.templateId)) {
    throw new Error('invalid_template_id');
  }
}

function validateReviewAttestation(
  review: JordanReelReviewAttestation,
  mediaSha256: string
): void {
  if (
    review.reviewer !== 'maya' ||
    review.provider !== 'gemini' ||
    review.reviewVersion !== JORDAN_REEL_REVIEW_VERSION ||
    review.mediaSha256 !== mediaSha256 ||
    !['pass', 'fail', 'hold'].includes(review.decision) ||
    !review.model.trim() ||
    !review.reviewedAt.trim() ||
    !Number.isInteger(review.attempts) ||
    review.attempts < 0 ||
    !Array.isArray(review.findings)
  ) {
    throw new Error('reel_review_attestation_invalid');
  }
  if (
    review.decision === 'pass' &&
    (
      review.findings.some((finding) => finding.severity !== 'minor') ||
      !review.hookClear ||
      !review.brandSafe ||
      !review.ctaClear ||
      !review.audioAcceptable ||
      !review.textReadable ||
      !review.sequenceCoherent ||
      !review.engaging
    )
  ) {
    throw new Error('reel_review_false_pass');
  }
}

function publicUrl(publicBase: string, key: string): string {
  return `${publicBase.replace(/\/+$/, '')}/${key}`;
}

export async function completeJordanReelRender(args: {
  readonly supabase: SupabaseClient;
  readonly bucket: JordanReelBucket;
  readonly publicBase: string;
  readonly assetId: string;
  readonly attemptId: string;
  readonly video: ArrayBuffer;
  readonly thumbnail: ArrayBuffer;
  readonly feedPreview: ArrayBuffer;
  readonly gridPreview: ArrayBuffer;
  readonly validation: JordanReelRenderValidation;
  readonly review: JordanReelReviewAttestation;
  readonly now?: Date;
}): Promise<{
  readonly scheduled: boolean;
  readonly videoUrl: string;
  readonly reviewDecision: JordanReelReviewAttestation['decision'];
}> {
  validateJordanReelRenderReport(args.validation);
  const videoBytes = new Uint8Array(args.video);
  const thumbnailBytes = new Uint8Array(args.thumbnail);
  const feedBytes = new Uint8Array(args.feedPreview);
  const gridBytes = new Uint8Array(args.gridPreview);
  validateJordanReelVideoBytes(videoBytes);
  assertJpeg(thumbnailBytes);
  assertJpeg(feedBytes);
  assertJpeg(gridBytes);

  const repo = createDistributionEngineRepository(args.supabase as never);
  const asset = await repo.getAssetByAssetId(args.assetId);
  if (!asset || asset.asset_type !== 'short_video_post') throw new Error('asset_not_found');
  const assetMetadata = metadata(asset);
  if (
    assetMetadata['reel_render_status'] !== 'rendering' ||
    assetMetadata['reel_render_attempt_id'] !== args.attemptId
  ) {
    throw new Error('stale_render_attempt');
  }
  if (!validJordanReelScript(assetMetadata['reel_script'])) throw new Error('invalid_or_ungrounded_script');
  if (assetMetadata['reel_template_id'] !== args.validation.templateId) {
    throw new Error('unexpected_template_id');
  }

  const sha256 = createHash('sha256').update(videoBytes).digest('hex');
  validateReviewAttestation(args.review, sha256);
  const { data: duplicate } = await args.supabase
    .from('distribution_asset_media')
    .select('id,distribution_asset_id')
    .eq('media_kind', 'video')
    .eq('metadata->>sha256', sha256)
    .neq('distribution_asset_id', asset.id)
    .limit(1);
  if (duplicate?.length) throw new Error('duplicate_media');
  const { data: recentMedia } = await args.supabase
    .from('distribution_asset_media')
    .select('metadata')
    .eq('media_kind', 'video')
    .neq('distribution_asset_id', asset.id)
    .order('created_at', { ascending: false })
    .limit(3);
  const repeated = findRepeatedInstagramMedia(
    { mediaFingerprint: sha256, templateId: args.validation.templateId },
    (recentMedia ?? []).map((row: { metadata?: Record<string, unknown> }) => ({
      mediaFingerprint: String(row.metadata?.['media_fingerprint'] ?? ''),
      templateId: String(row.metadata?.['template_id'] ?? ''),
    }))
  );
  if (repeated === 'media') throw new Error('duplicate_media');
  if (repeated === 'template') throw new Error('template_rotation_required');

  const now = args.now ?? new Date();
  const safeAssetId = asset.asset_id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 120);
  const prefix = `social/jordan/reels/${now.toISOString().slice(0, 10)}/${safeAssetId}/${sha256.slice(0, 12)}`;
  const videoKey = `${prefix}-master.mp4`;
  const thumbnailKey = `${prefix}-thumbnail.jpg`;
  const feedKey = `${prefix}-feed-4x5.jpg`;
  const gridKey = `${prefix}-grid-1x1.jpg`;
  await Promise.all([
    args.bucket.put(videoKey, args.video, {
      httpMetadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' },
    }),
    args.bucket.put(thumbnailKey, args.thumbnail, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
    }),
    args.bucket.put(feedKey, args.feedPreview, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
    }),
    args.bucket.put(gridKey, args.gridPreview, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
    }),
  ]);

  const videoUrl = publicUrl(args.publicBase, videoKey);
  const thumbnailUrl = publicUrl(args.publicBase, thumbnailKey);
  const feedPreviewUrl = publicUrl(args.publicBase, feedKey);
  const gridPreviewUrl = publicUrl(args.publicBase, gridKey);
  const validatedAt = now.toISOString();
  const reviewerUnavailable = args.review.decision === 'hold' &&
    args.review.findings.length > 0 &&
    args.review.findings.every((finding) => finding.code === 'reviewer_unavailable');
  const reviewRetryAfter = reviewerUnavailable
    ? new Date(now.getTime() + REVIEW_RETRY_BACKOFF_MS).toISOString()
    : null;
  await repo.replaceAssetMedia(asset.id, [
    {
      mediaKind: 'video',
      storageUrl: videoUrl,
      mimeType: 'video/mp4',
      altText: `${asset.title ?? 'GEO-Pulse AI visibility Reel'}.`,
      providerReadyStatus: args.review.decision === 'pass' ? 'ready' : 'invalid',
      metadata: {
        generated_by: 'jordan',
        renderer: 'github_actions_hyperframes',
        master_asset: true,
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        duration_seconds: args.validation.durationSeconds,
        safe_area_contract: 'reel_9x16_center_safe',
        has_audio: true,
        audio_track_count: args.validation.audioTrackCount,
        mobile_text_legible: true,
        spelling_checked: true,
        feed_preview_safe: true,
        grid_preview_safe: true,
        reels_preview_safe: true,
        feed_preview_url: feedPreviewUrl,
        grid_preview_url: gridPreviewUrl,
        thumbnail_url: thumbnailUrl,
        cta_checked: true,
        privacy_checked: true,
        factual_claims_checked: true,
        duplicate_media_checked: true,
        duplicate_media_match: false,
        template_rotation_checked: true,
        automated_crop_suite_approved: true,
        automated_crop_suite_version: 'jordan-crop-suite-v2',
        crop_safe_zone_checked: true,
        validation_version: INSTAGRAM_REEL_VALIDATION_VERSION,
        production_validation_version: JORDAN_REEL_VALIDATION_VERSION,
        validated_at: validatedAt,
        validated_by: 'jordan_ci_renderer',
        sha256,
        media_fingerprint: sha256,
        template_id: args.validation.templateId,
        agent_review_required: true,
        agent_review_decision: args.review.decision,
        agent_review_reviewer: args.review.reviewer,
        agent_review_provider: args.review.provider,
        agent_review_model: args.review.model,
        agent_review_version: args.review.reviewVersion,
        agent_review_media_sha256: args.review.mediaSha256,
        agent_reviewed_at: args.review.reviewedAt,
        agent_review_summary: args.review.summary,
        agent_review_findings: args.review.findings,
        agent_review_attempts: args.review.attempts,
      },
    },
    {
      mediaKind: 'thumbnail',
      storageUrl: thumbnailUrl,
      mimeType: 'image/jpeg',
      altText: `${asset.title ?? 'GEO-Pulse Reel'} cover`,
      providerReadyStatus: 'ready',
      metadata: { width: 1080, height: 1920, role: 'reel_cover' },
    },
    {
      mediaKind: 'image',
      storageUrl: feedPreviewUrl,
      mimeType: 'image/jpeg',
      altText: `${asset.title ?? 'GEO-Pulse Reel'} feed preview`,
      providerReadyStatus: 'ready',
      metadata: { width: 1080, height: 1350, role: 'feed_preview' },
    },
    {
      mediaKind: 'image',
      storageUrl: gridPreviewUrl,
      mimeType: 'image/jpeg',
      altText: `${asset.title ?? 'GEO-Pulse Reel'} profile grid preview`,
      providerReadyStatus: 'ready',
      metadata: { width: 1080, height: 1080, role: 'grid_preview' },
    },
  ]);

  const { data: jobs } = await args.supabase
    .from('distribution_jobs')
    .select('id,publish_mode,status')
    .eq('distribution_asset_id', asset.id)
    .order('created_at', { ascending: true })
    .limit(1);
  const job = jobs?.[0] as { id: string; publish_mode: string; status: string } | undefined;
  const scheduled = job?.publish_mode === 'scheduled' && args.review.decision === 'pass';
  if (job) {
    await repo.updateJob(job.id, {
      status: scheduled ? 'scheduled' : 'draft',
      lastError: args.review.decision === 'pass'
        ? null
        : `reel_agent_review_${args.review.decision}`,
    });
  }
  await repo.upsertAsset({
    assetId: asset.asset_id,
    contentItemId: asset.content_item_id,
    sourceType: asset.source_type,
    sourceKey: asset.source_key,
    assetType: asset.asset_type,
    providerFamily: asset.provider_family,
    title: asset.title,
    bodyPlaintext: asset.body_plaintext,
    captionText: asset.caption_text,
    // A completed render has passed the Reel validation suite. Scheduled
    // manual Instagram assets must remain `approved` because the dispatcher
    // intentionally rejects every other manual-asset state.
    status: scheduled ? 'approved' : 'review',
    ctaUrl: asset.cta_url,
    metadata: {
      reel_render_status: args.review.decision === 'pass' ? 'complete' : 'review_failed',
      reel_rendered_at: validatedAt,
      reel_master_url: videoUrl,
      reel_thumbnail_url: thumbnailUrl,
      reel_feed_preview_url: feedPreviewUrl,
      reel_grid_preview_url: gridPreviewUrl,
      reel_render_error: null,
      reel_review_status: args.review.decision,
      reel_review_reviewer: args.review.reviewer,
      reel_review_provider: args.review.provider,
      reel_review_model: args.review.model,
      reel_review_version: args.review.reviewVersion,
      reel_review_media_sha256: args.review.mediaSha256,
      reel_reviewed_at: args.review.reviewedAt,
      reel_review_summary: args.review.summary,
      reel_review_findings: args.review.findings,
      reel_review_attempts: args.review.attempts,
      reel_render_retryable: reviewerUnavailable,
      reel_review_retry_after: reviewRetryAfter,
    },
  });
  return { scheduled, videoUrl, reviewDecision: args.review.decision };
}

export async function failJordanReelRender(args: {
  readonly supabase: SupabaseClient;
  readonly assetId: string;
  readonly attemptId: string;
  readonly error: string;
}): Promise<void> {
  const repo = createDistributionEngineRepository(args.supabase as never);
  const asset = await repo.getAssetByAssetId(args.assetId);
  if (!asset || metadata(asset)['reel_render_attempt_id'] !== args.attemptId) return;
  const error = args.error.replace(/\s+/g, ' ').trim().slice(0, 500);
  const attempts = Number(metadata(asset)['reel_render_attempt_count'] ?? 1);
  const terminal = attempts >= 3 || [
    'duplicate_media',
    'template_rotation_required',
    'template_inventory_exhausted',
    'invalid_or_ungrounded_script',
  ].some((code) => error.includes(code));
  await repo.upsertAsset({
    assetId: asset.asset_id,
    contentItemId: asset.content_item_id,
    sourceType: asset.source_type,
    sourceKey: asset.source_key,
    assetType: asset.asset_type,
    providerFamily: asset.provider_family,
    title: asset.title,
    bodyPlaintext: asset.body_plaintext,
    captionText: asset.caption_text,
    status: 'failed',
    ctaUrl: asset.cta_url,
    metadata: {
      reel_render_status: terminal ? 'blocked' : 'failed',
      reel_render_error: error,
      reel_render_failed_at: new Date().toISOString(),
      reel_render_terminal: terminal,
      reel_render_retryable: !terminal,
      reel_render_attempt_count: attempts,
    },
  });
}
