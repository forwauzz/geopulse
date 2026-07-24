import { describe, expect, it } from 'vitest';
import { chooseInstagramFormat, scoreInstagramPerformance } from './instagram-organic-strategy';

const metrics = (overrides: Partial<Parameters<typeof scoreInstagramPerformance>[0]>) => ({
  qualifiedProfileVisits: 0,
  linkClicks: 0,
  scans: 0,
  activatedAccounts: 0,
  subscriptions: 0,
  follows: 0,
  reach: 0,
  ...overrides,
});

describe('Instagram organic learning', () => {
  it('optimizes for scans and paid monitoring rather than reach alone', () => {
    const viral = { id: 'viral', performance: metrics({ reach: 100_000, follows: 50 }) };
    const converting = { id: 'proof', performance: metrics({ reach: 2_000, scans: 4, subscriptions: 1 }) };
    expect(chooseInstagramFormat([viral, converting])?.id).toBe('proof');
  });

  it('keeps the score deterministic for scheduled learning', () => {
    expect(scoreInstagramPerformance(metrics({ subscriptions: 1, scans: 2 }))).toBe(140);
  });
});
