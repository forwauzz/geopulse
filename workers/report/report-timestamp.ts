/**
 * Report generation timestamp (issue #94): the recipient must be able to see WHEN
 * the report was produced — date AND time — on the cover itself. UTC keeps it
 * unambiguous across the sender's and recipient's timezones.
 */
export function formatReportTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toISOString().split('T')[0] ?? '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date}, ${hh}:${mm} UTC`;
}
