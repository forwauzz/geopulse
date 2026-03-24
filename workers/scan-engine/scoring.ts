/**
 * Weighted scoring from check results — does not import individual checks (Open/Closed).
 */
import type { CheckResult } from '../lib/interfaces/audit';

export interface WeightedResult extends CheckResult {
  weight: number;
}

export function attachWeights(checks: { weight: number }[], results: CheckResult[]): WeightedResult[] {
  return results.map((r, i) => {
    const w = checks[i]?.weight ?? 0;
    return { ...r, weight: w };
  });
}

export function computeScore(weighted: WeightedResult[]): number {
  let sum = 0;
  for (const r of weighted) {
    if (r.passed) sum += r.weight;
  }
  return Math.min(100, Math.max(0, sum));
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
