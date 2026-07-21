/**
 * Pure derivations for the report data-story — everything the charts show is computed here from
 * the scan payload, so the visuals are testable and the component stays presentational.
 */
import type { CategoryScore, Issue, ScanResponse } from './report-viewer';

export type CheckOutcome = 'passed' | 'warning' | 'failed' | 'not_tested';

export type OutcomeSlice = {
  readonly outcome: CheckOutcome;
  readonly label: string;
  readonly count: number;
  /** 0..1 share of all counted checks. */
  readonly share: number;
};

export type CategoryBarRow = {
  readonly category: string;
  readonly label: string;
  readonly score: number;
  readonly letterGrade: string;
  readonly checkCount: number;
  readonly tone: 'good' | 'ok' | 'warn' | 'bad';
};

export type StoryAction = {
  readonly title: string;
  readonly fix: string | null;
  readonly weight: number;
  /** 0..1 relative to the heaviest open issue — drives the impact bar. */
  readonly impact: number;
};

export type ReportStoryData = {
  readonly score: number;
  readonly grade: string;
  readonly headline: string;
  readonly subline: string;
  readonly outcomes: readonly OutcomeSlice[];
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly categories: readonly CategoryBarRow[];
  readonly actions: readonly StoryAction[];
  /** Score the site could reach if every failed check were fixed (weight-proportional estimate). */
  readonly projectedScore: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand coverage',
  conversion_readiness: 'Conversion readiness',
};

export function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

function outcomeOf(issue: Issue): CheckOutcome {
  // Same arithmetic as workers/report/check-counts.ts (spec C1): every check lands in
  // exactly one bucket so the story's numbers always sum to the true total.
  const status = (issue.status ?? '').toUpperCase();
  if (status === 'NOT_EVALUATED' || status === 'BLOCKED') return 'not_tested';
  if (status === 'PASS' || (status === '' && issue.passed === true)) return 'passed';
  if (status === 'WARNING' || status === 'LOW_CONFIDENCE') return 'warning';
  return 'failed';
}

function toneForScore(score: number): CategoryBarRow['tone'] {
  if (score >= 80) return 'good';
  if (score >= 60) return 'ok';
  if (score >= 40) return 'warn';
  return 'bad';
}

function headlineFor(score: number, failedCount: number): { headline: string; subline: string } {
  if (score >= 80) {
    return {
      headline: 'AI engines can read you clearly',
      subline:
        failedCount > 0
          ? `A strong foundation — ${failedCount} remaining ${failedCount === 1 ? 'fix' : 'fixes'} would push you toward the top of the answer.`
          : 'Keep publishing — your machinery is in order.',
    };
  }
  if (score >= 60) {
    return {
      headline: 'Visible, but leaving answers on the table',
      subline: `${failedCount} ${failedCount === 1 ? 'check is' : 'checks are'} holding your content back from being cited more often.`,
    };
  }
  return {
    headline: 'AI engines are struggling to use your site',
    subline: `${failedCount} failing ${failedCount === 1 ? 'check' : 'checks'} — the plan below is ordered by how much each one moves your score.`,
  };
}

export function buildReportStoryData(scan: ScanResponse): ReportStoryData | null {
  const score = typeof scan.score === 'number' ? Math.max(0, Math.min(100, scan.score)) : null;
  if (score === null) return null;

  const allIssues: Issue[] = Array.isArray(scan.issues) && scan.issues.length > 0 ? scan.issues : scan.topIssues;

  let passed = 0;
  let warning = 0;
  let failed = 0;
  let notTested = 0;
  for (const issue of allIssues) {
    const outcome = outcomeOf(issue);
    if (outcome === 'passed') passed += 1;
    else if (outcome === 'warning') warning += 1;
    else if (outcome === 'failed') failed += 1;
    else notTested += 1;
  }
  const total = passed + warning + failed + notTested;

  const outcomes: OutcomeSlice[] =
    total > 0
      ? (
          [
            { outcome: 'passed' as const, label: 'Passing', count: passed },
            { outcome: 'warning' as const, label: 'Warnings', count: warning },
            { outcome: 'failed' as const, label: 'Failing', count: failed },
            { outcome: 'not_tested' as const, label: 'Not tested', count: notTested },
          ]
        )
          .filter((slice) => slice.count > 0)
          .map((slice) => ({ ...slice, share: slice.count / total }))
      : [];

  const categories: CategoryBarRow[] = (scan.categoryScores ?? [])
    .filter((row): row is CategoryScore => typeof row?.score === 'number')
    .map((row) => {
      // Category scores arrive either 0..1 or 0..100 depending on the writer; normalize to 0..100.
      const normalized = row.score <= 1 ? Math.round(row.score * 100) : Math.round(row.score);
      return {
        category: row.category,
        label: categoryLabel(row.category),
        score: Math.max(0, Math.min(100, normalized)),
        letterGrade: row.letterGrade,
        checkCount: row.checkCount,
        tone: toneForScore(normalized),
      };
    })
    .sort((a, b) => a.score - b.score);

  const failedIssues = allIssues
    .filter((issue) => outcomeOf(issue) === 'failed')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const maxWeight = failedIssues[0]?.weight ?? 0;
  const actions: StoryAction[] = failedIssues.slice(0, 5).map((issue) => ({
    title: issue.check ?? issue.checkId ?? 'Check',
    fix: issue.fix ?? null,
    weight: issue.weight ?? 0,
    impact: maxWeight > 0 ? (issue.weight ?? 0) / maxWeight : 0,
  }));

  // Weight-proportional estimate: failed weight over total weight scales the remaining headroom.
  const totalWeight = allIssues.reduce((sum, issue) => sum + (issue.weight ?? 0), 0);
  const failedWeight = failedIssues.reduce((sum, issue) => sum + (issue.weight ?? 0), 0);
  const projectedScore =
    totalWeight > 0 && failedWeight > 0
      ? Math.min(100, score + Math.round((100 - score) * (failedWeight / totalWeight) + (100 - score) * 0.2))
      : null;

  const { headline, subline } = headlineFor(score, failed);

  return {
    score,
    grade: scan.letterGrade ?? '—',
    headline,
    subline,
    outcomes,
    totalChecks: total,
    passedChecks: passed,
    categories,
    actions,
    projectedScore,
  };
}
