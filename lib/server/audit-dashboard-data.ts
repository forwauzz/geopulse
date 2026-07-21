/**
 * View-model for the signed-in dashboard overview.
 *
 * Everything here is derived from scans the user already ran — no new tracking. Cards that would
 * need measurement we do not do for self-serve users (AI-engine citation visibility) are declared
 * in the component as "coming soon" rather than synthesized here; this module only ever reports
 * what a scan actually measured.
 */

export type AuditScanRow = {
  readonly id: string;
  readonly url: string | null;
  readonly domain: string | null;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly created_at: string | null;
  readonly issues_json: unknown;
  readonly full_results_json: unknown;
};

type ScanIssue = {
  readonly checkId: string;
  readonly check: string;
  readonly passed: boolean;
  readonly weight: number;
  readonly finding: string;
  readonly fix: string | null;
};

export type ActionSeverity = 'high' | 'medium' | 'low';

export type DashboardBotAccess = {
  readonly name: string;
  readonly blocked: boolean;
};

export type AuditDashboardView = {
  readonly latest: {
    readonly scanId: string;
    readonly domain: string;
    readonly score: number;
    readonly grade: string;
    readonly createdAt: string | null;
  } | null;
  /** Null when the latest scan did not run the robots check. */
  readonly botAccess: readonly DashboardBotAccess[] | null;
  readonly structuredData: {
    readonly percent: number;
    readonly parts: ReadonlyArray<{ readonly label: string; readonly passed: boolean }>;
  } | null;
  /** Chronological scores across the user's scans; a trend needs at least 2 points. */
  readonly trendPoints: ReadonlyArray<{ readonly score: number; readonly createdAt: string | null }>;
  readonly priorityActions: ReadonlyArray<{
    readonly scanId: string;
    readonly title: string;
    readonly severity: ActionSeverity;
    readonly fix: string | null;
  }>;
  readonly recent: ReadonlyArray<{
    readonly scanId: string;
    readonly domain: string;
    readonly score: number | null;
    readonly grade: string | null;
    readonly createdAt: string | null;
  }>;
};

/** The bots shown on the access card — the engines users actually ask about. */
const DISPLAY_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot'] as const;

const STRUCTURED_DATA_CHECKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'jsonld', label: 'JSON-LD' },
  { id: 'schema-types', label: 'Schema types' },
  { id: 'open-graph', label: 'Open Graph' },
];

function asIssueArray(raw: unknown): ScanIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ScanIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const checkId = typeof rec['checkId'] === 'string' ? rec['checkId'] : '';
    const check = typeof rec['check'] === 'string' ? rec['check'] : checkId;
    if (!checkId && !check) continue;
    out.push({
      checkId: checkId || check,
      check: check || checkId,
      passed: rec['passed'] === true,
      weight: typeof rec['weight'] === 'number' ? rec['weight'] : 0,
      finding: typeof rec['finding'] === 'string' ? rec['finding'] : '',
      fix: typeof rec['fix'] === 'string' ? rec['fix'] : null,
    });
  }
  return out;
}

/**
 * Full issue list for a scan. Free scans store every check in both places; deep audits rewrite
 * `issues_json` down to the top three, keeping the full list in `full_results_json`.
 */
export function extractScanIssues(scan: AuditScanRow): ScanIssue[] {
  const full = scan.full_results_json;
  if (full && typeof full === 'object') {
    const rec = full as Record<string, unknown>;
    const fromFull = asIssueArray(rec['issues']);
    if (fromFull.length > 0) return fromFull;
    const fromAll = asIssueArray(rec['allIssues']);
    if (fromAll.length > 0) return fromAll;
  }
  return asIssueArray(scan.issues_json);
}

/**
 * Per-bot access derived from the `ai-crawler-access` check. On failure the finding names the
 * blocked bots, so membership in that text is the signal; a passing check means nothing is
 * blocked. Null when the scan never ran the check.
 */
export function deriveBotAccess(issues: ScanIssue[]): DashboardBotAccess[] | null {
  const check = issues.find((i) => i.checkId === 'ai-crawler-access');
  if (!check) return null;
  return DISPLAY_BOTS.map((name) => ({
    name,
    blocked: !check.passed && check.finding.includes(name),
  }));
}

export function deriveStructuredDataHealth(
  issues: ScanIssue[]
): { percent: number; parts: Array<{ label: string; passed: boolean }> } | null {
  const parts: Array<{ label: string; passed: boolean }> = [];
  for (const def of STRUCTURED_DATA_CHECKS) {
    const found = issues.find((i) => i.checkId === def.id);
    if (found) parts.push({ label: def.label, passed: found.passed });
  }
  if (parts.length === 0) return null;
  const percent = Math.round((parts.filter((p) => p.passed).length / parts.length) * 100);
  return { percent, parts };
}

export function severityForWeight(weight: number): ActionSeverity {
  if (weight >= 8) return 'high';
  if (weight >= 4) return 'medium';
  return 'low';
}

/** rows come newest-first (query order); every derived list keeps that meaning explicit. */
export function buildAuditDashboardView(rows: AuditScanRow[]): AuditDashboardView {
  const newest = rows[0] ?? null;
  const latestIssues = newest ? extractScanIssues(newest) : [];

  const priorityActions = newest
    ? latestIssues
        .filter((i) => !i.passed)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4)
        .map((i) => ({
          scanId: newest.id,
          title: i.check,
          severity: severityForWeight(i.weight),
          fix: i.fix,
        }))
    : [];

  return {
    latest:
      newest && typeof newest.score === 'number'
        ? {
            scanId: newest.id,
            domain: newest.domain || newest.url || '',
            score: newest.score,
            grade: newest.letter_grade ?? '—',
            createdAt: newest.created_at,
          }
        : null,
    botAccess: newest ? deriveBotAccess(latestIssues) : null,
    structuredData: newest ? deriveStructuredDataHealth(latestIssues) : null,
    trendPoints: [...rows]
      .reverse()
      .filter((r): r is AuditScanRow & { score: number } => typeof r.score === 'number')
      .map((r) => ({ score: r.score, createdAt: r.created_at })),
    priorityActions,
    recent: rows.slice(0, 6).map((r) => ({
      scanId: r.id,
      domain: r.domain || r.url || '',
      score: r.score,
      grade: r.letter_grade,
      createdAt: r.created_at,
    })),
  };
}
