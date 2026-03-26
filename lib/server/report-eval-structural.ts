/**
 * Deterministic structural checks for deep-audit markdown (no LLM).
 * Used by offline eval smoke and CI-friendly regression.
 */

export type StructuralEvalResult = {
  readonly overall: number;
  readonly metrics: {
    readonly hasTitle: number;
    readonly hasExecutiveSummary: number;
    readonly hasActionPlanOrChecks: number;
    readonly hasPagesSection: number;
    readonly minLength: number;
  };
};

const MAX_SCORE = 100;

export function structuralReportScore(markdown: string): StructuralEvalResult {
  const text = markdown.trim();
  const len = text.length;
  const hasTitle = text.includes('# GEO-Pulse') || text.includes('# ') ? 1 : 0;
  const hasExecutiveSummary = /##\s+Executive Summary/i.test(text) ? 1 : 0;
  const hasActionPlan =
    /##\s+Priority Action Plan/i.test(text) || /##\s+Score Breakdown/i.test(text) ? 1 : 0;
  const hasPages = /##\s+Pages Scanned/i.test(text) ? 1 : 0;
  const minLength = len >= 400 ? 1 : len >= 200 ? 0.5 : 0;

  const weights = {
    hasTitle: 15,
    hasExecutiveSummary: 25,
    hasActionPlanOrChecks: 30,
    hasPagesSection: 20,
    minLength: 10,
  };

  const metrics = {
    hasTitle: hasTitle * weights.hasTitle,
    hasExecutiveSummary: hasExecutiveSummary * weights.hasExecutiveSummary,
    hasActionPlanOrChecks: hasActionPlan * weights.hasActionPlanOrChecks,
    hasPagesSection: hasPages * weights.hasPagesSection,
    minLength: minLength * weights.minLength,
  };

  const sum =
    metrics.hasTitle +
    metrics.hasExecutiveSummary +
    metrics.hasActionPlanOrChecks +
    metrics.hasPagesSection +
    metrics.minLength;

  const overall = Math.round(Math.min(MAX_SCORE, sum) * 100) / 100;

  return { overall, metrics };
}
