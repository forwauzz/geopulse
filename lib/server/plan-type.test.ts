import { describe, expect, it } from 'vitest';
import { isValidPlanType, normalizePlanTypeForAdmin, PLAN_TYPE_VALUES } from './plan-type';

describe('plan-type', () => {
  it('PLAN_TYPE_VALUES matches Postgres plan_type', () => {
    expect(PLAN_TYPE_VALUES).toEqual(['free', 'pro', 'agency']);
  });

  it('isValidPlanType accepts only coarse tiers', () => {
    expect(isValidPlanType('free')).toBe(true);
    expect(isValidPlanType('pro')).toBe(true);
    expect(isValidPlanType('agency')).toBe(true);
    expect(isValidPlanType('startup_dev')).toBe(false);
    expect(isValidPlanType('')).toBe(false);
  });

  it('normalizePlanTypeForAdmin falls back for bundle-like labels', () => {
    expect(normalizePlanTypeForAdmin('startup_dev')).toBe('free');
    expect(normalizePlanTypeForAdmin('pro')).toBe('pro');
    expect(normalizePlanTypeForAdmin(null)).toBe('free');
  });
});
