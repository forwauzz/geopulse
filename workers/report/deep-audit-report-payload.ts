import { parseIssues, type IssueRow } from './deep-audit-report-helpers';
import { buildImmediateWins, type ImmediateWinPayload } from './immediate-wins';

/**
 * Canonical structured report for deep audits (DA-003) - PDF + Markdown + R2 derive from this.
 */
export type DeepAuditReportPagePayload = {
  readonly url: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly issuesJson: readonly IssueRow[];
  readonly section: string | null;
};

export type CategoryScorePayload = {
  readonly category: string;
  readonly score: number;
  readonly letterGrade: string;
  readonly checkCount: number;
};

export type TechnicalAppendixPayload = {
  readonly robotsSummary?: string | null;
  readonly schemaSummary?: string | null;
  readonly headersSummary?: string | null;
};

export type DeepAuditReportPayload = {
  readonly version: 1;
  readonly scanId: string;
  readonly runId: string;
  readonly domain: string;
  readonly seedUrl: string;
  readonly aggregateScore: number | null;
  readonly aggregateLetterGrade: string | null;
  /** Top highlighted issues (typically failed checks) for the executive summary. */
  readonly highlightedIssues: readonly IssueRow[];
  /** Full deduplicated sitewide check set used for report breakdowns. */
  readonly allIssues: readonly IssueRow[];
  /** Internal-only prefiltered ticket candidates for future narrative sections. */
  readonly immediateWins: readonly ImmediateWinPayload[];
  readonly coverageSummary: unknown;
  readonly technicalAppendix?: TechnicalAppendixPayload;
  readonly categoryScores?: readonly CategoryScorePayload[];
  readonly pages: readonly DeepAuditReportPagePayload[];
  readonly generatedAt: string;
};

export type PageRowInput = {
  readonly url: string;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly issues_json: unknown;
  readonly section?: string | null;
};

export function buildDeepAuditReportPayload(input: {
  readonly scanId: string;
  readonly runId: string;
  readonly domain: string;
  readonly seedUrl: string;
  readonly aggregateScore: number;
  readonly aggregateLetterGrade: string;
  readonly pages: readonly PageRowInput[];
  readonly coverageSummary: unknown;
  readonly highlightedIssues: unknown;
  readonly allIssues: unknown;
  readonly technicalAppendix?: TechnicalAppendixPayload;
  readonly categoryScores?: readonly CategoryScorePayload[];
  readonly generatedAt?: string;
}): DeepAuditReportPayload {
  const allIssues = parseIssues(input.allIssues);
  const highlightedIssues = parseIssues(input.highlightedIssues);

  const pages: DeepAuditReportPagePayload[] = input.pages.map((p) => ({
    url: p.url,
    score: p.score,
    letterGrade: p.letter_grade,
    issuesJson: parseIssues(p.issues_json),
    section: p.section ?? null,
  }));

  return {
    version: 1,
    scanId: input.scanId,
    runId: input.runId,
    domain: input.domain,
    seedUrl: input.seedUrl,
    aggregateScore: input.aggregateScore,
    aggregateLetterGrade: input.aggregateLetterGrade,
    highlightedIssues,
    allIssues,
    immediateWins: buildImmediateWins(allIssues),
    coverageSummary: input.coverageSummary,
    technicalAppendix: input.technicalAppendix,
    categoryScores: input.categoryScores,
    pages,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
