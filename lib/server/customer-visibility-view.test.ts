import { describe, expect, it } from 'vitest';
import { loadCustomerVisibilityView, resolveCustomerVisibilityStatus } from './customer-visibility-view';

function membershipLookup(result: { data: unknown; error: unknown }) {
  return {
    from() {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  };
}

describe('customer visibility status evidence boundary', () => {
  it('surfaces a membership read failure instead of redirecting an existing customer to onboarding', async () => {
    await expect(loadCustomerVisibilityView({
      supabase: membershipLookup({ data: null, error: { code: 'PGRST000' } }),
      userId: 'customer-1',
    })).rejects.toMatchObject({
      name: 'CustomerVisibilityUnavailableError',
      message: 'customer_visibility_unavailable',
      stage: 'workspace_membership_lookup',
    });
  });

  it('preserves a genuine missing membership as the onboarding case', async () => {
    await expect(loadCustomerVisibilityView({
      supabase: membershipLookup({ data: null, error: null }),
      userId: 'new-user',
    })).resolves.toBeNull();
  });

  it('never reports measured from metadata alone', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: false,
      metadata: { baseline_status: 'measured' },
    })).toBe('failed');
  });

  it('reports measured only when the outcome engine has qualifying evidence', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: true,
      metadata: { baseline_status: 'failed' },
    })).toBe('measured');
  });

  it('preserves honest pending states and the unconfigured state', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: false,
      metadata: { baseline_status: 'running' },
    })).toBe('running');
    expect(resolveCustomerVisibilityStatus({
      configured: false,
      outcomeMeasured: false,
      metadata: null,
    })).toBe('not_configured');
  });
});
