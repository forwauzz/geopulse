import { describe, expect, it } from 'vitest';
import {
  ADMIN_COMP_STRIPE_PRICE_ID,
  adminCompStripeSubscriptionId,
  bundleKeyForAdminPlan,
  isAdminCompStripeSubscriptionId,
} from './admin-comp-subscription';

describe('admin-comp-subscription', () => {
  it('adminCompStripeSubscriptionId is stable and distinct from Stripe sub_* ids', () => {
    const uid = '550e8400-e29b-41d4-a716-446655440000';
    expect(adminCompStripeSubscriptionId(uid)).toBe(`admin_comp:${uid}`);
    expect(adminCompStripeSubscriptionId(uid)).not.toMatch(/^sub_/);
  });

  it('isAdminCompStripeSubscriptionId', () => {
    expect(isAdminCompStripeSubscriptionId('admin_comp:x')).toBe(true);
    expect(isAdminCompStripeSubscriptionId('sub_123')).toBe(false);
  });

  it('bundleKeyForAdminPlan maps coarse plan to bundle', () => {
    expect(bundleKeyForAdminPlan('pro')).toBe('startup_dev');
    expect(bundleKeyForAdminPlan('agency')).toBe('agency_core');
  });

  it('ADMIN_COMP_STRIPE_PRICE_ID is a non-empty placeholder', () => {
    expect(ADMIN_COMP_STRIPE_PRICE_ID.length).toBeGreaterThan(0);
  });
});
