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

export function jordanReelAttemptKey(slotKey: string, attemptIndex: number): string {
  const suffix = attemptIndex > 0 ? `-r${attemptIndex}` : '';
  return `jordan-reel-${slotKey}${suffix}`;
}

function reelProvidesCoverage(asset: DistributionAssetRow): boolean {
  if (asset.asset_type !== 'short_video_post') return false;
  if (asset.status === 'failed' || asset.status === 'archived') return false;
  const renderStatus = String(asset.metadata['reel_render_status'] ?? '');
  return !['blocked', 'failed', 'review_failed'].includes(renderStatus);
}

export function shouldPlanJordanReel(args: {
  readonly now: Date;
  readonly timezone: string;
  readonly config: JordanReelConfig;
  readonly existingAssets: ReadonlyArray<DistributionAssetRow>;
  readonly coverageRequired?: boolean;
}): boolean {
  if (!args.config.enabled) return false;
  const local = localDateParts(args.now, args.timezone);
  const slotKey = jordanReelSlotKey(args.now, args.timezone);
  const slotAttempts = args.existingAssets.filter(
    (asset) => asset.asset_type === 'short_video_post' && asset.metadata['reel_slot_key'] === slotKey,
  );
  if (slotAttempts.some(reelProvidesCoverage)) {
    return false;
  }
  // Preserve failed review evidence and create a fresh immutable attempt. Bound the
  // recovery loop so a persistent source/template problem cannot flood inventory.
  if (slotAttempts.length >= 3) return false;

  const start = new Date(args.now);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  start.setUTCHours(0, 0, 0, 0);
  const producedThisWeek = args.existingAssets.filter((asset) => {
    if (!reelProvidesCoverage(asset)) return false;
    if (typeof asset.metadata['reel_slot_key'] !== 'string') return false;
    const created = new Date(asset.created_at);
    return Number.isFinite(created.getTime()) && created >= start;
  }).length;
  if (producedThisWeek >= args.config.reelsPerWeek) return false;

  const staleBefore = args.now.getTime() - (14 * 24 * 60 * 60 * 1000);
  const hasRecentReel = args.existingAssets.some((asset) => {
    if (!reelProvidesCoverage(asset)) return false;
    const created = new Date(asset.created_at).getTime();
    return Number.isFinite(created) && created >= staleBefore;
  });
  return args.coverageRequired === true
    || !hasRecentReel
    || args.config.daysLocal.includes(local.weekday);
}

function cleanLine(value: string, max: number): string {
  return value
    .replace(/https?:\/\/\S+/g, '')
    // Strip social hashtags (#AIVisibility) but keep ordinals like "#1" — "ranks #1"
    // is load-bearing copy for a Reel about search position.
    .replace(/#(?=[A-Za-z])\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .slice(0, max)
    .trim();
}

// A line that stops on one of these reads as a fragment, not a statement. Dropping
// trailing words to fit a width is what produced "...when it tells you what to" on
// seven consecutive published Reels — the sentence lost its final word and nobody saw it.
const DANGLING_TAIL_WORDS = new Set([
  'a', 'about', 'across', 'after', 'against', 'an', 'and', 'are', 'as', 'at', 'be', 'because',
  'been', 'before', 'behind', 'below', 'between', 'but', 'by', 'can', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'may',
  'might', 'must', 'no', 'not', 'of', 'off', 'on', 'onto', 'or', 'our', 'over', 'should', 'so',
  'than', 'that', 'the', 'their', 'them', 'then', 'these', 'they', 'this', 'those', 'through',
  'to', 'under', 'until', 'up', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

function readsComplete(value: string): boolean {
  const tail = value
    .split(' ')
    .filter(Boolean)
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9']/g, '') ?? '';
  if (tail.length === 0) return false;
  // A number is always a finished thought — "ranks #1", "top 20", "in 2026".
  if (/\d/.test(tail)) return true;
  return !DANGLING_TAIL_WORDS.has(tail);
}

// Returns a phrase that fits `maxChars` AND reads as a finished thought, or '' so the
// caller can try the next candidate.
//
// Deliberately only accepts the WHOLE cleaned line or a cut at a real clause boundary.
// It never sheds arbitrary trailing words to make something fit: a stopword list cannot
// tell that "...only useful when it tells" is unfinished, so any shed-until-it-fits rule
// eventually publishes a fragment. A correct generic fallback beats a mangled specific.
function phrase(value: string, maxChars: number): string {
  const cleaned = cleanLine(value, 400);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars && readsComplete(cleaned)) return cleaned;

  const boundaries = [...cleaned.matchAll(/[,;:]\s|\s[—–]\s/g)].reverse();
  for (const boundary of boundaries) {
    const candidate = cleaned.slice(0, boundary.index).trim().replace(/[,;:]$/, '').trim();
    if (candidate.length <= maxChars && candidate.length >= 16 && readsComplete(candidate)) {
      return candidate;
    }
  }
  return '';
}

function sameLine(left: string, right: string): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalise(left) === normalise(right);
}

function categoryFor(kind: string): JordanReelCategory {
  if (kind === 'timely') return 'timely';
  if (kind === 'industry_humor') return 'humor';
  if (kind === 'before_after' || kind === 'aggregate' || kind === 'proof_demo') return 'proof';
  return 'educational';
}

// `existingAssets` is what stops the same top-ranked candidate winning every slot: a
// candidate whose rendered script matches one already produced is skipped. Without it this
// was a plain `.find()`, and August 2026 shipped the same Reel seven times running.
export function chooseJordanReelSource<T extends ReelSource>(
  candidates: ReadonlyArray<T>,
  categories: readonly JordanReelCategory[],
  existingAssets: ReadonlyArray<DistributionAssetRow> = []
): T | null {
  const usedScripts = new Set(
    existingAssets
      .filter((asset) => asset.asset_type === 'short_video_post')
      .map((asset) => reelScriptSignature(asset.metadata['reel_script']))
      .filter((signature): signature is string => signature !== null)
  );
  const eligible = candidates.filter((candidate) => {
    const sourceUrl = candidate.evidence['source_url'];
    return categories.includes(categoryFor(candidate.kind)) &&
      typeof sourceUrl === 'string' &&
      /^https:\/\//.test(sourceUrl) &&
      candidate.title.trim().length > 0 &&
      !usedScripts.has(reelScriptSignature(buildJordanReelScript(candidate)) ?? '');
  });
  return eligible.find((candidate) => candidate.evidence['campaign_role'] === 'primary')
    ?? eligible[0]
    ?? null;
}

// The compare scene renders `top ≠ bottom`. A contrast the source did not actually make
// is a fabricated claim, so we only ever use an explicit pair from the evidence, or fall
// back to GEO-Pulse's own thesis — which is a statement about the category, not about the
// source. The previous hardcoded 'AI READY' bottom half was never a contrast at all.
const THESIS_COMPARISON = { top: 'RANKING', bottom: 'BEING CITED' } as const;

function firstDistinctPhrase(
  candidates: ReadonlyArray<unknown>,
  maxChars: number,
  taken: ReadonlyArray<string>
): string {
  for (const candidate of candidates) {
    const built = phrase(String(candidate ?? ''), maxChars);
    if (built && !taken.some((existing) => sameLine(existing, built))) return built;
  }
  return '';
}

function reelScriptSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fields = [
    'hook',
    'tension',
    'comparisonTop',
    'comparisonBottom',
    'diagnostic',
    'cta',
    'url',
    'sourceUrl',
    'sourceLabel',
  ] as const;
  if (fields.some((field) => typeof row[field] !== 'string')) return null;
  return JSON.stringify(fields.map((field) => String(row[field]).trim()));
}

