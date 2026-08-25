import { ContentDestinationPublishError } from './content-destination-adapters';
import type {
  DistributionAssetMediaRow,
  DistributionAssetRow,
} from './distribution-engine-repository';

export type InstagramVisualSafetyResult =
  | { readonly safe: true }
  | { readonly safe: false; readonly reason: string };

export const INSTAGRAM_REEL_VALIDATION_VERSION = 'reel-v2';
export const INSTAGRAM_REEL_AGENT_REVIEW_VERSION = 'maya-reel-watch-v1';

function numberFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reels are fail-closed because Instagram shows the same 9:16 source through
 * multiple crops. Dimensions alone cannot prove that the feed/profile previews
 * are safe. Manually supplied Reels require a real Meta Business Suite preview;
 * Jordan-rendered Reels require the stricter deterministic crop-suite attestation.
 */
export function validateInstagramVisualSafety(
  asset: DistributionAssetRow,
  mediaRows: ReadonlyArray<DistributionAssetMediaRow>
): InstagramVisualSafetyResult {
  if (asset.asset_type !== 'short_video_post') return { safe: true };

  const video = mediaRows.find(
    (row) =>
      row.media_kind === 'video' &&
      (row.provider_ready_status === 'ready' || row.provider_ready_status === 'uploaded')
  );
  if (!video) return { safe: false, reason: 'reel_video_missing' };

  const width = numberFrom(video.metadata['width']);
  const height = numberFrom(video.metadata['height']);
  if (!width || !height || width < 1080 || height < 1920) {
    return { safe: false, reason: 'reel_requires_1080x1920' };
  }
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) > 0.01) {
    return { safe: false, reason: 'reel_requires_9x16' };
  }
  if (stringFrom(video.metadata['safe_area_contract']) !== 'reel_9x16_center_safe') {
    return { safe: false, reason: 'reel_safe_area_unverified' };
  }
  const manualMetaPreviewApproved =
    video.metadata['meta_preview_approved'] === true &&
    stringFrom(video.metadata['meta_preview_approved_at']) !== '';
  const automatedCropSuiteApproved =
    video.metadata['automated_crop_suite_approved'] === true &&
    video.metadata['crop_safe_zone_checked'] === true &&
    video.metadata['reels_preview_safe'] === true &&
    stringFrom(video.metadata['automated_crop_suite_version']) === 'jordan-crop-suite-v2' &&
    stringFrom(video.metadata['production_validation_version']) === 'jordan-reel-v2' &&
    stringFrom(video.metadata['renderer']) === 'github_actions_hyperframes';
  if (!manualMetaPreviewApproved && !automatedCropSuiteApproved) {
    return { safe: false, reason: 'meta_preview_approval_required' };
  }
  const agentReviewApproved =
    video.metadata['agent_review_required'] === true &&
    stringFrom(video.metadata['agent_review_decision']) === 'pass' &&
    stringFrom(video.metadata['agent_review_reviewer']) === 'maya' &&
    stringFrom(video.metadata['agent_review_provider']) === 'gemini' &&
    stringFrom(video.metadata['agent_review_version']) === INSTAGRAM_REEL_AGENT_REVIEW_VERSION &&
    stringFrom(video.metadata['agent_reviewed_at']) !== '' &&
    stringFrom(video.metadata['agent_review_media_sha256']) !== '' &&
    stringFrom(video.metadata['agent_review_media_sha256']) === stringFrom(video.metadata['sha256']);
  if (automatedCropSuiteApproved && !agentReviewApproved) {
    return { safe: false, reason: 'reel_agent_review_required' };
  }
  if (video.metadata['has_audio'] !== true || numberFrom(video.metadata['audio_track_count'])! < 1) {
    return { safe: false, reason: 'reel_audio_required' };
  }
  const durationSeconds = numberFrom(video.metadata['duration_seconds']);
  // Manual Reels retain the tighter editorial window. Jordan's deterministic
  // production contract deliberately renders a 26–30 second diagnostic and
  // proves pacing as part of the same CI attestation used above. Keep the
  // publisher aligned with that upstream contract instead of rejecting a
  // render that already passed it.
  const maximumDurationSeconds = automatedCropSuiteApproved ? 30 : 20;
  if (!durationSeconds || durationSeconds < 14 || durationSeconds > maximumDurationSeconds) {
    return { safe: false, reason: 'reel_pacing_unverified' };
  }
  if (
    video.metadata['mobile_text_legible'] !== true ||
    video.metadata['spelling_checked'] !== true
  ) {
    return { safe: false, reason: 'reel_mobile_copy_unverified' };
  }
  if (
    video.metadata['feed_preview_safe'] !== true ||
    video.metadata['grid_preview_safe'] !== true ||
    stringFrom(video.metadata['feed_preview_url']) === '' ||
    stringFrom(video.metadata['grid_preview_url']) === ''
  ) {
    return { safe: false, reason: 'reel_feed_grid_preview_required' };
  }
  if (
    video.metadata['cta_checked'] !== true ||
    stringFrom(asset.cta_url) === '' ||
    video.metadata['privacy_checked'] !== true ||
    video.metadata['factual_claims_checked'] !== true
  ) {
    return { safe: false, reason: 'reel_content_safety_unverified' };
  }
  if (
    video.metadata['duplicate_media_checked'] !== true ||
    video.metadata['duplicate_media_match'] === true ||
    video.metadata['template_rotation_checked'] !== true
  ) {
    return { safe: false, reason: 'reel_repetition_check_required' };
  }
  if (
    stringFrom(video.metadata['validation_version']) !== INSTAGRAM_REEL_VALIDATION_VERSION ||
    stringFrom(video.metadata['validated_at']) === '' ||
    stringFrom(video.metadata['validated_by']) === ''
  ) {
    return { safe: false, reason: 'reel_validation_record_required' };
  }
  return { safe: true };
}

export function findRepeatedInstagramMedia(
  candidate: { readonly mediaFingerprint: string; readonly templateId: string },
  recent: ReadonlyArray<{ readonly mediaFingerprint: string; readonly templateId: string }>
): 'media' | 'template' | null {
  const fingerprint = candidate.mediaFingerprint.trim();
  const template = candidate.templateId.trim();
  if (fingerprint && recent.some((item) => item.mediaFingerprint.trim() === fingerprint)) return 'media';
  const recentTemplates = recent.slice(0, 3).map((item) => item.templateId.trim()).filter(Boolean);
  if (template && recentTemplates.length >= 2 && recentTemplates.every((value) => value === template)) {
    return 'template';
  }
  return null;
}

export function assertInstagramVisualSafety(
  asset: DistributionAssetRow,
  mediaRows: ReadonlyArray<DistributionAssetMediaRow>
): void {
  const result = validateInstagramVisualSafety(asset, mediaRows);
  if (result.safe) return;
  throw new ContentDestinationPublishError({
    message: `Instagram visual safety gate blocked publishing: ${result.reason}.`,
    providerName: 'instagram',
    retryable: false,
  });
}
