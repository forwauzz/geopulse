import { getTeamOwner, type TeamOwner } from './team-owner-map';

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
  teamOwner?: TeamOwner;
};

function normalizeIssueRow(raw: unknown): IssueRow | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as IssueRow;
  const checkKey =
    (typeof row.checkId === 'string' && row.checkId.length > 0
      ? row.checkId
      : typeof row.check === 'string' && row.check.length > 0
        ? row.check
        : undefined) ?? undefined;

  return {
    ...row,
    teamOwner: checkKey ? getTeamOwner(checkKey) : undefined,
  };
}

export function parseIssues(raw: unknown): IssueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => normalizeIssueRow(x))
    .filter((x): x is IssueRow => x !== null);
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

function looksLikeHttpTransportToken(value: string): boolean {
  return /^https?[_\s-]?\d{3}$/i.test(value.trim());
}

export function customerFacingFinding(row: IssueRow): string {
  const finding = (row.finding ?? '').trim();
  if (!finding) return '';

  if (looksLikeHttpTransportToken(finding)) {
    const status = issueStatusLabel(row);
    if (status === 'LOW_CONFIDENCE') {
      return 'The audit could not confidently evaluate this check because page access or delivery behavior interfered with LLM processing. Verify bot handling, access rules, and origin responses before treating this as a confirmed content issue.';
    }

    return 'The audit encountered a page-access or delivery response while evaluating this check. Verify the underlying response behavior before treating this as a confirmed content issue.';
  }

  return finding;
}
