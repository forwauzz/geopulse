import { describe, expect, it } from 'vitest';
import { readBillingDashboardData } from './billing-dashboard-read';

describe('billing dashboard evidence boundary', () => {
  it.each([
    'auth_lookup',
    'subscription_lookup',
    'user_lookup',
    'bundle_lookup',
    'monitoring_subscription_configuration',
    'monitoring_subscription_lookup',
  ])('surfaces a returned %s failure instead of empty billing state', async (stage) => {
    await expect(
      readBillingDashboardData(stage, Promise.resolve({
        data: null,
        error: { code: 'PGRST000', message: 'provider detail must not reach the page' },
      })),
    ).rejects.toMatchObject({
      name: 'BillingDashboardUnavailableError',
      message: 'billing_dashboard_unavailable',
      stage,
    });
  });

  it('surfaces a thrown query failure using the same sanitized contract', async () => {
    await expect(
      readBillingDashboardData(
        'subscription_lookup',
        Promise.reject(new Error('database host is unavailable')),
      ),
    ).rejects.toMatchObject({
      name: 'BillingDashboardUnavailableError',
      message: 'billing_dashboard_unavailable',
      stage: 'subscription_lookup',
    });
  });

  it('preserves a genuine empty result as an available billing state', async () => {
    await expect(
      readBillingDashboardData('subscription_lookup', Promise.resolve({
        data: null,
        error: null,
      })),
    ).resolves.toBeNull();
  });

  it('returns healthy billing data unchanged', async () => {
    const subscription = { bundle_key: 'startup_dev', status: 'active' };
    await expect(
      readBillingDashboardData('subscription_lookup', Promise.resolve({
        data: subscription,
        error: null,
      })),
    ).resolves.toEqual(subscription);
  });
});
