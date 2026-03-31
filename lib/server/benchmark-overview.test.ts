import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkOverviewHref,
  formatBenchmarkOverviewPercent,
} from './benchmark-overview';

describe('benchmark overview helpers', () => {
  it('formats percentages conservatively', () => {
    expect(formatBenchmarkOverviewPercent(0.884)).toBe('88%');
    expect(formatBenchmarkOverviewPercent(null)).toBe('—');
  });

  it('builds filtered benchmark overview hrefs', () => {
    expect(
      buildBenchmarkOverviewHref({
        domain: 'domain-1',
        querySet: 'all',
        model: 'gemini-2.5-flash-lite',
        status: 'completed',
      })
    ).toBe('/dashboard/benchmarks?domain=domain-1&model=gemini-2.5-flash-lite&status=completed');
    expect(buildBenchmarkOverviewHref({ domain: 'all' })).toBe('/dashboard/benchmarks');
  });
});
