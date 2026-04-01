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

export type PageIssuePatternSummary = {
  readonly checkName: string;
  readonly affectedPages: number;
  readonly sampleUrls: readonly string[];
  readonly sampleFinding: string;
};

export type DemandCoverageSignal = {
  readonly title: string;
  readonly status: string;
  readonly summary: string;
  readonly firstMove: string | null;
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

function readinessSummary(score: number): string {
  if (score >= 85) return 'The site shows strong baseline readiness and mainly needs targeted refinement.';
  if (score >= 70)
    return 'The site is in workable shape, but several issues still weaken how clearly machines can interpret it.';
  if (score >= 50)
    return 'The site has meaningful readiness gaps that should be addressed before broader GEO or content expansion work.';
  return 'The site has foundational readiness issues that should be fixed before expecting consistent machine visibility.';
}

export function scoreNarrative(
  score: number,
  grade: string,
  total: number,
  passed: number,
  topIssue: string,
  firstMove?: string
): string {
  const parts = [
    `Your site scored ${String(score)}/100 (${grade}).`,
    readinessSummary(score),
    `${String(passed)} of ${String(total)} checks passed.`,
    topIssue ? `The most urgent issue is ${topIssue}.` : 'No critical issues were elevated in this audit.',
    firstMove ? `Start with ${firstMove.trim().replace(/\.$/, '')}.` : null,
  ].filter((value): value is string => !!value);

  return parts.join(' ');
}

function looksLikeHttpTransportToken(value: string): boolean {
  return /^https?[_\s-]?\d{3}$/i.test(value.trim());
}

function boundedTransportMessage(lowConfidence: boolean): string {
  if (lowConfidence) {
    return 'The audit could not confidently evaluate this check because page access or delivery behavior interfered with machine retrieval. Verify bot handling, access rules, and origin responses before treating this as a confirmed content issue.';
  }

  return 'The audit encountered a page-access or delivery response while evaluating this check. Verify the underlying response behavior before treating this as a confirmed content issue.';
}

export function customerFacingFinding(row: IssueRow): string {
  const finding = (row.finding ?? '').trim();
  const status = issueStatusLabel(row);

  if (looksLikeHttpTransportToken(finding)) {
    return boundedTransportMessage(status === 'LOW_CONFIDENCE');
  }

  if (status === 'LOW_CONFIDENCE') {
    if (!finding) {
      return 'The audit saw a weak or incomplete signal for this check. Treat this as a verification item first, not a confirmed diagnosis.';
    }

    return `${finding} This signal was not strong enough to treat as a confirmed diagnosis; verify the page output, bot access, and rendered content before making a larger change.`;
  }

  if (status === 'BLOCKED') {
    if (!finding) {
      return 'The audit could not evaluate this check because access to the page or resource was blocked during analysis.';
    }

    return `${finding} This check could not be evaluated because access to the page or resource was blocked during analysis.`;
  }

  if (status === 'NOT_EVALUATED') {
    if (!finding) {
      return 'This check was not evaluated in this audit pass, so it should not be treated as a pass or failure.';
    }

    return `${finding} This check was not evaluated in this audit pass, so it should not be treated as a pass or failure.`;
  }

  if (!finding) return '';
  return finding;
}

export function summarizePageIssuePatterns(
  pages: readonly { url: string; issuesJson: readonly IssueRow[] }[]
): PageIssuePatternSummary[] {
  const buckets = new Map<
    string,
    { checkName: string; affectedPages: number; sampleUrls: string[]; sampleFinding: string }
  >();

  for (const page of pages) {
    const seenOnPage = new Set<string>();
    for (const row of page.issuesJson) {
      const status = issueStatusLabel(row);
      if (status === 'PASS' || status === 'NOT_EVALUATED') continue;

      const key = row.checkId ?? row.check ?? 'unknown-check';
      if (seenOnPage.has(key)) continue;
      seenOnPage.add(key);

      const existing = buckets.get(key) ?? {
        checkName: row.check ?? row.checkId ?? 'Check',
        affectedPages: 0,
        sampleUrls: [],
        sampleFinding: customerFacingFinding(row),
      };

      existing.affectedPages += 1;
      if (existing.sampleUrls.length < 3) {
        existing.sampleUrls.push(page.url);
      }
      if (!existing.sampleFinding) {
        existing.sampleFinding = customerFacingFinding(row);
      }
      buckets.set(key, existing);
    }
  }

  return [...buckets.values()]
    .filter((row) => row.affectedPages >= 2)
    .sort((a, b) => b.affectedPages - a.affectedPages || a.checkName.localeCompare(b.checkName))
    .slice(0, 6)
    .map((row) => ({
      checkName: row.checkName,
      affectedPages: row.affectedPages,
      sampleUrls: row.sampleUrls,
      sampleFinding: row.sampleFinding,
    }));
}

export function deriveDemandCoverageSignals(allIssues: readonly IssueRow[]): DemandCoverageSignal[] {
  const signalOrder = [
    { key: 'llm-qa-pattern', title: 'Direct question-answer structure' },
    { key: 'llm-extractability', title: 'Clear answer extraction' },
    { key: 'internal-links', title: 'Supporting page discovery' },
    { key: 'freshness', title: 'Freshness and upkeep signals' },
  ] as const;

  const byKey = new Map<string, IssueRow>();
  for (const row of allIssues) {
    const key = row.checkId ?? row.check ?? '';
    if (key && !byKey.has(key)) {
      byKey.set(key, row);
    }
  }

  const signals: Array<DemandCoverageSignal | null> = signalOrder
    .map(({ key, title }) => {
      const row = byKey.get(key);
      if (!row) return null;
      const status = issueStatusLabel(row);
      if (status === 'NOT_EVALUATED') return null;
      return {
        title,
        status,
        summary: customerFacingFinding(row) || `${title} needs follow-up based on this audit pass.`,
        firstMove: row.fix?.trim() ? row.fix.trim() : null,
      };
    });

  return signals.filter((row): row is DemandCoverageSignal => row !== null);
}
