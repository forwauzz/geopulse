import type { IssueRow } from './deep-audit-report-helpers';
import type { TeamOwner } from './team-owner-map';

export type ImmediateWinPayload = {
  readonly checkId: string;
  readonly checkName: string;
  readonly what: string;
  readonly who: TeamOwner;
  readonly why: string;
  readonly how: string;
  readonly effort: 'Quick' | 'Moderate';
  readonly weight: number;
};

function normalizeSentence(value: string | undefined, fallback: string): string {
  const text = (value ?? '').trim();
  if (!text) return fallback;
  return text.endsWith('.') ? text : `${text}.`;
}

function deriveWhat(issue: IssueRow): string {
  if (issue.fix && issue.fix.trim().length > 0) return normalizeSentence(issue.fix, 'Address this issue.');
  const label = issue.check ?? issue.checkId ?? 'this issue';
  return `Address ${label}.`;
}

function deriveWhy(issue: IssueRow): string {
  if (issue.finding && issue.finding.trim().length > 0) return normalizeSentence(issue.finding, 'The audit flagged this issue.');
  const label = issue.check ?? issue.checkId ?? 'This check';
  return `${label} was flagged by the audit and should be addressed.`;
}

function deriveHow(issue: IssueRow): string {
  if (issue.fix && issue.fix.trim().length > 0) {
    return `Start with this implementation step: ${normalizeSentence(issue.fix, 'Address this issue.')}`;
  }
  const label = issue.check ?? issue.checkId ?? 'this issue';
  return `Review the pages or templates associated with ${label} and apply the recommended fix.`;
}

function deriveEffort(issue: IssueRow): 'Quick' | 'Moderate' {
  const moderateChecks = new Set([
    'llm-qa-pattern',
    'llm-extractability',
    'internal-links',
    'freshness',
  ]);
  const key = issue.checkId ?? issue.check ?? '';
  return moderateChecks.has(key) ? 'Moderate' : 'Quick';
}

function qualifies(issue: IssueRow): issue is IssueRow & { teamOwner: TeamOwner } {
  const status = (issue.status ?? '').toUpperCase();
  const confidence = (issue.confidence ?? '').toLowerCase();
  return (
    !!issue.teamOwner &&
    (status === 'FAIL' || status === 'WARNING' || (status === '' && issue.passed === false)) &&
    (issue.weight ?? 0) >= 5 &&
    confidence !== 'low'
  );
}

export function buildImmediateWins(issues: readonly IssueRow[]): ImmediateWinPayload[] {
  return issues
    .filter(qualifies)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 5)
    .map((issue) => ({
      checkId: issue.checkId ?? issue.check ?? 'unknown-check',
      checkName: issue.check ?? issue.checkId ?? 'Check',
      what: deriveWhat(issue),
      who: issue.teamOwner,
      why: deriveWhy(issue),
      how: deriveHow(issue),
      effort: deriveEffort(issue),
      weight: issue.weight ?? 0,
    }));
}
