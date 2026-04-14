import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = SupabaseClient<any, 'public', any>;

export type DistributionProviderName =
  | 'buttondown'
  | 'kit'
  | 'ghost'
  | 'beehiiv'
  | 'mailchimp'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'reddit'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'custom';

export type DistributionAccountStatus =
  | 'draft'
  | 'connected'
  | 'token_expired'
  | 'revoked'
  | 'disconnected'
  | 'error';

export type DistributionTokenType = 'oauth' | 'api_key' | 'bearer_token' | 'session_token';

export type DistributionAssetSourceType = 'content_item' | 'benchmark_insight' | 'manual';

export type DistributionAssetType =
  | 'newsletter_email'
  | 'link_post'
  | 'thread_post'
  | 'single_image_post'
  | 'carousel_post'
  | 'short_video_post'
  | 'long_video_post';

export type DistributionProviderFamily =
  | 'newsletter'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'reddit'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'generic';

export type DistributionAssetStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'archived';

export type DistributionMediaKind =
  | 'image'
  | 'carousel_slide'
  | 'video'
  | 'thumbnail'
  | 'document'
  | 'audio';

export type DistributionMediaReadyStatus = 'pending' | 'ready' | 'uploaded' | 'invalid' | 'failed';

export type DistributionPublishMode = 'draft' | 'scheduled' | 'publish_now';

export type DistributionJobStatus =
  | 'draft'
  | 'queued'
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled';

