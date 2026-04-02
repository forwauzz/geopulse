'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { dispatchDistributionJobs } from '@/lib/server/distribution-job-dispatcher';
import { createDistributionEngineRepository } from '@/lib/server/distribution-engine-repository';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';

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
        'Check the distribution account values.',
    };
  }

  await createDistributionEngineRepository(context.adminDb).upsertAccount({
    accountId: parsed.data.accountId,
    providerName: parsed.data.providerName,
    accountLabel: parsed.data.accountLabel,
    externalAccountId: parsed.data.externalAccountId ?? null,
    status: parsed.data.status,
    defaultAudienceId: parsed.data.defaultAudienceId ?? null,
    connectedByUserId: context.user.id,
    lastVerifiedAt: parsed.data.status === 'connected' ? new Date().toISOString() : null,
    metadata: { source: 'admin_manual' },
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
