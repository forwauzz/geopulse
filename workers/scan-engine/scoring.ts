/**
 * Weighted scoring from check results — does not import individual checks (Open/Closed).
 *
 * Published scoring rules (spec C6 — the score must be reproducible from these):
 *   PASS           → full weight earned
 *   WARNING        → half weight earned (a real caveat should cost something visible,
 *                    never silently full credit)
 *   LOW_CONFIDENCE → half weight earned when passed, else 0
 *   FAIL           → 0 earned
 *   BLOCKED / NOT_EVALUATED → excluded entirely (neither earned nor possible) —
 *                    an untested check can never depress the score
 *
 * Bucket rules (spec §3 / C7): only 'eligibility' and 'understanding' checks feed the
 * AI-readiness headline. 'hygiene' checks are reported with their own subtotal but are
 * excluded from the headline score by construction.
 */
import type { CheckCategory, CheckResult, CheckStatus } from '../lib/interfaces/audit';
import {
  BUCKET_LABELS,
  bucketOf,
  weightOf,
  type CheckBucket,
} from './check-catalog';

export interface WeightedResult extends CheckResult {
  weight: number;
  category: CheckCategory;
  bucket: CheckBucket;
}

export interface CategoryScore {
  category: CheckCategory;
  score: number;
  letterGrade: string;
  totalWeight: number;
  earnedWeight: number;
  checkCount: number;
}

export interface BucketScore {
  bucket: CheckBucket;
  label: string;
  /** -1 when nothing in the bucket was scorable. */
  score: number;
  earnedWeight: number;
  possibleWeight: number;
  checkCount: number;
  /** Checks excluded as BLOCKED/NOT_EVALUATED (shown, never counted). */
  notTestedCount: number;
  /** True for the hygiene bucket — display only, never in the AI score. */
  excludedFromHeadline: boolean;
}

export type EligibilityBand = 'ai_visible' | 'partially_blocked' | 'blocked' | 'not_tested';

const EXCLUDED_FROM_SCORING: ReadonlySet<CheckStatus> = new Set(['BLOCKED', 'NOT_EVALUATED']);

function earnedWeight(r: WeightedResult): number {
  if (EXCLUDED_FROM_SCORING.has(r.status)) return 0;
  if (r.status === 'LOW_CONFIDENCE') return r.passed ? r.weight * 0.5 : 0;
  if (r.status === 'WARNING') return r.weight * 0.5;
  if (r.status === 'PASS') return r.weight;
  return 0;
}

function possibleWeight(r: WeightedResult): number {
  if (EXCLUDED_FROM_SCORING.has(r.status)) return 0;
  if (r.status === 'LOW_CONFIDENCE') return r.weight * 0.5;
  return r.weight;
}

export function attachWeights(
  checks: { id?: string; weight: number; category: CheckCategory }[],
  results: CheckResult[]
): WeightedResult[] {
  return results.map((r, i) => {
    const fallbackWeight = checks[i]?.weight ?? 0;
    return {
      ...r,
      weight: weightOf(r.id, fallbackWeight),
      category: checks[i]?.category ?? 'ai_readiness',
      bucket: bucketOf(r.id),
    };
  });
}

/** Headline AI-readiness score — eligibility + understanding buckets only. */
export function computeScore(weighted: WeightedResult[]): number {
  let earned = 0;
  let possible = 0;
  for (const r of weighted) {
    if (r.bucket === 'hygiene') continue;
    earned += earnedWeight(r);
    possible += possibleWeight(r);
  }
  if (possible === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((earned / possible) * 100)));
}

