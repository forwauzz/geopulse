export type IssueRow = {
  check?: string;
  checkId?: string;
  passed?: boolean;
  status?: string;
  finding?: string;
  fix?: string;
  weight?: number;
  category?: string;
  confidence?: string;
};

export function parseIssues(raw: unknown): IssueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is IssueRow => x !== null && typeof x === 'object');
}

export function severityLabel(weight: number | undefined): 'High' | 'Medium' | 'Low' {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

export function issueStatusLabel(row: IssueRow): string {
  return row.status ?? (row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—');
}

export function parseCoverageSummary(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function scoreNarrative(
  score: number,
  grade: string,
  total: number,
  passed: number,
  topIssue: string
): string {
  return `Your site scored ${String(score)}/100 (${grade}). ${String(
    passed
  )} of ${String(total)} checks passed. ${
    topIssue ? `The most critical gap is: ${topIssue}.` : 'No critical issues detected.'
  }`;
}
