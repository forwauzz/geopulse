/**
 * Deterministic content-integrity checks for deep-audit markdown (no LLM).
 * Used by offline eval smoke and CI-friendly regression.
 */

export type StructuralEvalResult = {
  readonly overall: number;
  readonly metrics: {
    readonly hasTitle: number;
    readonly hasExecutiveSummary: number;
    readonly hasCoverageSummary: number;
    readonly hasActionPlan: number;
    readonly hasFullCheckBreakdown: number;
    readonly hasPagesSection: number;
    readonly hasTechnicalAppendix: number;
    readonly statusDiversity: number;
    readonly checkRowCount: number;
    readonly pageCoverageCount: number;
  };
};

const MAX_SCORE = 100;

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function weightedPartial(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, actual / target);
}

export function structuralReportScore(markdown: string): StructuralEvalResult {
  const text = markdown.trim();
  const checkRowCount = countMatches(text, /^\|\s*[^|\n]+\s*\|\s*(PASS|FAIL|BLOCKED|NOT_EVALUATED|LOW_CONFIDENCE|WARNING)\s*\|/gm);
  const pageCoverageCount = countMatches(text, /^-\s+\*\*https?:\/\/.+\*\*/gm);

  const hasTitle = /^#\s+GEO-Pulse\b/im.test(text) ? 1 : 0;
  const hasExecutiveSummary = /##\s+Executive Summary/i.test(text) ? 1 : 0;
  const hasCoverageSummary = /##\s+Coverage Summary/i.test(text) ? 1 : 0;
  const hasActionPlan = /##\s+Priority Action Plan/i.test(text) ? 1 : 0;
  const hasFullCheckBreakdown = /##\s+Score Breakdown/i.test(text) ? 1 : 0;
  const hasPagesSection = /##\s+Pages Scanned/i.test(text) ? 1 : 0;
  const hasTechnicalAppendix = /##\s+Technical Appendix/i.test(text) ? 1 : 0;

  const statuses = ['PASS', 'FAIL', 'BLOCKED', 'NOT_EVALUATED', 'LOW_CONFIDENCE', 'WARNING'].filter(
    (status) => new RegExp(`\\b${status}\\b`, 'i').test(text)
  ).length;
  const statusDiversity = weightedPartial(statuses, 3);

  const metrics = {
    hasTitle: hasTitle * 10,
    hasExecutiveSummary: hasExecutiveSummary * 10,
    hasCoverageSummary: hasCoverageSummary * 10,
    hasActionPlan: hasActionPlan * 10,
    hasFullCheckBreakdown: hasFullCheckBreakdown * 10,
    hasPagesSection: hasPagesSection * 10,
    hasTechnicalAppendix: hasTechnicalAppendix * 10,
    statusDiversity: statusDiversity * 10,
    checkRowCount: weightedPartial(checkRowCount, 5) * 10,
    pageCoverageCount: weightedPartial(pageCoverageCount, 2) * 10,
  };

  const overall = Math.round(
    Math.min(
      MAX_SCORE,
      metrics.hasTitle +
        metrics.hasExecutiveSummary +
        metrics.hasCoverageSummary +
        metrics.hasActionPlan +
        metrics.hasFullCheckBreakdown +
        metrics.hasPagesSection +
        metrics.hasTechnicalAppendix +
        metrics.statusDiversity +
        metrics.checkRowCount +
        metrics.pageCoverageCount
    ) * 100
  ) / 100;

  return { overall, metrics };
}
