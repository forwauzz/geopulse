import { describe, expect, it } from 'vitest';
import {
  CADENCE_DAYS,
  computeNextRun,
  findingsForRecurringDelta,
  loadUserSchedule,
} from './recurring-audits';

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

describe('findingsForRecurringDelta', () => {
  it('normalizes scanner output into stable check+URL snapshots', () => {
    expect(findingsForRecurringDelta('https://clinic.ca/', [
      { checkId: 'canonical', passed: false, status: 'FAIL', fix: 'Add canonical.' },
    ])).toEqual([{ checkId: 'canonical', url: 'https://clinic.ca/', status: 'FAIL', fix: 'Add canonical.' }]);
  });
});

describe('loadUserSchedule', () => {
  function scheduleClient(result: { data: unknown; error: unknown }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => result,
          }),
        }),
      }),
    };
  }

  it('preserves a successful empty schedule as no schedule', async () => {
    await expect(loadUserSchedule(
      scheduleClient({ data: null, error: null }) as never,
      'user-1'
    )).resolves.toBeNull();
  });

  it('does not convert a database failure into an absent schedule', async () => {
    const error = Object.assign(new Error('database unavailable'), { code: 'PGRST000' });

    await expect(loadUserSchedule(
      scheduleClient({ data: null, error }) as never,
      'user-1'
    )).rejects.toBe(error);
  });
});
