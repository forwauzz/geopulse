'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { dispatchDistributionJobs } from '@/lib/server/distribution-job-dispatcher';
import { createDistributionEngineRepository } from '@/lib/server/distribution-engine-repository';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';
import { buildSocialOAuthAuthorizeUrl } from '@/lib/server/distribution-social-oauth';

const accountSchema = z.object({
  accountId: z
    .string()
    .min(2, 'Enter an account id.')
    .max(120, 'Account id is too long.')
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, underscores, or hyphens only.'),
  providerName: z.enum([
    'buttondown',
    'kit',
    'ghost',
    'beehiiv',
    'mailchimp',
    'x',
    'linkedin',
    'threads',
    'reddit',
    'instagram',
    'facebook',
    'youtube',
    'tiktok',
    'custom',
  ]),
  accountLabel: z.string().min(1, 'Enter an account label.').max(120, 'Account label is too long.'),
  externalAccountId: z.string().max(200, 'External account id is too long.').optional(),
  status: z.enum(['draft', 'connected', 'token_expired', 'revoked', 'disconnected', 'error']),
  defaultAudienceId: z.string().max(200, 'Default audience id is too long.').optional(),
  retryBackoffProfile: z.enum(['default', 'aggressive', 'conservative']).optional(),
  retryBackoffMultiplier: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!value.retryBackoffMultiplier) return;
  const parsed = Number.parseFloat(value.retryBackoffMultiplier);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Retry backoff multiplier must be a number between 0 and 5.',
      path: ['retryBackoffMultiplier'],
    });
  }
});

const accountTokenSchema = z
  .object({
    distributionAccountId: z.string().uuid('Choose a valid distribution account.'),
    tokenType: z.enum(['oauth', 'api_key', 'bearer_token', 'session_token']),
    accessTokenEncrypted: z.string().max(4000, 'Access token is too long.').optional(),
    refreshTokenEncrypted: z.string().max(4000, 'Refresh token is too long.').optional(),
    expiresAt: z.string().optional().or(z.literal('')),
    scopesCsv: z.string().max(1000, 'Scopes are too long.').optional(),
    accountStatus: z.enum(['draft', 'connected', 'token_expired', 'revoked', 'disconnected', 'error']),
  })
  .superRefine((value, ctx) => {
    if (!value.accessTokenEncrypted?.trim() && !value.refreshTokenEncrypted?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter at least one token value.',
        path: ['accessTokenEncrypted'],
      });
    }

    if (value.expiresAt) {
      const parsed = new Date(value.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid expiry time.',
          path: ['expiresAt'],
        });
      }
    }
  });

const assetSchema = z
  .object({
    assetId: z
      .string()
      .min(2, 'Enter an asset id.')
      .max(120, 'Asset id is too long.')
      .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, underscores, or hyphens only.'),
    sourceType: z.enum(['content_item', 'benchmark_insight', 'manual']),
    contentItemId: z.string().uuid('Choose a valid content item id.').optional(),
    sourceKey: z.string().max(200, 'Source key is too long.').optional(),
    assetType: z.enum([
      'newsletter_email',
      'link_post',
      'thread_post',
      'single_image_post',
      'carousel_post',
      'short_video_post',
      'long_video_post',
    ]),
    providerFamily: z.enum([
      'newsletter',
      'x',
      'linkedin',
      'threads',
      'reddit',
      'instagram',
      'facebook',
      'youtube',
      'tiktok',
      'generic',
    ]),
    title: z.string().max(200, 'Title is too long.').optional(),
    status: z.enum(['draft', 'review', 'approved', 'scheduled', 'published', 'failed', 'archived']),
    ctaUrl: z.string().url('Enter a valid CTA URL.').optional().or(z.literal('')),
    bodyMarkdown: z.string().optional(),
    bodyPlaintext: z.string().optional(),
    captionText: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === 'content_item' && !value.contentItemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a canonical content item for content-item sourced assets.',
        path: ['contentItemId'],
      });
    }
    if (value.sourceType !== 'content_item' && !value.sourceKey?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a source key for non-content-item assets.',
        path: ['sourceKey'],
      });
    }
  });

