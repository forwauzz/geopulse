import { describe, expect, it } from 'vitest';
import { CADENCE_DAYS, computeNextRun } from './recurring-audits';

describe('computeNextRun', () => {
  const base = Date.parse('2026-07-19T00:00:00.000Z');

  it('adds 7 days for weekly', () => {
    expect(computeNextRun('weekly', base)).toBe('2026-07-26T00:00:00.000Z');
  });

  it('adds 1 day for daily', () => {
    expect(computeNextRun('daily', base)).toBe('2026-07-20T00:00:00.000Z');
  });

  it('cadence day map is correct', () => {
    expect(CADENCE_DAYS).toEqual({ daily: 1, weekly: 7 });
  });
});