export function computeBucketScores(weighted: WeightedResult[]): BucketScore[] {
  const order: CheckBucket[] = ['eligibility', 'understanding', 'hygiene'];
  return order
    .filter((bucket) => weighted.some((r) => r.bucket === bucket))
    .map((bucket) => {
      const group = weighted.filter((r) => r.bucket === bucket);
      let earned = 0;
      let possible = 0;
      let notTested = 0;
      for (const r of group) {
        if (EXCLUDED_FROM_SCORING.has(r.status)) {
          notTested += 1;
          continue;
        }
        earned += earnedWeight(r);
        possible += possibleWeight(r);
      }
      const score =
        possible > 0 ? Math.min(100, Math.max(0, Math.round((earned / possible) * 100))) : -1;
      return {
        bucket,
        label: BUCKET_LABELS[bucket],
        score,
        earnedWeight: earned,
        possibleWeight: possible,
        checkCount: group.length,
        notTestedCount: notTested,
        excludedFromHeadline: bucket === 'hygiene',
      };
    });
}

/**
 * Shareable-but-honest headline (spec C6): a plain-English eligibility band derived
 * from the Access & Eligibility Matrix rows, shown alongside the numeric score.
 */
export function eligibilityBand(
  rows: { status: 'eligible' | 'blocked' | 'not_tested' }[]
): { band: EligibilityBand; label: string } {
  if (rows.length === 0) return { band: 'not_tested', label: 'Not tested' };
  const blocked = rows.filter((r) => r.status === 'blocked').length;
  const notTested = rows.filter((r) => r.status === 'not_tested').length;
  if (blocked === rows.length) return { band: 'blocked', label: 'Blocked from AI search' };
  if (blocked > 0) return { band: 'partially_blocked', label: 'Partially blocked' };
  if (notTested === rows.length) return { band: 'not_tested', label: 'Not tested' };
  return { band: 'ai_visible', label: 'AI-visible' };
}

/**
 * Category order for the report. This is presentation order only — a category appears in the
 * output because checks produced it, NOT because it is listed here.
 *
 * `demand_coverage` and `conversion_readiness` are declared in the CheckCategory union and have
 * labels in every renderer, but no check emits them. Mapping over a fixed list meant every scan
 * shipped two permanently-empty rows — rendered as "—", "N/A", 0 checks, and in the web report
 * badged "Full report", which advertised an upgrade that cannot fill them either. Empty cells in a
 * paid deliverable read as broken software, and an upsell for something unbuilt is worse.
 *
 * Deriving from the checks that actually ran keeps that honest by construction: when those checks
 * are built, their categories appear here on their own.
 */
const CATEGORY_ORDER: CheckCategory[] = [
  'ai_readiness',
  'extractability',
  'trust',
  'demand_coverage',
  'conversion_readiness',
];

export function computeCategoryScores(weighted: WeightedResult[]): CategoryScore[] {
  // Hygiene checks are excluded here for the same reason they are excluded from the
  // headline: the report promises hygiene is 0% of the AI score, so the per-category
  // breakdown must reconcile with that.
  const scorable = weighted.filter((r) => r.bucket !== 'hygiene');
  const present = CATEGORY_ORDER.filter((cat) => scorable.some((r) => r.category === cat));
  return present.map((cat) => {
    const group = scorable.filter((r) => r.category === cat);
    let earned = 0;
    let possible = 0;
    for (const r of group) {
      earned += earnedWeight(r);
      possible += possibleWeight(r);
    }
    const score = possible > 0 ? Math.min(100, Math.max(0, Math.round((earned / possible) * 100))) : -1;
    return {
      category: cat,
      score,
      letterGrade: score >= 0 ? letterGrade(score) : 'N/A',
      totalWeight: possible,
      earnedWeight: earned,
      checkCount: group.length,
    };
  });
}

export function letterGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 60) return 'D';
  return 'F';
}

export function topFailedIssues(weighted: WeightedResult[], limit = 3): WeightedResult[] {
  const failed = weighted.filter(
    (r) => !r.passed && !EXCLUDED_FROM_SCORING.has(r.status)
  );
  // Hygiene findings never outrank AI-readiness findings in the top-issues slot.
  failed.sort((a, b) => {
    const aH = a.bucket === 'hygiene' ? 1 : 0;
    const bH = b.bucket === 'hygiene' ? 1 : 0;
    if (aH !== bH) return aH - bH;
    return b.weight - a.weight;
  });
  return failed.slice(0, limit);
}