export function buildJordanReelScript(source: ReelSource): JordanReelScript {
  const hook = firstDistinctPhrase(
    [source.evidence['trend_hook'], source.evidence['hook'], source.title],
    72,
    []
  ) || 'AI search changed the brief';

  const tension = firstDistinctPhrase(
    [source.evidence['original_angle'], source.caption, source.title],
    96,
    [hook]
  ) || 'Ranking and recommendation are not the same signal';

  // Must not restate the hook — when both fell back to source.title the Reel opened and
  // closed on the identical line, which is what shipped seven times in August 2026.
  const diagnostic = firstDistinctPhrase(
    [source.evidence['diagnostic'], source.title, source.caption, source.evidence['original_angle']],
    64,
    [hook, tension]
  ) || 'Find the visibility gap';

  const explicitTop = phrase(String(source.evidence['comparison_top'] ?? ''), 24);
  const explicitBottom = phrase(String(source.evidence['comparison_bottom'] ?? ''), 24);
  const hasRealContrast = Boolean(explicitTop && explicitBottom && !sameLine(explicitTop, explicitBottom));
  const comparisonTop = hasRealContrast ? explicitTop : THESIS_COMPARISON.top;
  const comparisonBottom = hasRealContrast ? explicitBottom : THESIS_COMPARISON.bottom;

  return {
    template: 'diagnostic-kinetic-v1',
    hook,
    tension,
    comparisonTop: comparisonTop.toUpperCase(),
    comparisonBottom: comparisonBottom.toUpperCase(),
    diagnostic,
    cta: 'RUN A FREE AI VISIBILITY SCAN',
    url: 'getgeopulse.com',
    sourceUrl: String(source.evidence['source_url']),
    sourceLabel: phrase(String(source.evidence['source_label'] ?? 'Source-linked research'), 64)
      || 'Source-linked research',
  };
}

export type JordanReelLibraryItem = {
  readonly assetId: string;
  readonly title: string;
  readonly status: 'Draft' | 'Scheduled' | 'Published' | 'Failed';
  readonly scheduledFor: string | null;
  readonly destinationUrl: string | null;
  readonly renderStatus: string;
  readonly reviewStatus: string;
  readonly reviewSummary: string | null;
  readonly reviewFindings: ReadonlyArray<{
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly message: string;
    readonly repair: string;
  }>;
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
    const rawFindings = Array.isArray(asset.metadata?.reel_review_findings)
      ? asset.metadata.reel_review_findings
      : [];
    return {
      assetId: asset.asset_id,
      title: asset.title ?? 'Untitled Reel',
      status: displayStatus(asset as DistributionAssetRow, job),
      scheduledFor: job?.scheduled_for ?? null,
      destinationUrl: job?.destination_url ?? null,
      renderStatus: String(asset.metadata?.reel_render_status ?? 'unknown'),
      reviewStatus: String(asset.metadata?.reel_review_status ?? 'not reviewed'),
      reviewSummary: typeof asset.metadata?.reel_review_summary === 'string'
        ? asset.metadata.reel_review_summary
        : null,
      reviewFindings: rawFindings.flatMap((finding: unknown) => {
        if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return [];
        const row = finding as Record<string, unknown>;
        if (
          typeof row['startSeconds'] !== 'number' ||
          typeof row['endSeconds'] !== 'number' ||
          typeof row['message'] !== 'string' ||
          typeof row['repair'] !== 'string'
        ) return [];
        return [{
          startSeconds: row['startSeconds'],
          endSeconds: row['endSeconds'],
          message: row['message'],
          repair: row['repair'],
        }];
      }).slice(0, 5),
      createdAt: asset.created_at,
    };
  });
}
