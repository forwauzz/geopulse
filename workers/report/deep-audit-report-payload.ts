/**
 * Canonical structured report for deep audits (DA-003) — PDF + Markdown + R2 derive from this.
 */
export type DeepAuditReportPagePayload = {
  readonly url: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly issuesJson: unknown;
  readonly section: string | null;
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
  readonly highlightedIssues: unknown;
  readonly coverageSummary: unknown;
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
  readonly generatedAt?: string;
}): DeepAuditReportPayload {
  const pages: DeepAuditReportPagePayload[] = input.pages.map((p) => ({
    url: p.url,
    score: p.score,
    letterGrade: p.letter_grade,
    issuesJson: p.issues_json,
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
    highlightedIssues: input.highlightedIssues,
    coverageSummary: input.coverageSummary,
    pages,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
