/**
 * Montréal-local → UTC conversion for admin scheduling inputs (issue #108).
 *
 * A <input type="datetime-local"> posts a naive "YYYY-MM-DDTHH:mm" with no zone.
 * The admin thinks in Montréal time, so we interpret it as America/Toronto (same
 * zone) and convert with a two-pass Intl offset resolution that survives DST.
 */

const ZONE = 'America/Toronto';

function zoneWallClock(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  return Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']) === 24 ? 0 : Number(parts['hour']),
    Number(parts['minute'])
  );
}

/**
 * "2026-07-22T09:00" (Montréal wall clock) → UTC ISO string, or null when the input
 * is blank/invalid. Two Intl passes converge across DST transitions.
 */
export function montrealLocalToUtcIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const wallUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!Number.isFinite(wallUtc)) return null;

  // Pass 1: assume the wall time IS UTC, measure the zone offset there.
  let guess = wallUtc - (zoneWallClock(wallUtc) - wallUtc);
  // Pass 2: re-measure at the guessed instant (handles DST boundary crossings).
  guess = wallUtc - (zoneWallClock(guess) - guess);

  const d = new Date(guess);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Resolve a scheduling input to the effective first-run time: blank → now (next
 * hourly tick); a past time → now (never silently future-shift, never reject).
 */
export function resolveFirstRunAt(localInput: string, nowMs: number): string {
  const scheduled = montrealLocalToUtcIso(localInput);
  if (!scheduled) return new Date(nowMs).toISOString();
  return new Date(scheduled).getTime() <= nowMs ? new Date(nowMs).toISOString() : scheduled;
}
