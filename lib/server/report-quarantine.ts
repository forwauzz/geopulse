export const REPORT_QUARANTINE_STATUS_KEY = 'quarantine_status';
export const REPORT_QUARANTINED_STATUS = 'quarantined';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Customer-facing report readers fail closed when an operator or policy quarantines an artifact. */
export function isReportQuarantined(metadata: unknown): boolean {
  return record(metadata)[REPORT_QUARANTINE_STATUS_KEY] === REPORT_QUARANTINED_STATUS;
}
