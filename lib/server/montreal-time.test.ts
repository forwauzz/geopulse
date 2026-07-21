import { describe, expect, it } from 'vitest';
import { montrealLocalToUtcIso, resolveFirstRunAt } from './montreal-time';

describe('montrealLocalToUtcIso (issue #108)', () => {
  it('converts an EDT summer wall time (UTC-4)', () => {
    expect(montrealLocalToUtcIso('2026-07-22T09:00')).toBe('2026-07-22T13:00:00.000Z');
  });

  it('converts an EST winter wall time (UTC-5)', () => {
    expect(montrealLocalToUtcIso('2026-01-15T09:00')).toBe('2026-01-15T14:00:00.000Z');
  });

  it('handles the spring-forward boundary sanely', () => {
    // 2026-03-08 02:30 does not exist in Montréal; the conversion must still return
    // a valid instant near the gap rather than throwing.
    const out = montrealLocalToUtcIso('2026-03-08T02:30');
    expect(out).not.toBeNull();
    expect(new Date(out as string).getTime()).toBeGreaterThan(Date.UTC(2026, 2, 8, 5, 0));
  });

  it('rejects blank and malformed input', () => {
    expect(montrealLocalToUtcIso('')).toBeNull();
    expect(montrealLocalToUtcIso('tomorrow at 9')).toBeNull();
  });
});

describe('resolveFirstRunAt', () => {
  const now = Date.UTC(2026, 6, 21, 22, 0); // 2026-07-21T22:00Z

  it('blank input schedules for now (next hourly tick)', () => {
    expect(resolveFirstRunAt('', now)).toBe(new Date(now).toISOString());
  });

  it('a future Montréal time schedules exactly there', () => {
    expect(resolveFirstRunAt('2026-07-23T08:30', now)).toBe('2026-07-23T12:30:00.000Z');
  });

  it('a past time clamps to now instead of firing retroactive cadence math', () => {
    expect(resolveFirstRunAt('2026-07-01T08:00', now)).toBe(new Date(now).toISOString());
  });
});
