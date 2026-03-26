/**
 * Weighted scoring from check results — does not import individual checks (Open/Closed).
 *
 * v2 status rules:
 *   PASS          → full weight earned
 *   FAIL          → 0 earned
 *   BLOCKED       → excluded from scoring (neither earned nor possible)
 *   NOT_EVALUATED → excluded from scoring
 *   LOW_CONFIDENCE→ half weight earned (if passed=true)
 *   WARNING       → full weight earned (non-critical pass)
 */
import type { CheckCategory, CheckResult, CheckStatus } from '../lib/interfaces/audit';

export interface WeightedResult extends CheckResult {
  weight: number;
  category: CheckCategory;
}

export interface CategoryScore {
  category: CheckCategory;
  score: number;
  letterGrade: string;
  totalWeight: number;
  earnedWeight: number;
  checkCount: number;
}

const EXCLUDED_FROM_SCORING: ReadonlySet<CheckStatus> = new Set(['BLOCKED', 'NOT_EVALUATED']);

function earnedWeight(r: WeightedResult): number {
  if (EXCLUDED_FROM_SCORING.has(r.status)) return 0;
  if (r.status === 'LOW_CONFIDENCE') return r.passed ? r.weight * 0.5 : 0;
  if (r.status === 'WARNING' || r.status === 'PASS') return r.weight;
  return 0;
}

function possibleWeight(r: WeightedResult): number {
  if (EXCLUDED_FROM_SCORING.has(r.status)) return 0;
  if (r.status === 'LOW_CONFIDENCE') return r.weight * 0.5;
  return r.weight;
}

export function attachWeights(
  checks: { weight: number; category: CheckCategory }[],
  results: CheckResult[]
): WeightedResult[] {
  return results.map((r, i) => ({
    ...r,
    weight: checks[i]?.weight ?? 0,
    category: checks[i]?.category ?? 'ai_readiness',
  }));
}

export function computeScore(weighted: WeightedResult[]): number {
  let earned = 0;
  let possible = 0;
  for (const r of weighted) {
    earned += earnedWeight(r);
    possible += possibleWeight(r);
  }
  if (possible === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((earned / possible) * 100)));
}

const ALL_CATEGORIES: CheckCategory[] = [
  'ai_readiness',
  'extractability',
  'trust',
  'demand_coverage',
  'conversion_readiness',
];

export function computeCategoryScores(weighted: WeightedResult[]): CategoryScore[] {
  return ALL_CATEGORIES.map((cat) => {
    const group = weighted.filter((r) => r.category === cat);
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
  const failed = weighted.filter((r) => !r.passed);
  failed.sort((a, b) => b.weight - a.weight);
  return failed.slice(0, limit);
}