export type DistributionAccountRow = {
  readonly id: string;
  readonly account_id: string;
  readonly provider_name: DistributionProviderName;
  readonly account_label: string;
  readonly external_account_id: string | null;
  readonly status: DistributionAccountStatus;
  readonly default_audience_id: string | null;
  readonly metadata: Record<string, unknown>;
  readonly connected_by_user_id: string | null;
  readonly last_verified_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DistributionAccountTokenRow = {
  readonly id: string;
  readonly distribution_account_id: string;
  readonly token_type: DistributionTokenType;
  readonly access_token_encrypted: string | null;
  readonly refresh_token_encrypted: string | null;
  readonly expires_at: string | null;
  readonly scopes: unknown[];
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DistributionAssetRow = {
  readonly id: string;
  readonly asset_id: string;
  readonly content_item_id: string | null;
  readonly source_type: DistributionAssetSourceType;
  readonly source_key: string | null;
  readonly asset_type: DistributionAssetType;
  readonly provider_family: DistributionProviderFamily;
  readonly title: string | null;
  readonly body_markdown: string | null;
  readonly body_plaintext: string | null;
  readonly caption_text: string | null;
  readonly status: DistributionAssetStatus;
  readonly cta_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_by_user_id: string | null;
  readonly approved_by_user_id: string | null;
  readonly approved_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DistributionAssetMediaRow = {
  readonly id: string;
  readonly distribution_asset_id: string;
  readonly media_kind: DistributionMediaKind;
  readonly storage_url: string;
  readonly mime_type: string | null;
  readonly alt_text: string | null;
  readonly caption: string | null;
  readonly sort_order: number;
  readonly provider_ready_status: DistributionMediaReadyStatus;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DistributionJobRow = {
  readonly id: string;
  readonly job_id: string;
  readonly distribution_asset_id: string;
  readonly distribution_account_id: string;
  readonly publish_mode: DistributionPublishMode;
  readonly scheduled_for: string | null;
  readonly status: DistributionJobStatus;
  readonly destination_url: string | null;
  readonly provider_post_id: string | null;
  readonly last_error: string | null;
  readonly created_by_user_id: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DistributionJobAttemptRow = {
  readonly id: string;
  readonly distribution_job_id: string;
  readonly attempt_number: number;
  readonly request_summary: Record<string, unknown>;
  readonly response_summary: Record<string, unknown>;
  readonly provider_status_code: number | null;
  readonly error_message: string | null;
  readonly created_at: string;
};

export type DistributionAccountUpsertInput = {
  readonly accountId: string;
  readonly providerName: DistributionProviderName;
  readonly accountLabel: string;
  readonly externalAccountId?: string | null;
  readonly status?: DistributionAccountStatus;
  readonly defaultAudienceId?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly connectedByUserId?: string | null;
  readonly lastVerifiedAt?: string | null;
};

export type DistributionAccountTokenUpsertInput = {
  readonly distributionAccountId: string;
  readonly tokenType: DistributionTokenType;
  readonly accessTokenEncrypted?: string | null;
  readonly refreshTokenEncrypted?: string | null;
  readonly expiresAt?: string | null;
  readonly scopes?: unknown[];
  readonly metadata?: Record<string, unknown>;
};

export type DistributionAssetUpsertInput = {
  readonly assetId: string;
  readonly contentItemId?: string | null;
  readonly sourceType?: DistributionAssetSourceType;
  readonly sourceKey?: string | null;
  readonly assetType: DistributionAssetType;
  readonly providerFamily: DistributionProviderFamily;
  readonly title?: string | null;
  readonly bodyMarkdown?: string | null;
  readonly bodyPlaintext?: string | null;
  readonly captionText?: string | null;
  readonly status?: DistributionAssetStatus;
  readonly ctaUrl?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdByUserId?: string | null;
  readonly approvedByUserId?: string | null;
  readonly approvedAt?: string | null;
};

export type DistributionAssetMediaInput = {
  readonly mediaKind: DistributionMediaKind;
  readonly storageUrl: string;
  readonly mimeType?: string | null;
  readonly altText?: string | null;
  readonly caption?: string | null;
  readonly sortOrder?: number;
  readonly providerReadyStatus?: DistributionMediaReadyStatus;
  readonly metadata?: Record<string, unknown>;
};

export type DistributionJobCreateInput = {
  readonly jobId: string;
  readonly distributionAssetId: string;
  readonly distributionAccountId: string;
  readonly publishMode: DistributionPublishMode;
  readonly scheduledFor?: string | null;
  readonly status?: DistributionJobStatus;
  readonly destinationUrl?: string | null;
  readonly providerPostId?: string | null;
  readonly lastError?: string | null;
  readonly createdByUserId?: string | null;
  readonly completedAt?: string | null;
};

export type DistributionJobUpdateInput = {
  readonly status?: DistributionJobStatus;
  readonly scheduledFor?: string | null;
  readonly destinationUrl?: string | null;
  readonly providerPostId?: string | null;
  readonly lastError?: string | null;
  readonly completedAt?: string | null;
};

export type DistributionJobAttemptCreateInput = {
  readonly distributionJobId: string;
  readonly attemptNumber: number;
  readonly requestSummary?: Record<string, unknown>;
  readonly responseSummary?: Record<string, unknown>;
  readonly providerStatusCode?: number | null;
  readonly errorMessage?: string | null;
};

function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    ...(incoming ?? {}),
  };
}

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const ACCOUNT_SELECT =
  'id,account_id,provider_name,account_label,external_account_id,status,default_audience_id,metadata,connected_by_user_id,last_verified_at,created_at,updated_at';
const ACCOUNT_TOKEN_SELECT =
  'id,distribution_account_id,token_type,access_token_encrypted,refresh_token_encrypted,expires_at,scopes,metadata,created_at,updated_at';
const ASSET_SELECT =
  'id,asset_id,content_item_id,source_type,source_key,asset_type,provider_family,title,body_markdown,body_plaintext,caption_text,status,cta_url,metadata,created_by_user_id,approved_by_user_id,approved_at,created_at,updated_at';
const ASSET_MEDIA_SELECT =
  'id,distribution_asset_id,media_kind,storage_url,mime_type,alt_text,caption,sort_order,provider_ready_status,metadata,created_at,updated_at';
const JOB_SELECT =
  'id,job_id,distribution_asset_id,distribution_account_id,publish_mode,scheduled_for,status,destination_url,provider_post_id,last_error,created_by_user_id,completed_at,created_at,updated_at';
const JOB_ATTEMPT_SELECT =
  'id,distribution_job_id,attempt_number,request_summary,response_summary,provider_status_code,error_message,created_at';

function normalizeAccount(row: DistributionAccountRow): DistributionAccountRow {
  return {
    ...row,
    metadata: readMetadata(row.metadata),
  };
}

function normalizeAccountToken(row: DistributionAccountTokenRow): DistributionAccountTokenRow {
  return {
    ...row,
    scopes: readArray(row.scopes),
    metadata: readMetadata(row.metadata),
  };
}

function normalizeAsset(row: DistributionAssetRow): DistributionAssetRow {
  return {
    ...row,
    metadata: readMetadata(row.metadata),
  };
}

function normalizeAssetMedia(row: DistributionAssetMediaRow): DistributionAssetMediaRow {
  return {
    ...row,
    metadata: readMetadata(row.metadata),
  };
}

function normalizeJobAttempt(row: DistributionJobAttemptRow): DistributionJobAttemptRow {
  return {
    ...row,
    request_summary: readMetadata(row.request_summary),
    response_summary: readMetadata(row.response_summary),
  };
}

export function createDistributionEngineRepository(supabase: SupabaseLike) {
  return {
    async listAccounts(filters?: {
      readonly providerName?: DistributionProviderName | null;
      readonly status?: DistributionAccountStatus | null;
    }): Promise<DistributionAccountRow[]> {
      let query = supabase
        .from('distribution_accounts')
        .select(ACCOUNT_SELECT)
        .order('provider_name', { ascending: true })
        .order('account_label', { ascending: true });

      if (filters?.providerName) {
        query = query.eq('provider_name', filters.providerName);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as DistributionAccountRow[]).map(normalizeAccount);
    },

    async getAccountByAccountId(accountId: string): Promise<DistributionAccountRow | null> {
      const { data, error } = await supabase
        .from('distribution_accounts')
        .select(ACCOUNT_SELECT)
        .eq('account_id', accountId)
        .maybeSingle<DistributionAccountRow>();

      if (error) throw error;
      return data ? normalizeAccount(data) : null;
    },

    async getAccountById(id: string): Promise<DistributionAccountRow | null> {
      const { data, error } = await supabase
        .from('distribution_accounts')
        .select(ACCOUNT_SELECT)
        .eq('id', id)
        .maybeSingle<DistributionAccountRow>();

      if (error) throw error;
      return data ? normalizeAccount(data) : null;
    },

    async upsertAccount(input: DistributionAccountUpsertInput): Promise<DistributionAccountRow> {
      const existing = await this.getAccountByAccountId(input.accountId.trim());

      const { data, error } = await supabase
        .from('distribution_accounts')
        .upsert(
          {
            account_id: input.accountId.trim(),
            provider_name: input.providerName,
            account_label: input.accountLabel.trim(),
            external_account_id: input.externalAccountId?.trim() || null,
            status: input.status ?? existing?.status ?? 'draft',
            default_audience_id: input.defaultAudienceId?.trim() || null,
            metadata: mergeMetadata(existing?.metadata, input.metadata),
            connected_by_user_id: input.connectedByUserId ?? existing?.connected_by_user_id ?? null,
            last_verified_at: input.lastVerifiedAt ?? existing?.last_verified_at ?? null,
          },
          { onConflict: 'account_id' }
        )
        .select(ACCOUNT_SELECT)
        .single<DistributionAccountRow>();

      if (error) throw error;
      return normalizeAccount(data);
    },

    async upsertAccountToken(
      input: DistributionAccountTokenUpsertInput
    ): Promise<DistributionAccountTokenRow> {
      const { data, error } = await supabase
        .from('distribution_account_tokens')
        .upsert(
          {
            distribution_account_id: input.distributionAccountId,
            token_type: input.tokenType,
            access_token_encrypted: input.accessTokenEncrypted ?? null,
            refresh_token_encrypted: input.refreshTokenEncrypted ?? null,
            expires_at: input.expiresAt ?? null,
            scopes: input.scopes ?? [],
            metadata: input.metadata ?? {},
          },
          { onConflict: 'distribution_account_id,token_type' }
        )
        .select(ACCOUNT_TOKEN_SELECT)
        .single<DistributionAccountTokenRow>();

      if (error) throw error;
      return normalizeAccountToken(data);
    },

    async listAccountTokensForAccount(
      distributionAccountId: string
    ): Promise<DistributionAccountTokenRow[]> {
      const { data, error } = await supabase
        .from('distribution_account_tokens')
        .select(ACCOUNT_TOKEN_SELECT)
        .eq('distribution_account_id', distributionAccountId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return ((data ?? []) as DistributionAccountTokenRow[]).map(normalizeAccountToken);
    },

    async listAssets(filters?: {
      readonly sourceType?: DistributionAssetSourceType | null;
      readonly providerFamily?: DistributionProviderFamily | null;
      readonly status?: DistributionAssetStatus | null;
    }): Promise<DistributionAssetRow[]> {
      let query = supabase
        .from('distribution_assets')
        .select(ASSET_SELECT)
        .order('created_at', { ascending: false });

      if (filters?.sourceType) {
        query = query.eq('source_type', filters.sourceType);
      }
      if (filters?.providerFamily) {
        query = query.eq('provider_family', filters.providerFamily);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as DistributionAssetRow[]).map(normalizeAsset);
    },

    async getAssetByAssetId(assetId: string): Promise<DistributionAssetRow | null> {
      const { data, error } = await supabase
        .from('distribution_assets')
        .select(ASSET_SELECT)
        .eq('asset_id', assetId)
        .maybeSingle<DistributionAssetRow>();

      if (error) throw error;
      return data ? normalizeAsset(data) : null;
    },

    async getAssetById(id: string): Promise<DistributionAssetRow | null> {
      const { data, error } = await supabase
        .from('distribution_assets')
        .select(ASSET_SELECT)
        .eq('id', id)
        .maybeSingle<DistributionAssetRow>();

      if (error) throw error;
      return data ? normalizeAsset(data) : null;
    },

    async upsertAsset(input: DistributionAssetUpsertInput): Promise<DistributionAssetRow> {
      const existing = await this.getAssetByAssetId(input.assetId.trim());
      const sourceType = input.sourceType ?? existing?.source_type ?? 'content_item';

      const { data, error } = await supabase
        .from('distribution_assets')
        .upsert(
          {
            asset_id: input.assetId.trim(),
            content_item_id: input.contentItemId ?? existing?.content_item_id ?? null,
            source_type: sourceType,
            source_key: input.sourceKey?.trim() || null,
            asset_type: input.assetType,
            provider_family: input.providerFamily,
            title: input.title?.trim() || null,
            body_markdown: input.bodyMarkdown ?? null,
            body_plaintext: input.bodyPlaintext ?? null,
            caption_text: input.captionText ?? null,
            status: input.status ?? existing?.status ?? 'draft',
            cta_url: input.ctaUrl?.trim() || null,
            metadata: mergeMetadata(existing?.metadata, input.metadata),
            created_by_user_id: input.createdByUserId ?? existing?.created_by_user_id ?? null,
            approved_by_user_id: input.approvedByUserId ?? existing?.approved_by_user_id ?? null,
            approved_at: input.approvedAt ?? existing?.approved_at ?? null,
          },
          { onConflict: 'asset_id' }
        )
        .select(ASSET_SELECT)
        .single<DistributionAssetRow>();

      if (error) throw error;
      return normalizeAsset(data);
    },

    async replaceAssetMedia(
      distributionAssetId: string,
      media: ReadonlyArray<DistributionAssetMediaInput>
    ): Promise<DistributionAssetMediaRow[]> {
      const { error: deleteError } = await supabase
        .from('distribution_asset_media')
        .delete()
        .eq('distribution_asset_id', distributionAssetId);

      if (deleteError) throw deleteError;
      if (media.length === 0) return [];

      const { data, error } = await supabase
        .from('distribution_asset_media')
        .insert(
          media.map((item, index) => ({
            distribution_asset_id: distributionAssetId,
            media_kind: item.mediaKind,
            storage_url: item.storageUrl.trim(),
            mime_type: item.mimeType?.trim() || null,
            alt_text: item.altText?.trim() || null,
            caption: item.caption?.trim() || null,
            sort_order: item.sortOrder ?? index,
            provider_ready_status: item.providerReadyStatus ?? 'pending',
            metadata: item.metadata ?? {},
          }))
        )
        .select(ASSET_MEDIA_SELECT);

      if (error) throw error;
      return ((data ?? []) as DistributionAssetMediaRow[]).map(normalizeAssetMedia);
    },

    async listMediaForAsset(distributionAssetId: string): Promise<DistributionAssetMediaRow[]> {
      const { data, error } = await supabase
        .from('distribution_asset_media')
        .select(ASSET_MEDIA_SELECT)
        .eq('distribution_asset_id', distributionAssetId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as DistributionAssetMediaRow[]).map(normalizeAssetMedia);
    },

    async createJob(input: DistributionJobCreateInput): Promise<DistributionJobRow> {
      const initialStatus = input.status ?? (input.publishMode === 'scheduled' ? 'scheduled' : 'queued');

      const { data, error } = await supabase
        .from('distribution_jobs')
        .insert({
          job_id: input.jobId.trim(),
          distribution_asset_id: input.distributionAssetId,
          distribution_account_id: input.distributionAccountId,
          publish_mode: input.publishMode,
          scheduled_for: input.scheduledFor ?? null,
          status: initialStatus,
          destination_url: input.destinationUrl ?? null,
          provider_post_id: input.providerPostId ?? null,
          last_error: input.lastError ?? null,
          created_by_user_id: input.createdByUserId ?? null,
          completed_at: input.completedAt ?? null,
        })
        .select(JOB_SELECT)
        .single<DistributionJobRow>();

      if (error) throw error;
      return data;
    },

    async getJobByJobId(jobId: string): Promise<DistributionJobRow | null> {
      const { data, error } = await supabase
        .from('distribution_jobs')
        .select(JOB_SELECT)
        .eq('job_id', jobId)
        .maybeSingle<DistributionJobRow>();

      if (error) throw error;
      return data ?? null;
    },

    async getJobById(id: string): Promise<DistributionJobRow | null> {
      const { data, error } = await supabase
        .from('distribution_jobs')
        .select(JOB_SELECT)
        .eq('id', id)
        .maybeSingle<DistributionJobRow>();

      if (error) throw error;
      return data ?? null;
    },

    async updateJob(id: string, input: DistributionJobUpdateInput): Promise<DistributionJobRow> {
      const { data, error } = await supabase
        .from('distribution_jobs')
        .update({
          status: input.status,
          scheduled_for: input.scheduledFor,
          destination_url: input.destinationUrl,
          provider_post_id: input.providerPostId,
          last_error: input.lastError,
          completed_at: input.completedAt,
        })
        .eq('id', id)
        .select(JOB_SELECT)
        .single<DistributionJobRow>();

      if (error) throw error;
      return data;
    },

    async listDispatchableJobs(args?: {
      readonly now?: string;
      readonly limit?: number;
    }): Promise<DistributionJobRow[]> {
      const now = args?.now ?? new Date().toISOString();
      const limit = args?.limit ?? 20;

      const { data, error } = await supabase
        .from('distribution_jobs')
        .select(JOB_SELECT)
        .in('status', ['queued', 'scheduled'])
        .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
        .order('scheduled_for', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as DistributionJobRow[];
    },

    async createJobAttempt(
      input: DistributionJobAttemptCreateInput
    ): Promise<DistributionJobAttemptRow> {
      const { data, error } = await supabase
        .from('distribution_job_attempts')
        .insert({
          distribution_job_id: input.distributionJobId,
          attempt_number: input.attemptNumber,
          request_summary: input.requestSummary ?? {},
          response_summary: input.responseSummary ?? {},
          provider_status_code: input.providerStatusCode ?? null,
          error_message: input.errorMessage ?? null,
        })
        .select(JOB_ATTEMPT_SELECT)
        .single<DistributionJobAttemptRow>();

      if (error) throw error;
      return normalizeJobAttempt(data);
    },

    async listJobAttempts(distributionJobId: string): Promise<DistributionJobAttemptRow[]> {
      const { data, error } = await supabase
        .from('distribution_job_attempts')
        .select(JOB_ATTEMPT_SELECT)
        .eq('distribution_job_id', distributionJobId)
        .order('attempt_number', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as DistributionJobAttemptRow[]).map(normalizeJobAttempt);
    },
  };
}
