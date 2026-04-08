import { describe, expect, it } from 'vitest';
import { resolvePlanFromSubscriptions } from './subscription-plan-sync';

describe('subscription-plan-sync', () => {
  it('keeps the highest live coarse plan across active subscriptions', () => {
    expect(
      resolvePlanFromSubscriptions([
        { bundle_key: 'startup_dev', stripe_subscription_id: 'sub_1', status: 'active' },
        { bundle_key: 'agency_core', stripe_subscription_id: 'sub_2', status: 'trialing' },
        { bundle_key: 'startup_lite', stripe_subscription_id: 'sub_3', status: 'active' },
      ])
    ).toBe('agency');
  });

  it('returns free when no live subscription remains', () => {
    expect(
      resolvePlanFromSubscriptions([
        { bundle_key: 'startup_dev', stripe_subscription_id: 'sub_1', status: 'cancelled' },
        { bundle_key: 'agency_core', stripe_subscription_id: 'sub_2', status: 'past_due' },
      ])
    ).toBe('free');
  });
});
