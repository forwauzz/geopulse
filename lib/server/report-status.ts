/**
 * Derive the customer-facing report status for a scan's full audit.
 *
 * The report page uses this to decide whether to keep polling ("generating") or show a terminal
 * state. It must NOT report "generating" forever for a run that has died: a full-audit `scan_runs`
 * row existing is not proof the crawl is still in flight (Codex P1 #3). We treat a run as generating
 * only while it is plausibly active — not yet completed, or completed within the assembly grace
 * window — and otherwise fall through to the paid/none terminal states so the client fails promptly
 * instead of polling to its own timeout.
 */

export type ReportStatus = 'none' | 'generating' | 'delivered';

/** Timestamps read from a scan_runs row (all optional; a null row means no full-audit run exists). */
export type DeepRunTimestamps = {
  readonly created_at?: string | null;
  readonly started_at?: string | null;
  readonly completed_at?: string | null;
} | null;

/**
 * How long after a run's last activity we still call it "generating" with no delivered report.
 * Covers a full 30-page crawl plus LLM report assembly with margin; beyond it, a run with no report
 * is treated as failed/stale.
 */
export const DEEP_RUN_GENERATING_GRACE_MS = 20 * 60 * 1000;

export function deriveReportStatus(args: {
  readonly emailDelivered: boolean;
  readonly hasReport: boolean;
  readonly hasPaid: boolean;
  readonly run: DeepRunTimestamps;
  readonly nowMs: number;
}): ReportStatus {
  if (args.emailDelivered) return 'delivered';

  const run = args.run;
  if (run) {
    // Most recent sign of life. completed_at (assembling report) > started_at (crawling) >
    // created_at (just queued). A report already existing also keeps us in "generating" until the
    // email lands.
    const lastActivityIso = run.completed_at ?? run.started_at ?? run.created_at ?? null;
    const lastActivityMs = lastActivityIso ? Date.parse(lastActivityIso) : Number.NaN;
    const withinGrace =
      Number.isFinite(lastActivityMs) && args.nowMs - lastActivityMs < DEEP_RUN_GENERATING_GRACE_MS;
    if (args.hasReport || withinGrace) return 'generating';
    // Stale/failed run, no report → fall through to terminal state.
  }

  // Paid but the run hasn't materialized yet (queue latency): still expected to generate.
  if (args.hasPaid && !run) return 'generating';

  return 'none';
}
