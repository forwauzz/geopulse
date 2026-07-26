import type { SupabaseClient } from '@supabase/supabase-js';
import { createDistributionEngineRepository } from './distribution-engine-repository';
import { scoreInstagramPerformance } from './instagram-organic-strategy';

export type InstagramPerformanceSnapshot = {
  readonly views: number;
  readonly reach: number;
  readonly likes: number;
  readonly comments: number;
  readonly saves: number;
  readonly shares: number;
  readonly follows: number;
  readonly profileActivity: number;
};

export const INSTAGRAM_MEDIA_INSIGHT_METRICS =
  'views,reach,saved,shares,total_interactions';

function finite(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseInstagramInsights(
  media: Record<string, unknown>,
  insightPayload: Record<string, unknown>
): InstagramPerformanceSnapshot {
  const data = Array.isArray(insightPayload['data']) ? insightPayload['data'] : [];
  const metrics = new Map<string, number>();
  for (const item of data) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const name = typeof row['name'] === 'string' ? row['name'] : '';
    const values = Array.isArray(row['values']) ? row['values'] : [];
    const first = values[0] && typeof values[0] === 'object'
      ? (values[0] as Record<string, unknown>)
      : {};
    if (name) metrics.set(name, finite(first['value']));
  }
  return {
    views: metrics.get('views') ?? metrics.get('plays') ?? 0,
    reach: metrics.get('reach') ?? 0,
    likes: finite(media['like_count']),
    comments: finite(media['comments_count']),
    saves: metrics.get('saved') ?? 0,
    shares: metrics.get('shares') ?? 0,
    follows: metrics.get('follows') ?? 0,
    profileActivity: metrics.get('profile_activity') ?? 0,
  };
}

export async function collectInstagramPerformance(args: {
  readonly supabase: SupabaseClient;
  readonly graphBaseUrl?: string;
  readonly now?: Date;
}): Promise<{ checked: number; updated: number; failed: number }> {
  const repo = createDistributionEngineRepository(args.supabase as never);
  const accounts = await repo.listAccounts({ providerName: 'instagram', status: 'connected' });
  const account = accounts[0];
  if (!account) return { checked: 0, updated: 0, failed: 0 };
  const token = (await repo.listAccountTokensForAccount(account.id))[0]?.access_token_encrypted?.trim();
  if (!token) return { checked: 0, updated: 0, failed: 0 };
  const since = new Date((args.now ?? new Date()).getTime() - 14 * 86_400_000).toISOString();
  const { data, error } = await args.supabase
    .from('distribution_jobs')
    .select('provider_post_id,distribution_asset_id,completed_at')
    .eq('distribution_account_id', account.id)
    .eq('status', 'published')
    .not('provider_post_id', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const base = (args.graphBaseUrl?.trim() || 'https://graph.instagram.com/v25.0').replace(/\/+$/, '');
  let checked = 0;
  let updated = 0;
  let failed = 0;
  for (const job of (data ?? []) as {
    provider_post_id: string;
    distribution_asset_id: string;
    completed_at: string;
  }[]) {
    checked += 1;
    try {
      const mediaUrl = new URL(`${base}/${encodeURIComponent(job.provider_post_id)}`);
      mediaUrl.searchParams.set('fields', 'media_type,timestamp,permalink,like_count,comments_count');
      mediaUrl.searchParams.set('access_token', token);
      const mediaResponse = await fetch(mediaUrl.toString(), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!mediaResponse.ok) throw new Error(`instagram_media_http_${mediaResponse.status}`);
      const media = (await mediaResponse.json()) as Record<string, unknown>;

      const insightsUrl = new URL(`${base}/${encodeURIComponent(job.provider_post_id)}/insights`);
      insightsUrl.searchParams.set(
        'metric',
        // Account-level metrics such as profile_activity and follows cause Meta
        // to reject the entire media-insights request for Reels.
        INSTAGRAM_MEDIA_INSIGHT_METRICS
      );
      insightsUrl.searchParams.set('access_token', token);
      const insightsResponse = await fetch(insightsUrl.toString(), {
        signal: AbortSignal.timeout(15_000),
      });
      const insightPayload = insightsResponse.ok
        ? ((await insightsResponse.json()) as Record<string, unknown>)
        : {};
      const snapshot = parseInstagramInsights(media, insightPayload);
      const asset = await repo.getAssetById(job.distribution_asset_id);
      if (!asset) continue;
      await repo.upsertAsset({
        assetId: asset.asset_id,
        contentItemId: asset.content_item_id,
        sourceType: asset.source_type,
        sourceKey: asset.source_key,
        assetType: asset.asset_type,
        providerFamily: asset.provider_family,
        title: asset.title,
        bodyMarkdown: asset.body_markdown,
        bodyPlaintext: asset.body_plaintext,
        captionText: asset.caption_text,
        status: asset.status,
        ctaUrl: asset.cta_url,
        metadata: {
          instagram_performance: snapshot,
          instagram_performance_checked_at: (args.now ?? new Date()).toISOString(),
          performance_score: scoreInstagramPerformance({
            qualifiedProfileVisits: snapshot.profileActivity,
            linkClicks: 0,
            scans: 0,
            activatedAccounts: 0,
            subscriptions: 0,
            follows: snapshot.follows,
            reach: snapshot.reach,
          }),
        },
      });
      updated += 1;
    } catch {
      failed += 1;
    }
  }
  return { checked, updated, failed };
}
