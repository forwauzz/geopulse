type SupabaseLike = {
  from(table: string): any;
};

type SofiaAssetRow = {
  readonly id: string;
  readonly asset_id: string;
  readonly title: string;
  readonly status: string;
  readonly created_at: string;
  readonly metadata: Record<string, unknown> | null;
};

type SofiaJobRow = {
  readonly distribution_asset_id: string;
  readonly status: string;
  readonly scheduled_for: string | null;
  readonly destination_url: string | null;
};

export type SofiaResearchHandoff = {
  readonly assetId: string;
  readonly title: string;
  readonly hook: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly whyNow: string;
  readonly angle: string;
  readonly audience: string;
  readonly score: number | null;
  readonly assetStatus: string;
  readonly jobStatus: string | null;
  readonly scheduledFor: string | null;
  readonly destinationUrl: string | null;
  readonly discoveredAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeSourceUrl(value: unknown): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function toSofiaResearchHandoff(
  asset: SofiaAssetRow,
  job?: SofiaJobRow
): SofiaResearchHandoff | null {
  const metadata = record(asset.metadata);
  if (metadata['researched_by_agent'] !== 'sofia') return null;
  const evidence = record(metadata['evidence']);
  const sourceUrl = safeSourceUrl(evidence['source_url']);
  if (!sourceUrl) return null;

  return {
    assetId: asset.asset_id,
    title: asset.title,
    hook: text(evidence['hook']) || asset.title,
    sourceUrl,
    sourceLabel: text(evidence['source_label']) || new URL(sourceUrl).hostname,
    whyNow: text(evidence['why_now']),
    angle: text(evidence['original_angle']),
    audience: text(evidence['audience']) || 'both',
    score: typeof evidence['score'] === 'number' && Number.isFinite(evidence['score'])
      ? evidence['score']
      : null,
    assetStatus: asset.status,
    jobStatus: job?.status ?? null,
    scheduledFor: job?.scheduled_for ?? null,
    destinationUrl: job?.destination_url ?? null,
    discoveredAt: text(evidence['discovered_at']) || asset.created_at,
  };
}

export async function loadSofiaResearchHandoffs(
  supabase: SupabaseLike,
  limit = 8
): Promise<SofiaResearchHandoff[]> {
  const normalizedLimit = Math.min(Math.max(limit, 1), 20);
  const { data, error } = await supabase
    .from('distribution_assets')
    .select('id,asset_id,title,status,created_at,metadata')
    .eq('metadata->>researched_by_agent', 'sofia')
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);
  if (error) throw error;

  const assets = (data ?? []) as SofiaAssetRow[];
  if (assets.length === 0) return [];

  const { data: jobsData, error: jobsError } = await supabase
    .from('distribution_jobs')
    .select('distribution_asset_id,status,scheduled_for,destination_url')
    .in('distribution_asset_id', assets.map((asset) => asset.id))
    .order('created_at', { ascending: false });
  if (jobsError) throw jobsError;

  const jobsByAsset = new Map<string, SofiaJobRow>();
  for (const job of (jobsData ?? []) as SofiaJobRow[]) {
    if (!jobsByAsset.has(job.distribution_asset_id)) {
      jobsByAsset.set(job.distribution_asset_id, job);
    }
  }

  return assets
    .map((asset) => toSofiaResearchHandoff(asset, jobsByAsset.get(asset.id)))
    .filter((row): row is SofiaResearchHandoff => row !== null);
}
