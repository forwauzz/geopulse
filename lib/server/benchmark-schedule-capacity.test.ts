import { describe, expect, it } from 'vitest';
import { buildBenchmarkScheduleCapacitySummary } from './benchmark-schedule-capacity';

describe('buildBenchmarkScheduleCapacitySummary', () => {
  it('calculates current-lane capacity and 1000-site scenarios', () => {
    const summary = buildBenchmarkScheduleCapacitySummary({
      selectedDomainCount: 21,
      queryCount: 8,
      runModeCount: 2,
      maxRunsPerWindow: 42,
      windowHours: 12,
    });

    expect(summary).toEqual({
      selectedDomainCount: 21,
      queryCount: 8,
      runModeCount: 2,
      maxRunsPerWindow: 42,
      windowHours: 12,
      windowsPerDay: 2,
      maxRunsPerDay: 84,
      maxDomainsPerWindow: 21,
      maxDomainsPerDay: 42,
      selectedRunGroupCount: 42,
      selectedQueryRunCount: 336,
      selectedWindowsNeeded: 1,
      selectedDaysNeeded: 0.5,
      scenarios: [
        {
          domainCount: 100,
          runGroupCount: 200,
          queryRunCount: 1600,
          windowsNeeded: 5,
          daysNeeded: 2.38,
        },
        {
          domainCount: 200,
          runGroupCount: 400,
          queryRunCount: 3200,
          windowsNeeded: 10,
          daysNeeded: 4.76,
        },
        {
          domainCount: 500,
          runGroupCount: 1000,
          queryRunCount: 8000,
          windowsNeeded: 24,
          daysNeeded: 11.9,
        },
        {
          domainCount: 1000,
          runGroupCount: 2000,
          queryRunCount: 16000,
          windowsNeeded: 48,
          daysNeeded: 23.81,
        },
      ],
    });
  });

  it('normalizes invalid values and supports custom targets', () => {
    const summary = buildBenchmarkScheduleCapacitySummary({
      selectedDomainCount: -5,
      queryCount: 0,
      runModeCount: 0,
      maxRunsPerWindow: 0,
      windowHours: 48,
      targetDomainCounts: [50, 50, 125],
    });

    expect(summary.windowsPerDay).toBe(1);
    expect(summary.maxRunsPerDay).toBe(1);
    expect(summary.maxDomainsPerWindow).toBe(1);
    expect(summary.selectedRunGroupCount).toBe(0);
    expect(summary.scenarios).toEqual([
      {
        domainCount: 50,
        runGroupCount: 50,
        queryRunCount: 50,
        windowsNeeded: 50,
        daysNeeded: 50,
      },
      {
        domainCount: 125,
        runGroupCount: 125,
        queryRunCount: 125,
        windowsNeeded: 125,
        daysNeeded: 125,
      },
    ]);
  });

  it('uses the default scenarios when targetDomainCounts is an empty array', () => {
    const summary = buildBenchmarkScheduleCapacitySummary({
      selectedDomainCount: 17,
      queryCount: 6,
      runModeCount: 2,
      maxRunsPerWindow: 34,
      windowHours: 12,
      targetDomainCounts: [],
    });

    expect(summary.scenarios).toEqual([
      {
        domainCount: 100,
        runGroupCount: 200,
        queryRunCount: 1200,
        windowsNeeded: 6,
        daysNeeded: 2.94,
      },
      {
        domainCount: 200,
        runGroupCount: 400,
        queryRunCount: 2400,
        windowsNeeded: 12,
        daysNeeded: 5.88,
      },
      {
        domainCount: 500,
        runGroupCount: 1000,
        queryRunCount: 6000,
        windowsNeeded: 30,
        daysNeeded: 14.71,
      },
      {
        domainCount: 1000,
        runGroupCount: 2000,
        queryRunCount: 12000,
        windowsNeeded: 59,
        daysNeeded: 29.41,
      },
    ]);
  });
});
