import { describe, expect, it } from 'vitest';
import { formatDistributionTime } from './distribution-time-display';

describe('distribution timestamp display', () => {
  it('shows the Toronto expiry, not an unlabeled server-local UTC time', () => {
    expect(formatDistributionTime('2026-09-21T22:59:19.762+00:00'))
      .toBe('Sep 21, 2026, 6:59 PM EDT');
  });

  it('makes daylight saving transitions explicit', () => {
    expect(formatDistributionTime('2026-12-21T22:59:19.762+00:00'))
      .toBe('Dec 21, 2026, 5:59 PM EST');
  });

  it('preserves empty and malformed states', () => {
    expect(formatDistributionTime(null)).toBe('-');
    expect(formatDistributionTime('not-a-date')).toBe('Unknown');
  });
});