const assetMediaSchema = z.object({
  distributionAssetId: z.string().uuid('Choose a valid distribution asset.'),
  mediaKind: z.enum(['image', 'carousel_slide', 'video', 'thumbnail', 'document', 'audio']),
  providerReadyStatus: z.enum(['pending', 'ready', 'uploaded', 'invalid', 'failed']),
  storageUrlsText: z.string().min(1, 'Enter at least one media URL.'),
  mimeType: z.string().max(120, 'MIME type is too long.').optional(),
  altText: z.string().max(500, 'Alt text is too long.').optional(),
  caption: z.string().max(500, 'Caption is too long.').optional(),
});

const jobSchema = z
  .object({
    jobId: z
      .string()
      .min(2, 'Enter a job id.')
      .max(120, 'Job id is too long.')
      .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, underscores, or hyphens only.'),
    distributionAssetId: z.string().uuid('Choose a valid distribution asset.'),
    distributionAccountId: z.string().uuid('Choose a valid distribution account.'),
    publishMode: z.enum(['draft', 'scheduled', 'publish_now']),
    scheduledFor: z.string().optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.publishMode === 'scheduled' && !value.scheduledFor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a scheduled time for scheduled jobs.',
        path: ['scheduledFor'],
      });
      return;
    }

    if (value.scheduledFor) {
      const parsed = new Date(value.scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid scheduled time.',
          path: ['scheduledFor'],
        });
      }
    }
  });

const socialSeedSchema = z.object({
  distributionAccountId: z.string().uuid('Choose a valid social account.'),
  contentItemId: z.string().uuid('Choose a valid canonical content item.'),
  assetType: z.enum(['link_post', 'thread_post']),
  publishMode: z.enum(['draft', 'publish_now', 'scheduled']),
  scheduledFor: z.string().optional().or(z.literal('')),
});

const socialOauthStartSchema = z.object({
  distributionAccountId: z.string().uuid('Choose a valid social account.'),
});

