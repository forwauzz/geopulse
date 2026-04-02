type SupabaseLike = {
  from(table: string): any;
};

export type DistributionEngineAccountAdminRow = {
  readonly id: string;
  readonly account_id: string;
  readonly provider_name: string;
  readonly account_label: string;
  readonly external_account_id: string | null;
  readonly status: string;
  readonly default_audience_id: string | null;
  readonly metadata: Record<string, unknown>;
  readonly connected_by_user_id: string | null;
  readonly last_verified_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly token_count: number;
  readonly latest_token_expiry: string | null;
};

export type DistributionEngineAssetAdminRow = {
  readonly id: string;
  readonly asset_id: string;
  readonly content_item_id: string | null;
  readonly source_type: string;
  readonly source_key: string | null;
  readonly asset_type: string;
  readonly provider_family: string;
  readonly title: string | null;
  readonly status: string;
  readonly cta_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_by_user_id: string | null;
  readonly approved_by_user_id: string | null;
  readonly approved_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly media_count: number;
};

export type DistributionEngineJobAdminRow = {
  readonly id: string;
  readonly job_id: string;
  readonly distribution_asset_id: string;
  readonly distribution_account_id: string;
  readonly publish_mode: string;
  readonly scheduled_for: string | null;
  readonly status: string;
  readonly destination_url: string | null;
  readonly provider_post_id: string | null;
  readonly last_error: string | null;
  readonly created_by_user_id: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly attempt_count: number;
  readonly latest_attempt_error: string | null;
};

export type DistributionEngineOverview = {
  readonly accounts: DistributionEngineAccountAdminRow[];
  readonly assets: DistributionEngineAssetAdminRow[];
  readonly jobs: DistributionEngineJobAdminRow[];
};

type DistributionAccountTokenRow = {
  readonly distribution_account_id: string;
  readonly expires_at: string | null;
};

type DistributionAssetMediaRow = {
  readonly distribution_asset_id: string;
};

type DistributionJobAttemptRow = {
  readonly distribution_job_id: string;
  readonly error_message: string | null;
  readonly created_at: string;
};

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function maxIsoDate(values: Array<string | null>): string | null {
  const filtered = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function createDistributionEngineAdminData(supabase: SupabaseLike) {
  return {
    async getOverview(): Promise<DistributionEngineOverview> {
      const [accountsResult, tokensResult, assetsResult, mediaResult, jobsResult, attemptsResult] =
        await Promise.all([
          supabase
            .from('distribution_accounts')
            .select(
              'id,account_id,provider_name,account_label,external_account_id,status,default_audience_id,metadata,connected_by_user_id,last_verified_at,created_at,updated_at'
            )
            .order('provider_name', { ascending: true })
            .order('account_label', { ascending: true }),
          supabase
            .from('distribution_account_tokens')
            .select('distribution_account_id,expires_at')
            .order('expires_at', { ascending: false }),
          supabase
            .from('distribution_assets')
            .select(
              'id,asset_id,content_item_id,source_type,source_key,asset_type,provider_family,title,status,cta_url,metadata,created_by_user_id,approved_by_user_id,approved_at,created_at,updated_at'
            )
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('distribution_asset_media')
            .select('distribution_asset_id')
            .order('created_at', { ascending: false }),
          supabase
            .from('distribution_jobs')
            .select(
              'id,job_id,distribution_asset_id,distribution_account_id,publish_mode,scheduled_for,status,destination_url,provider_post_id,last_error,created_by_user_id,completed_at,created_at,updated_at'
            )
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('distribution_job_attempts')
            .select('distribution_job_id,error_message,created_at')
            .order('created_at', { ascending: false }),
        ]);

      if (accountsResult.error) throw accountsResult.error;
      if (tokensResult.error) throw tokensResult.error;
      if (assetsResult.error) throw assetsResult.error;
      if (mediaResult.error) throw mediaResult.error;
      if (jobsResult.error) throw jobsResult.error;
      if (attemptsResult.error) throw attemptsResult.error;

      const tokenRows = (tokensResult.data ?? []) as DistributionAccountTokenRow[];
      const mediaRows = (mediaResult.data ?? []) as DistributionAssetMediaRow[];
      const attemptRows = (attemptsResult.data ?? []) as DistributionJobAttemptRow[];

      const tokenRowsByAccount = new Map<string, DistributionAccountTokenRow[]>();
      for (const token of tokenRows) {
        const existing = tokenRowsByAccount.get(token.distribution_account_id) ?? [];
        existing.push(token);
        tokenRowsByAccount.set(token.distribution_account_id, existing);
      }

      const mediaCountByAsset = new Map<string, number>();
      for (const media of mediaRows) {
        mediaCountByAsset.set(
          media.distribution_asset_id,
          (mediaCountByAsset.get(media.distribution_asset_id) ?? 0) + 1
        );
      }

      const attemptsByJob = new Map<string, DistributionJobAttemptRow[]>();
      for (const attempt of attemptRows) {
        const existing = attemptsByJob.get(attempt.distribution_job_id) ?? [];
        existing.push(attempt);
        attemptsByJob.set(attempt.distribution_job_id, existing);
      }

      const accounts = ((accountsResult.data ?? []) as Array<Omit<DistributionEngineAccountAdminRow, 'token_count' | 'latest_token_expiry'>>).map(
        (row) => {
          const tokens = tokenRowsByAccount.get(row.id) ?? [];
          return {
            ...row,
            metadata: readMetadata(row.metadata),
            token_count: tokens.length,
            latest_token_expiry: maxIsoDate(tokens.map((token) => token.expires_at)),
          };
        }
      );

      const assets = ((assetsResult.data ?? []) as Array<Omit<DistributionEngineAssetAdminRow, 'media_count'>>).map(
        (row) => ({
          ...row,
          metadata: readMetadata(row.metadata),
          media_count: mediaCountByAsset.get(row.id) ?? 0,
        })
      );

      const jobs = ((jobsResult.data ?? []) as Array<
        Omit<DistributionEngineJobAdminRow, 'attempt_count' | 'latest_attempt_error'>
      >).map((row) => {
        const attempts = attemptsByJob.get(row.id) ?? [];
        return {
          ...row,
          attempt_count: attempts.length,
          latest_attempt_error: attempts.find((attempt) => attempt.error_message)?.error_message ?? null,
        };
      });

      return { accounts, assets, jobs };
    },
  };
}
