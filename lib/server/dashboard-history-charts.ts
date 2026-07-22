/**
 * Presentation-grade history series for the dashboard (issue #133).
 *
 * Everything here is pure and honest: a scan that could not be graded (WAF block / not-tested)
 * carries a `null` score and stays a null in the series — we never zero-fill, because a 0 reads as
 * "terrible" when the truth is "we could not measure." The client charts render those as gaps.
 *
 * We keep the hygiene/AI-score separation the report enforces: category trends only surface the
 * categories that feed the headline score; hygiene never appears as a trend line here.
 */

/** One AI-readiness category that feeds the headline score (hygiene is deliberately excluded). */
export type HeadlineCategory =
  | 'ai_readiness'
  | 'extractability'
  | 'trust'
  | 'demand_coverage'
  | 'conversion_readiness';

const CATEGORY_LABELS: Record<HeadlineCategory, string> = {
  ai_readiness: 'AI readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand coverage',
  conversion_readiness: 'Conversion readiness',
};

/** Order categories appear in legends / charts. */
const CATEGORY_ORDER: readonly HeadlineCategory[] = [
  'ai_readiness',
  'extractability',
  'trust',
  'demand_coverage',
  'conversion_readiness',
];

/** A row from the scans table, with categoryScores optionally projected from full_results_json. */
export type HistoryScanRow = {
  readonly id: string;
  readonly domain: string | null;
  readonly url: string | null;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly created_at: string | null;
  /** `full_results_json->categoryScores`, projected server-side. Shape validated defensively. */
  readonly categoryScores?: unknown;
};

export type ScoreTimePoint = {
  readonly scanId: string;
  readonly date: string | null;
  /** null = the scan was not gradeable (blocked / not-tested). Rendered as a gap, never a 0. */
  readonly score: number | null;
  readonly grade: string | null;
};

export type RunDelta = {
  readonly scanId: string;
  readonly date: string | null;
  readonly score: number | null;
  readonly previousScore: number | null;
  /** null when either endpoint was not gradeable — an honest "no comparison", not a 0 change. */
  readonly delta: number | null;
};

export type CategoryTrend = {
  readonly category: HeadlineCategory;
  readonly label: string;
  readonly points: ReadonlyArray<{ readonly date: string | null; readonly score: number | null }>;
  /** True when at least one scan produced a real (non-N/A) value for this category. */
  readonly hasData: boolean;
};

/** Sort rows oldest→newest without mutating the caller's array. */
function chronological<T extends { created_at: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
}

/** Chronological score line. Keeps not-tested runs as null points so the chart can show the gap. */
export function buildScoreTimeline(rows: readonly HistoryScanRow[]): ScoreTimePoint[] {
  return chronological(rows).map((r) => ({
    scanId: r.id,
    date: r.created_at,
    score: typeof r.score === 'number' ? r.score : null,
    grade: r.letter_grade,
  }));
}

/**
 * Consecutive before/after deltas, newest-first. The delta is null whenever either endpoint was
 * not gradeable — we do not invent a "+0" or treat a missing measurement as a real score.
 */
export function buildRunDeltas(rows: readonly HistoryScanRow[]): RunDelta[] {
  const asc = chronological(rows);
  const out: RunDelta[] = [];
  for (let i = 1; i < asc.length; i += 1) {
    const curr = asc[i];
    const prev = asc[i - 1];
    if (!curr) continue;
    const score = typeof curr.score === 'number' ? curr.score : null;
    const previousScore = typeof prev?.score === 'number' ? prev.score : null;
    out.push({
      scanId: curr.id,
      date: curr.created_at,
      score,
      previousScore,
      delta: score !== null && previousScore !== null ? score - previousScore : null,
    });
  }
  return out.reverse();
}

type RawCategoryScore = { category: string; score: number };

function readCategoryScores(raw: unknown): Map<HeadlineCategory, number> {
  const map = new Map<HeadlineCategory, number>();
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const category = rec['category'];
    const score = rec['score'];
    if (typeof category !== 'string' || typeof score !== 'number') continue;
    if (!(CATEGORY_ORDER as readonly string[]).includes(category)) continue;
    // -1 is the scan engine's "N/A / nothing scorable" sentinel — treat as no data, never as 0.
    map.set(category as HeadlineCategory, score);
  }
  return map;
}

/**
 * Per-category trend lines over time. Only categories that produced at least one real value are
 * returned (`hasData`), so we never draw a flat line for a category the audit never measured.
 * A category missing from a given scan — or scored -1 (N/A) — becomes a null point (a gap).
 */
export function buildCategoryTrends(rows: readonly HistoryScanRow[]): CategoryTrend[] {
  const asc = chronological(rows);
  const perScan = asc.map((r) => ({ date: r.created_at, scores: readCategoryScores(r.categoryScores) }));

  return CATEGORY_ORDER.map((category) => {
    const points = perScan.map((s) => {
      const value = s.scores.get(category);
      return {
        date: s.date,
        score: typeof value === 'number' && value >= 0 ? value : null,
      };
    });
    return {
      category,
      label: CATEGORY_LABELS[category],
      points,
      hasData: points.some((p) => p.score !== null),
    };
  }).filter((trend) => trend.hasData);
}

export type DashboardHistoryCharts = {
  readonly timeline: ScoreTimePoint[];
  readonly deltas: RunDelta[];
  readonly categoryTrends: CategoryTrend[];
  /** How many runs carry a real score — charts need ≥2 to be worth showing. */
  readonly scoredRunCount: number;
};

export function buildDashboardHistoryCharts(rows: readonly HistoryScanRow[]): DashboardHistoryCharts {
  const timeline = buildScoreTimeline(rows);
  return {
    timeline,
    deltas: buildRunDeltas(rows),
    categoryTrends: buildCategoryTrends(rows),
    scoredRunCount: timeline.filter((p) => p.score !== null).length,
  };
}
