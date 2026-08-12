import type {
  DistributionAssetRow,
  DistributionJobRow,
} from './distribution-engine-repository';

export const JORDAN_REEL_VALIDATION_VERSION = 'jordan-reel-v2';
export const DEFAULT_REEL_DAYS_LOCAL = [0, 2, 4, 6] as const;

export type JordanReelCategory = 'timely' | 'educational' | 'humor' | 'proof';
export type JordanReelPublishMode = 'draft' | 'autonomous';

export type JordanReelConfig = {
  readonly enabled: boolean;
  readonly reelsPerWeek: number;
  readonly daysLocal: readonly number[];
  readonly categories: readonly JordanReelCategory[];
  readonly publishMode: JordanReelPublishMode;
};

export type JordanReelScript = {
  readonly template: 'diagnostic-kinetic-v1';
  readonly hook: string;
  readonly tension: string;
  readonly comparisonTop: string;
  readonly comparisonBottom: string;
  readonly diagnostic: string;
  readonly cta: string;
  readonly url: 'getgeopulse.com';
  readonly sourceUrl: string;
  readonly sourceLabel: string;
};

type ReelSource = {
  readonly key: string;
  readonly kind: string;
  readonly title: string;
  readonly caption: string;
  readonly evidence: Record<string, unknown>;
};

function int(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

export function resolveJordanReelConfig(config: Record<string, unknown>): JordanReelConfig {
  const rawDays = Array.isArray(config['reel_days_local'])
    ? config['reel_days_local']
    : DEFAULT_REEL_DAYS_LOCAL;
  const daysLocal = [...new Set(rawDays
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6))]
    .slice(0, 7);
  const allowedCategories = new Set<JordanReelCategory>([
    'timely',
    'educational',
    'humor',
    'proof',
  ]);
  const rawCategories = Array.isArray(config['reel_categories'])
    ? config['reel_categories']
    : ['timely', 'educational', 'humor', 'proof'];
  const categories = rawCategories
    .map((value) => String(value))
    .filter((value): value is JordanReelCategory =>
      allowedCategories.has(value as JordanReelCategory)
    );

  return {
    // Reel brief creation is part of the normal production mix. Rendering and
    // publication still remain fail-closed behind the validation and provider gates.
    enabled: bool(config['reels_enabled'], true),
    reelsPerWeek: int(config['reels_per_week'], 4, 7),
    daysLocal: daysLocal.length > 0 ? daysLocal : DEFAULT_REEL_DAYS_LOCAL,
    categories: categories.length > 0
      ? categories
      : ['timely', 'educational', 'humor', 'proof'],
    publishMode: config['reel_publish_mode'] === 'draft' ? 'draft' : 'autonomous',
  };
}

function localDateParts(date: Date, timezone: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
  const weekdayText = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    weekday: weekdays[weekdayText] ?? 0,
  };
}

export function jordanReelSlotKey(now: Date, timezone: string): string {
  const local = localDateParts(now, timezone);
  const localDate = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  return `${localDate}-d${local.weekday}`;
}

export function shouldPlanJordanReel(args: {
  readonly now: Date;
  readonly timezone: string;
  readonly config: JordanReelConfig;
  readonly existingAssets: ReadonlyArray<DistributionAssetRow>;
}): boolean {
  if (!args.config.enabled) return false;
  const local = localDateParts(args.now, args.timezone);
  const slotKey = jordanReelSlotKey(args.now, args.timezone);
  if (args.existingAssets.some((asset) => asset.metadata['reel_slot_key'] === slotKey)) {
    return false;
  }

  const start = new Date(args.now);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  start.setUTCHours(0, 0, 0, 0);
  const producedThisWeek = args.existingAssets.filter((asset) => {
    if (asset.asset_type !== 'short_video_post') return false;
    if (typeof asset.metadata['reel_slot_key'] !== 'string') return false;
    const created = new Date(asset.created_at);
    return Number.isFinite(created.getTime()) && created >= start;
  }).length;
  if (producedThisWeek >= args.config.reelsPerWeek) return false;

  const staleBefore = args.now.getTime() - (14 * 24 * 60 * 60 * 1000);
  const hasRecentReel = args.existingAssets.some((asset) => {
    if (asset.asset_type !== 'short_video_post') return false;
    const created = new Date(asset.created_at).getTime();
    return Number.isFinite(created) && created >= staleBefore;
  });
  return !hasRecentReel || args.config.daysLocal.includes(local.weekday);
}

function cleanLine(value: string, max: number): string {
  return value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .slice(0, max)
    .trim();
}

