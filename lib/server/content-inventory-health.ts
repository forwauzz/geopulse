type Db = { from(table: string): any };

export const REQUIRED_CONTENT_FORMATS = [
  'instagram:short_video_post',
  'instagram:carousel_post',
  'instagram:single_image_post',
  'linkedin:link_post',
  'linkedin:carousel_post',
  'linkedin:single_image_post',
  'blog:article',
] as const;

export type ContentInventoryHealth = {
  readonly healthy: boolean;
  readonly scheduledJobs: number;
  readonly inventoryThrough: string | null;
  readonly coveredFormats: readonly string[];
  readonly missingFormats: readonly string[];
  readonly reason: string | null;
};

type Job = { distribution_asset_id?: unknown; scheduled_for?: unknown };
type Asset = { id?: unknown; provider_family?: unknown; asset_type?: unknown };

export function evaluateContentInventoryHealth(args: {
  readonly now: Date;
  readonly jobs: readonly Job[];
  readonly assets: readonly Asset[];
  readonly recentPublishedArticles: number;
}): ContentInventoryHealth {
  const assetById = new Map(args.assets.map((asset) => [String(asset.id ?? ''), asset]));
  const covered = new Set<string>();
  let inventoryThrough: string | null = null;
  for (const job of args.jobs) {
    const scheduledFor = typeof job.scheduled_for === 'string' ? job.scheduled_for : null;
    if (scheduledFor && (!inventoryThrough || scheduledFor > inventoryThrough)) {
      inventoryThrough = scheduledFor;
    }
    const asset = assetById.get(String(job.distribution_asset_id ?? ''));
    const provider = String(asset?.provider_family ?? '');
    const format = String(asset?.asset_type ?? '');
    if (provider && format) covered.add(`${provider}:${format}`);
  }
  if (args.recentPublishedArticles > 0) covered.add('blog:article');

  const missingFormats = REQUIRED_CONTENT_FORMATS.filter((format) => !covered.has(format));
  const horizonMinimum = args.now.getTime() + 12 * 86_400_000;
  const horizonCovered = Boolean(
    inventoryThrough && Date.parse(inventoryThrough) >= horizonMinimum,
  );
  const healthy = horizonCovered && missingFormats.length === 0;
  const reason = healthy
    ? null
    : missingFormats.length > 0
      ? `missing_required_formats:${missingFormats.join(',')}`
      : 'inventory_below_12_day_floor';
  return {
    healthy,
    scheduledJobs: args.jobs.length,
    inventoryThrough,
    coveredFormats: [...covered].sort(),
    missingFormats,
    reason,
  };
}

export async function loadContentInventoryHealth(
  db: Db,
  now = new Date(),
): Promise<ContentInventoryHealth> {
  const horizon = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const articleFloor = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const jobsResult = await db
    .from('distribution_jobs')
    .select('distribution_asset_id,scheduled_for')
    .in('status', ['scheduled', 'queued', 'processing'])
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', horizon)
    .order('scheduled_for', { ascending: true })
    .limit(250);
  if (jobsResult.error) throw jobsResult.error;
  const assetIds = [...new Set((jobsResult.data ?? []).map((job: Job) => String(job.distribution_asset_id ?? '')).filter(Boolean))];
  const assetsResult = assetIds.length > 0
    ? await db.from('distribution_assets').select('id,provider_family,asset_type').in('id', assetIds)
    : { data: [], error: null };
  if (assetsResult.error) throw assetsResult.error;
  const articlesResult = await db
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', 'article')
    .eq('status', 'published')
    .gte('published_at', articleFloor);
  if (articlesResult.error) throw articlesResult.error;
  return evaluateContentInventoryHealth({
    now,
    jobs: jobsResult.data ?? [],
    assets: assetsResult.data ?? [],
    recentPublishedArticles: Number(articlesResult.count ?? 0),
  });
}
