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
