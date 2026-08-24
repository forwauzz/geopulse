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

export const CONTENT_INVENTORY_FLOOR_DAYS = 12;
export const CONTENT_INVENTORY_LOOKAHEAD_DAYS = 16;

export function contentInventoryLookahead(now: Date): string {
  return new Date(
    now.getTime() + CONTENT_INVENTORY_LOOKAHEAD_DAYS * 86_400_000,
  ).toISOString();
}

export function requiredContentFormatsForConnectedProviders(
  providers: readonly string[],
): readonly string[] {
  const connected = new Set(providers);
  return REQUIRED_CONTENT_FORMATS.filter((format) => {
    const [provider] = format.split(':');
    return provider === 'blog' || connected.has(provider ?? '');
  });
}

export function evaluateContentInventoryHealth(args: {
  readonly now: Date;
  readonly jobs: readonly Job[];
  readonly assets: readonly Asset[];
  readonly recentPublishedArticles: number;
  readonly requiredFormats?: readonly string[];
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

  const requiredFormats = args.requiredFormats ?? REQUIRED_CONTENT_FORMATS;
  const missingFormats = requiredFormats.filter((format) => !covered.has(format));
  const horizonMinimum = args.now.getTime() + CONTENT_INVENTORY_FLOOR_DAYS * 86_400_000;
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
  // The approved social cadence can place the next item slightly more than 14 days
  // away at some hourly checkpoints. Query one full four-day cadence interval beyond
  // the 12-day health floor so database truncation cannot create a false incident.
  const horizon = contentInventoryLookahead(now);
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
  const accountsResult = await db
    .from('distribution_accounts')
    .select('provider_name')
    .eq('status', 'connected')
    .in('provider_name', ['instagram', 'linkedin']);
  if (accountsResult.error) throw accountsResult.error;
  const requiredFormats = requiredContentFormatsForConnectedProviders(
    (accountsResult.data ?? []).map((account: { provider_name?: unknown }) =>
      String(account.provider_name ?? ''),
    ),
  );
  return evaluateContentInventoryHealth({
    now,
    jobs: jobsResult.data ?? [],
    assets: assetsResult.data ?? [],
    recentPublishedArticles: Number(articlesResult.count ?? 0),
    requiredFormats,
  });
}
