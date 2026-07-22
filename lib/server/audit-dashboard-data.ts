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

import { buildScoreTimeline, type ScoreTimePoint } from './dashboard-history-charts';

export type ActionSeverity = 'high' | 'medium' | 'low';

/**
 * Access & Eligibility summary for the dashboard card. Mirrors the report's Access Matrix
 * (spec C3): five RETRIEVAL destinations with eligible/blocked/not-tested states, plus the
 * training panel kept strictly separate — a business choice, never a visibility failure.
 */
export type DashboardDestinationStatus = 'eligible' | 'blocked' | 'not_tested';

export type DashboardAccessDestination = {
  readonly label: string;
  readonly status: DashboardDestinationStatus;
};

export type DashboardTrainingChoice = {
  readonly token: string;
  readonly vendor: string;
  /** null = robots.txt itself could not be read, so the choice is unknown. */
  readonly allowed: boolean | null;
};

export type DashboardAccessMatrix = {
  readonly destinations: readonly DashboardAccessDestination[];
  readonly trainingChoices: readonly DashboardTrainingChoice[];
  /** Retrieval destinations we could actually grade (eligible or blocked). */
  readonly testedCount: number;
  /** Of the tested destinations, how many are eligible. */
  readonly eligibleCount: number;
  /** True when our fetch was blocked, so most rows are Not tested rather than graded. */
  readonly pageBlocked: boolean;
};

export type AuditDashboardView = {
  readonly latest: {
    readonly scanId: string;
    readonly domain: string;
    readonly score: number;
    readonly grade: string;
    readonly createdAt: string | null;
  } | null;
  /** Null when the latest scan carries no access matrix (older scans / never persisted). */
  readonly accessMatrix: DashboardAccessMatrix | null;
  readonly structuredData: {
    readonly percent: number;
    readonly parts: ReadonlyArray<{ readonly label: string; readonly passed: boolean }>;
  } | null;
  /** Chronological scores across the user's scans; a trend needs at least 2 points. */
  readonly trendPoints: ReadonlyArray<{ readonly score: number; readonly createdAt: string | null }>;
  /** Full chronological timeline incl. not-tested runs (null score = gap), for the trend module. */
  readonly timeline: ScoreTimePoint[];
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

const DESTINATION_STATUSES: ReadonlySet<string> = new Set(['eligible', 'blocked', 'not_tested']);

function asDestinationStatus(raw: unknown): DashboardDestinationStatus | null {
  return typeof raw === 'string' && DESTINATION_STATUSES.has(raw)
    ? (raw as DashboardDestinationStatus)
    : null;
}

/**
 * Access & Eligibility summary read straight from the scan's persisted `accessMatrix`
 * (`full_results_json.accessMatrix`, spec C3). We surface the five retrieval destinations with
 * their eligible/blocked/not-tested state and the training panel as neutral choices — never
 * folding training blocks into the "blocked" count. Null when the scan predates the matrix.
 */
export function deriveAccessMatrix(scan: AuditScanRow): DashboardAccessMatrix | null {
  const full = scan.full_results_json;
  if (!full || typeof full !== 'object') return null;
  const matrix = (full as Record<string, unknown>)['accessMatrix'];
  if (!matrix || typeof matrix !== 'object') return null;
  const rec = matrix as Record<string, unknown>;

  const rowsRaw = Array.isArray(rec['rows']) ? rec['rows'] : [];
  const destinations: DashboardAccessDestination[] = [];
  for (const row of rowsRaw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const status = asDestinationStatus(r['status']);
    const label = typeof r['label'] === 'string' ? r['label'] : '';
    if (!status || !label) continue;
    destinations.push({ label, status });
  }
  if (destinations.length === 0) return null;

  const trainingRaw = Array.isArray(rec['trainingPanel']) ? rec['trainingPanel'] : [];
  const trainingChoices: DashboardTrainingChoice[] = [];
  for (const entry of trainingRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as Record<string, unknown>;
    const token = typeof t['token'] === 'string' ? t['token'] : '';
    if (!token) continue;
    trainingChoices.push({
      token,
      vendor: typeof t['vendor'] === 'string' ? t['vendor'] : '',
      allowed: typeof t['allowed'] === 'boolean' ? t['allowed'] : null,
    });
  }

  const tested = destinations.filter((d) => d.status !== 'not_tested');
  const diagnosis = rec['diagnosis'];
  const pageBlocked =
    !!diagnosis &&
    typeof diagnosis === 'object' &&
    (diagnosis as Record<string, unknown>)['pageFetched'] === false;

  return {
    destinations,
    trainingChoices,
    testedCount: tested.length,
    eligibleCount: tested.filter((d) => d.status === 'eligible').length,
    pageBlocked,
  };
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
    accessMatrix: newest ? deriveAccessMatrix(newest) : null,
    structuredData: newest ? deriveStructuredDataHealth(latestIssues) : null,
    trendPoints: [...rows]
      .reverse()
      .filter((r): r is AuditScanRow & { score: number } => typeof r.score === 'number')
      .map((r) => ({ score: r.score, createdAt: r.created_at })),
    timeline: buildScoreTimeline(rows),
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
