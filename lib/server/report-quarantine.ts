export const REPORT_QUARANTINE_STATUS_KEY = 'quarantine_status';
export const REPORT_QUARANTINED_STATUS = 'quarantined';
export const CLIENT_REPORT_HOLD_KEY = 'report_quarantine_hold';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Customer-facing report readers fail closed when an operator or policy quarantines an artifact. */
export function isReportQuarantined(metadata: unknown): boolean {
  return record(metadata)[REPORT_QUARANTINE_STATUS_KEY] === REPORT_QUARANTINED_STATUS;
}

/** A client-level review hold blocks automatic and manual public sharing until explicitly released. */
export function isClientReportSharingHeld(metadata: unknown): boolean {
  const hold = record(record(metadata)[CLIENT_REPORT_HOLD_KEY]);
  const status = hold['status'];
  return typeof status === 'string' && (status === 'held' || status.startsWith('held_'));
}

export const CLIENT_REPORT_RELEASED_STATUS = 'released';

/**
 * Client metadata with the review hold released.
 *
 * The original hold is kept rather than overwritten: the reason a client was held,
 * and by whom, is the audit trail for anything that was published afterwards. The
 * release records its own actor and time alongside it.
 *
 * Returns null when there is nothing held, so a caller cannot manufacture a release
 * record for a client that was never under review.
 */
export function releaseClientReportHold(
  metadata: unknown,
  actor: { readonly userId: string; readonly at: string },
): Record<string, unknown> | null {
  if (!isClientReportSharingHeld(metadata)) return null;
  const current = record(metadata);
  const hold = record(current[CLIENT_REPORT_HOLD_KEY]);
  return {
    ...current,
    [CLIENT_REPORT_HOLD_KEY]: {
      ...hold,
      status: CLIENT_REPORT_RELEASED_STATUS,
      released_by_user_id: actor.userId,
      released_at: actor.at,
      // Preserved verbatim so the release never erases what it overrode.
      previous_status: hold['status'] ?? null,
    },
  };
}
