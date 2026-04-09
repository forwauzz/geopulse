const REPORT_PATH_PREFIX = '/results';

export function buildReportPath(scanId: string): string {
  const trimmed = scanId.trim();
  if (!trimmed) {
    return `${REPORT_PATH_PREFIX}/`;
  }
  return `${REPORT_PATH_PREFIX}/${encodeURIComponent(trimmed)}/report`;
}

export function buildReportUrl(baseUrl: string, scanId: string): string {
  return `${baseUrl.replace(/\/$/, '')}${buildReportPath(scanId)}`;
}