function words(value: string, maxWords: number, maxChars: number): string {
  const selected = cleanLine(value, Math.max(maxChars * 2, 200))
    .split(' ')
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ');
  if (selected.length <= maxChars) return selected;
  const completeWords = selected.split(' ');
  while (completeWords.length > 1 && completeWords.join(' ').length > maxChars) {
    completeWords.pop();
  }
  return completeWords.join(' ');
}

function categoryFor(kind: string): JordanReelCategory {
  if (kind === 'timely') return 'timely';
  if (kind === 'industry_humor') return 'humor';
  if (kind === 'before_after' || kind === 'aggregate' || kind === 'proof_demo') return 'proof';
  return 'educational';
}

export function chooseJordanReelSource<T extends ReelSource>(
  candidates: ReadonlyArray<T>,
  categories: readonly JordanReelCategory[]
): T | null {
  return candidates.find((candidate) => {
    const sourceUrl = candidate.evidence['source_url'];
    return categories.includes(categoryFor(candidate.kind)) &&
      typeof sourceUrl === 'string' &&
      /^https:\/\//.test(sourceUrl) &&
      candidate.title.trim().length > 0;
  }) ?? null;
}

export function buildJordanReelScript(source: ReelSource): JordanReelScript {
  const hook = words(
    String(source.evidence['trend_hook'] ?? source.evidence['hook'] ?? source.title),
    10,
    72
  );
  const angle = words(
    String(source.evidence['original_angle'] ?? source.caption),
    12,
    96
  );
  const titleWords = words(source.title, 7, 58);
  const comparisonTop = words(
    String(source.evidence['comparison_top'] ?? titleWords.split(/\b(?:vs|versus|not)\b/i)[0] ?? titleWords),
    3,
    24
  ) || 'VISIBLE';
  const comparisonBottom = words(
    String(source.evidence['comparison_bottom'] ?? 'AI READY'),
    3,
    24
  ) || 'AI READY';

  return {
    template: 'diagnostic-kinetic-v1',
    hook: hook || titleWords || 'AI SEARCH CHANGED',
    tension: angle || 'Ranking and recommendation are not the same signal',
    comparisonTop: comparisonTop.toUpperCase(),
    comparisonBottom: comparisonBottom.toUpperCase(),
    diagnostic: words(titleWords || angle, 8, 64) || 'FIND THE VISIBILITY GAP',
    cta: 'RUN A FREE AI VISIBILITY SCAN',
    url: 'getgeopulse.com',
    sourceUrl: String(source.evidence['source_url']),
    sourceLabel: words(String(source.evidence['source_label'] ?? 'Source-linked research'), 8, 64),
  };
}

export type JordanReelLibraryItem = {
  readonly assetId: string;
  readonly title: string;
  readonly status: 'Draft' | 'Scheduled' | 'Published' | 'Failed';
  readonly scheduledFor: string | null;
  readonly destinationUrl: string | null;
  readonly renderStatus: string;
  readonly createdAt: string;
};

function displayStatus(asset: DistributionAssetRow, job?: DistributionJobRow): JordanReelLibraryItem['status'] {
  if (asset.status === 'failed' || job?.status === 'failed') return 'Failed';
  if (job?.status === 'published' || asset.status === 'published') return 'Published';
  if (job?.status === 'scheduled' || asset.status === 'scheduled') return 'Scheduled';
  return 'Draft';
}

export async function loadJordanReelLibrary(
  supabase: any,
  limit = 20
): Promise<JordanReelLibraryItem[]> {
  const { data: assets, error } = await supabase
    .from('distribution_assets')
    .select('id,asset_id,title,status,metadata,created_at')
    .eq('provider_family', 'instagram')
    .eq('asset_type', 'short_video_post')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !assets?.length) return [];
  const { data: jobs } = await supabase
    .from('distribution_jobs')
    .select('distribution_asset_id,status,scheduled_for,destination_url')
    .in('distribution_asset_id', assets.map((asset: any) => asset.id))
    .order('created_at', { ascending: false });
  const byAsset = new Map<string, DistributionJobRow>();
  for (const job of jobs ?? []) {
    if (!byAsset.has(job.distribution_asset_id)) byAsset.set(job.distribution_asset_id, job);
  }
  return assets.map((asset: any) => {
    const job = byAsset.get(asset.id);
    return {
      assetId: asset.asset_id,
      title: asset.title ?? 'Untitled Reel',
      status: displayStatus(asset as DistributionAssetRow, job),
      scheduledFor: job?.scheduled_for ?? null,
      destinationUrl: job?.destination_url ?? null,
      renderStatus: String(asset.metadata?.reel_render_status ?? 'unknown'),
      createdAt: asset.created_at,
    };
  });
}