export type DistributionEngineActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeScheduledFor(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseScopesCsv(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function parseRetryBackoffMultiplier(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 5);
}

function parseStorageUrls(value: string): string[] {
  const tokens = value
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return Array.from(new Set(tokens));
}

async function requireWritableDistributionEngine() {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const flags = resolveDistributionEngineFlags(context.env);
  if (!flags.uiEnabled) {
    return { ok: false as const, message: 'Distribution engine UI is feature-flagged off.' };
  }
  if (!flags.writeEnabled) {
    return { ok: false as const, message: 'Distribution engine write controls are feature-flagged off.' };
  }

  return context;
}

async function requireSocialOauthEnabled() {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const flags = resolveDistributionEngineFlags(context.env);
  if (!flags.socialOauthEnabled) {
    return {
      ok: false as const,
      message: 'Social OAuth is feature-flagged off in this environment.',
    };
  }

  return context;
}

export async function createDistributionAccount(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = accountSchema.safeParse({
    accountId: normalizeText(formData.get('accountId')),
    providerName: normalizeText(formData.get('providerName')),
    accountLabel: normalizeText(formData.get('accountLabel')),
    externalAccountId: normalizeText(formData.get('externalAccountId')),
    status: normalizeText(formData.get('status')),
    defaultAudienceId: normalizeText(formData.get('defaultAudienceId')),
    retryBackoffProfile: normalizeText(formData.get('retryBackoffProfile')),
    retryBackoffMultiplier: normalizeText(formData.get('retryBackoffMultiplier')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['accountId']?.[0] ??
        errors['providerName']?.[0] ??
        errors['accountLabel']?.[0] ??
        errors['externalAccountId']?.[0] ??
        errors['status']?.[0] ??
        errors['defaultAudienceId']?.[0] ??
        errors['retryBackoffProfile']?.[0] ??
        errors['retryBackoffMultiplier']?.[0] ??
        'Check the distribution account values.',
    };
  }

  const retryBackoffMultiplier = parseRetryBackoffMultiplier(parsed.data.retryBackoffMultiplier);

  await createDistributionEngineRepository(context.adminDb).upsertAccount({
    accountId: parsed.data.accountId,
    providerName: parsed.data.providerName,
    accountLabel: parsed.data.accountLabel,
    externalAccountId: parsed.data.externalAccountId ?? null,
    status: parsed.data.status,
    defaultAudienceId: parsed.data.defaultAudienceId ?? null,
    connectedByUserId: context.user.id,
    lastVerifiedAt: parsed.data.status === 'connected' ? new Date().toISOString() : null,
    metadata: {
      source: 'admin_manual',
      retry_backoff_profile: parsed.data.retryBackoffProfile ?? 'default',
      retry_backoff_multiplier: retryBackoffMultiplier,
    },
  });

  revalidatePath('/dashboard/distribution');
  return { ok: true, message: 'Distribution account saved.' };
}

export async function createDistributionAsset(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = assetSchema.safeParse({
    assetId: normalizeText(formData.get('assetId')),
    sourceType: normalizeText(formData.get('sourceType')),
    contentItemId: normalizeText(formData.get('contentItemId')),
    sourceKey: normalizeText(formData.get('sourceKey')),
    assetType: normalizeText(formData.get('assetType')),
    providerFamily: normalizeText(formData.get('providerFamily')),
    title: normalizeText(formData.get('title')),
    status: normalizeText(formData.get('status')),
    ctaUrl: normalizeText(formData.get('ctaUrl')) ?? '',
    bodyMarkdown: typeof formData.get('bodyMarkdown') === 'string' ? String(formData.get('bodyMarkdown')) : undefined,
    bodyPlaintext:
      typeof formData.get('bodyPlaintext') === 'string' ? String(formData.get('bodyPlaintext')) : undefined,
    captionText:
      typeof formData.get('captionText') === 'string' ? String(formData.get('captionText')) : undefined,
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['assetId']?.[0] ??
        errors['sourceType']?.[0] ??
        errors['contentItemId']?.[0] ??
        errors['sourceKey']?.[0] ??
        errors['assetType']?.[0] ??
        errors['providerFamily']?.[0] ??
        errors['title']?.[0] ??
        errors['status']?.[0] ??
        errors['ctaUrl']?.[0] ??
        'Check the distribution asset values.',
    };
  }

  await createDistributionEngineRepository(context.adminDb).upsertAsset({
    assetId: parsed.data.assetId,
    contentItemId: parsed.data.sourceType === 'content_item' ? parsed.data.contentItemId ?? null : null,
    sourceType: parsed.data.sourceType,
    sourceKey: parsed.data.sourceType === 'content_item' ? null : parsed.data.sourceKey ?? null,
    assetType: parsed.data.assetType,
    providerFamily: parsed.data.providerFamily,
    title: parsed.data.title ?? null,
    status: parsed.data.status,
    ctaUrl: parsed.data.ctaUrl || null,
    bodyMarkdown: parsed.data.bodyMarkdown ?? null,
    bodyPlaintext: parsed.data.bodyPlaintext ?? null,
    captionText: parsed.data.captionText ?? null,
    createdByUserId: context.user.id,
    metadata: { source: 'admin_manual' },
  });

  revalidatePath('/dashboard/distribution');
  return { ok: true, message: 'Distribution asset saved.' };
}

export async function saveDistributionAccountToken(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = accountTokenSchema.safeParse({
    distributionAccountId: normalizeText(formData.get('distributionAccountId')),
    tokenType: normalizeText(formData.get('tokenType')),
    accessTokenEncrypted: normalizeText(formData.get('accessTokenEncrypted')),
    refreshTokenEncrypted: normalizeText(formData.get('refreshTokenEncrypted')),
    expiresAt: normalizeText(formData.get('expiresAt')) ?? '',
    scopesCsv: normalizeText(formData.get('scopesCsv')),
    accountStatus: normalizeText(formData.get('accountStatus')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['distributionAccountId']?.[0] ??
        errors['tokenType']?.[0] ??
        errors['accessTokenEncrypted']?.[0] ??
        errors['refreshTokenEncrypted']?.[0] ??
        errors['expiresAt']?.[0] ??
        errors['scopesCsv']?.[0] ??
        errors['accountStatus']?.[0] ??
        'Check the distribution token values.',
    };
  }

  const repo = createDistributionEngineRepository(context.adminDb);
  await repo.upsertAccountToken({
    distributionAccountId: parsed.data.distributionAccountId,
    tokenType: parsed.data.tokenType,
    accessTokenEncrypted: parsed.data.accessTokenEncrypted ?? null,
    refreshTokenEncrypted: parsed.data.refreshTokenEncrypted ?? null,
    expiresAt: normalizeScheduledFor(parsed.data.expiresAt),
    scopes: parseScopesCsv(parsed.data.scopesCsv),
    metadata: {
      source: 'admin_manual',
      updated_by_user_id: context.user.id,
    },
  });

  const account = await repo.getAccountById(parsed.data.distributionAccountId);
  if (!account) {
    return { ok: false, message: 'Distribution account not found for token save.' };
  }

  await repo.upsertAccount({
    accountId: account.account_id,
    providerName: account.provider_name,
    accountLabel: account.account_label,
    externalAccountId: account.external_account_id,
    status: parsed.data.accountStatus,
    defaultAudienceId: account.default_audience_id,
    connectedByUserId: account.connected_by_user_id ?? context.user.id,
    lastVerifiedAt:
      parsed.data.accountStatus === 'connected' ? new Date().toISOString() : account.last_verified_at,
    metadata: {
      ...account.metadata,
      token_last_saved_at: new Date().toISOString(),
      token_last_saved_by_user_id: context.user.id,
    },
  });

  revalidatePath('/dashboard/distribution');
  return { ok: true, message: 'Distribution token and account status saved.' };
}

export async function createDistributionJob(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = jobSchema.safeParse({
    jobId: normalizeText(formData.get('jobId')),
    distributionAssetId: normalizeText(formData.get('distributionAssetId')),
    distributionAccountId: normalizeText(formData.get('distributionAccountId')),
    publishMode: normalizeText(formData.get('publishMode')),
    scheduledFor: normalizeText(formData.get('scheduledFor')) ?? '',
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['jobId']?.[0] ??
        errors['distributionAssetId']?.[0] ??
        errors['distributionAccountId']?.[0] ??
        errors['publishMode']?.[0] ??
        errors['scheduledFor']?.[0] ??
        'Check the distribution job values.',
    };
  }

  await createDistributionEngineRepository(context.adminDb).createJob({
    jobId: parsed.data.jobId,
    distributionAssetId: parsed.data.distributionAssetId,
    distributionAccountId: parsed.data.distributionAccountId,
    publishMode: parsed.data.publishMode,
    scheduledFor: normalizeScheduledFor(parsed.data.scheduledFor),
    createdByUserId: context.user.id,
  });

  revalidatePath('/dashboard/distribution');
  return { ok: true, message: 'Distribution job created.' };
}

export async function saveDistributionAssetMedia(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = assetMediaSchema.safeParse({
    distributionAssetId: normalizeText(formData.get('distributionAssetId')),
    mediaKind: normalizeText(formData.get('mediaKind')),
    providerReadyStatus: normalizeText(formData.get('providerReadyStatus')),
    storageUrlsText: typeof formData.get('storageUrlsText') === 'string' ? String(formData.get('storageUrlsText')) : '',
    mimeType: normalizeText(formData.get('mimeType')),
    altText: normalizeText(formData.get('altText')),
    caption: normalizeText(formData.get('caption')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['distributionAssetId']?.[0] ??
        errors['mediaKind']?.[0] ??
        errors['providerReadyStatus']?.[0] ??
        errors['storageUrlsText']?.[0] ??
        errors['mimeType']?.[0] ??
        errors['altText']?.[0] ??
        errors['caption']?.[0] ??
        'Check the media values.',
    };
  }

  const storageUrls = parseStorageUrls(parsed.data.storageUrlsText);
  if (storageUrls.length === 0) {
    return { ok: false, message: 'Enter at least one valid media URL.' };
  }

  await createDistributionEngineRepository(context.adminDb).replaceAssetMedia(
    parsed.data.distributionAssetId,
    storageUrls.map((url, index) => ({
      mediaKind: parsed.data.mediaKind,
      storageUrl: url,
      mimeType: parsed.data.mimeType ?? null,
      altText: parsed.data.altText ?? null,
      caption: parsed.data.caption ?? null,
      sortOrder: index,
      providerReadyStatus: parsed.data.providerReadyStatus,
      metadata: {
        source: 'admin_manual_media_seed',
        updated_by_user_id: context.user.id,
      },
    }))
  );

  revalidatePath('/dashboard/distribution');
  return { ok: true, message: `Saved ${storageUrls.length} media row(s) for asset.` };
}

export async function dispatchDueDistributionJobs(
  _prev: DistributionEngineActionState | null,
  _formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const env = await getPaymentApiEnv();
  const summary = await dispatchDistributionJobs(context.adminDb, env, { limit: 20 });

  revalidatePath('/dashboard/distribution');
  revalidatePath('/dashboard/logs');
  return {
    ok: true,
    message: `Scanned ${summary.scanned} jobs. Succeeded: ${summary.succeeded}. Failed: ${summary.failed}.`,
  };
}

export async function seedSocialDistributionJob(
  _prev: DistributionEngineActionState | null,
  formData: FormData
): Promise<DistributionEngineActionState> {
  const context = await requireWritableDistributionEngine();
  if (!context.ok) return context;

  const parsed = socialSeedSchema.safeParse({
    distributionAccountId: normalizeText(formData.get('distributionAccountId')),
    contentItemId: normalizeText(formData.get('contentItemId')),
    assetType: normalizeText(formData.get('assetType')),
    publishMode: normalizeText(formData.get('publishMode')),
    scheduledFor: normalizeText(formData.get('scheduledFor')) ?? '',
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['distributionAccountId']?.[0] ??
        errors['contentItemId']?.[0] ??
        errors['assetType']?.[0] ??
        errors['publishMode']?.[0] ??
        errors['scheduledFor']?.[0] ??
        'Check the social seed values.',
    };
  }

  if (parsed.data.publishMode === 'scheduled' && !parsed.data.scheduledFor) {
    return { ok: false, message: 'Enter a scheduled time for scheduled social jobs.' };
  }

  const repo = createDistributionEngineRepository(context.adminDb);
  const account = await repo.getAccountById(parsed.data.distributionAccountId);
  if (!account) {
    return { ok: false, message: 'Distribution account not found.' };
  }
  if (account.provider_name !== 'x' && account.provider_name !== 'linkedin') {
    return { ok: false, message: 'Social seed currently supports x/linkedin accounts only.' };
  }
  if (account.status !== 'connected') {
    return {
      ok: false,
      message: `Account must be connected before social seeding (current: ${account.status}).`,
    };
  }

  const tokens = await repo.listAccountTokensForAccount(account.id);
  if (tokens.length === 0) {
    return {
      ok: false,
      message: 'No token is stored for this account. Save a token row before seeding social jobs.',
    };
  }

  const { data: contentItem, error: contentError } = await context.adminDb
    .from('content_items')
    .select('id,content_id,title,draft_markdown,brief_markdown,canonical_url')
    .eq('id', parsed.data.contentItemId)
    .maybeSingle<{
      id: string;
      content_id: string;
      title: string;
      draft_markdown: string | null;
      brief_markdown: string | null;
      canonical_url: string | null;
    }>();

  if (contentError) {
    return { ok: false, message: `Could not load content item: ${contentError.message}` };
  }
  if (!contentItem) {
    return { ok: false, message: 'Content item not found.' };
  }

  const markdownBody = contentItem.draft_markdown ?? contentItem.brief_markdown ?? null;
  if (!markdownBody?.trim()) {
    return {
      ok: false,
      message: 'Selected content has no draft/brief markdown body to seed into a social asset.',
    };
  }

  if (parsed.data.publishMode === 'scheduled') {
    const scheduled = normalizeScheduledFor(parsed.data.scheduledFor);
    if (!scheduled) {
      return { ok: false, message: 'Enter a valid scheduled time for scheduled social jobs.' };
    }
    if (new Date(scheduled).getTime() <= Date.now()) {
      return { ok: false, message: 'Scheduled social jobs must be set in the future.' };
    }
  }

  const now = new Date();
  const suffix = now
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('-', '')
    .replaceAll('.', '')
    .replace('T', '_')
    .replace('Z', '');
  const randomSuffix = randomUUID().slice(0, 8);

  const assetId = `${account.provider_name}_${contentItem.content_id}_${suffix}_${randomSuffix}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 120);
  const jobId = `job_${assetId}`.slice(0, 120);

  const asset = await repo.upsertAsset({
    assetId,
    contentItemId: contentItem.id,
    sourceType: 'content_item',
    assetType: parsed.data.assetType,
    providerFamily: account.provider_name,
    title: contentItem.title,
    bodyMarkdown: markdownBody,
    ctaUrl: contentItem.canonical_url ?? null,
    status: 'approved',
    createdByUserId: context.user.id,
    approvedByUserId: context.user.id,
    approvedAt: new Date().toISOString(),
    metadata: {
      source: 'social_seed_quick_create',
      seeded_by_user_id: context.user.id,
      seeded_at: new Date().toISOString(),
    },
  });

  await repo.createJob({
    jobId,
    distributionAssetId: asset.id,
    distributionAccountId: account.id,
    publishMode: parsed.data.publishMode,
    scheduledFor: normalizeScheduledFor(parsed.data.scheduledFor),
    createdByUserId: context.user.id,
  });

  revalidatePath('/dashboard/distribution');
  return {
    ok: true,
    message: `Seeded ${account.provider_name} asset/job for ${contentItem.content_id}.`,
  };
}

export async function startSocialDistributionOauthConnect(formData: FormData): Promise<void> {
  const context = await requireSocialOauthEnabled();
  if (!context.ok) {
    throw new Error(context.message);
  }

  const parsed = socialOauthStartSchema.safeParse({
    distributionAccountId: normalizeText(formData.get('distributionAccountId')),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.flatten().fieldErrors['distributionAccountId']?.[0] ?? 'Invalid social account.');
  }

  const repo = createDistributionEngineRepository(context.adminDb);
  const account = await repo.getAccountById(parsed.data.distributionAccountId);
  if (!account) throw new Error('Distribution account not found.');
  if (account.provider_name !== 'x' && account.provider_name !== 'linkedin') {
    throw new Error('Social OAuth connect supports x/linkedin accounts only.');
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.trim() || context.env.NEXT_PUBLIC_APP_URL?.trim();
  const stateSecret = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim() || context.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!appUrl || !stateSecret) {
    throw new Error('OAuth is not configured: missing app URL or state secret.');
  }

  const authorizeUrl = buildSocialOAuthAuthorizeUrl({
    provider: account.provider_name,
    accountId: account.id,
    userId: context.user.id,
    appUrl,
    stateSecret,
    xClientId: process.env['X_OAUTH_CLIENT_ID'],
    linkedinClientId: process.env['LINKEDIN_OAUTH_CLIENT_ID'],
    xAuthorizeUrl: process.env['X_OAUTH_AUTH_URL'],
    linkedinAuthorizeUrl: process.env['LINKEDIN_OAUTH_AUTH_URL'],
    xScope: process.env['X_OAUTH_SCOPE'],
    linkedinScope: process.env['LINKEDIN_OAUTH_SCOPE'],
  });

  redirect(authorizeUrl);
}
