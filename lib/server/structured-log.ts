/**
 * Minimal structured logs for Workers (avoid ad-hoc console.log strings).
 */
export function structuredLog(event: string, data: Record<string, string | number | boolean>): void {
  const line = JSON.stringify({ event, ...data, t: Date.now() });
  // eslint-disable-next-line no-console -- Workers observability
  console.warn(line);
}
