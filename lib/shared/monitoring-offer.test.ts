import { describe, expect, it } from 'vitest';
import { MONTHLY_MONITORING_OFFER } from './monitoring-offer';

describe('small-business monitoring offer', () => {
  it('keeps one simple recurring plan with concrete, supportable outcomes', () => {
    expect(MONTHLY_MONITORING_OFFER.plan).toBe('monthly');
    expect(MONTHLY_MONITORING_OFFER.priceDollars).toBe(39);
    expect(MONTHLY_MONITORING_OFFER.valueProps).toHaveLength(4);
    expect(MONTHLY_MONITORING_OFFER.valueProps.map((item) => item.text)).toEqual([
      'A fresh audit and private report every month',
      'See what improved, declined, or changed',
      'Know the highest-priority action to take next',
      'Delivered automatically—nothing to manage',
    ]);
  });
});
