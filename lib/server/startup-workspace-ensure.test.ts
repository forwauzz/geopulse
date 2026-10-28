import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureStartupWorkspace } from './startup-workspace-ensure';

const stripeSubscriptionsList = vi.fn();

vi.mock('./stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    subscriptions: { list: stripeSubscriptionsList },
  })),
}));

vi.mock('./stripe/subscription-handlers', () => ({
  handleSubscriptionUpserted: vi.fn(),
}));

vi.mock('./billing/provision-workspace-for-subscription', () => ({
  provisionWorkspaceForSubscription: vi.fn(),
}));

vi.mock('./structured-log', () => ({
  structuredLog: vi.fn(),
  structuredError: vi.fn(),
}));

type QueryResult = { data: unknown; error: unknown };

function clientWithResults(results: Record<string, QueryResult[]>) {
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
        chain[method] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(async () =>
        results[table]?.shift() ?? { data: null, error: null }
      );
      return chain;
    }),
  };
}

describe('ensureStartupWorkspace', () => {
  beforeEach(() => vi.resetAllMocks());

  it('stops before Stripe when the subscription lookup returns a database error', async () => {
    const supabase = clientWithResults({
      user_subscriptions: [{ data: null, error: { code: 'PGRST000' } }],
    });

    const result = await ensureStartupWorkspace({
      supabase: supabase as never,
      stripeSecretKey: 'stripe-secret',
      userId: 'user-1',
    });

    expect(result).toEqual({ kind: 'database_unavailable', stage: 'subscription_lookup' });
    expect(stripeSubscriptionsList).not.toHaveBeenCalled();
  });

  it('stops before Stripe when the customer lookup returns a database error', async () => {
    const supabase = clientWithResults({
      user_subscriptions: [{ data: null, error: null }],
      users: [{ data: null, error: { code: 'PGRST000' } }],
    });

    const result = await ensureStartupWorkspace({
      supabase: supabase as never,
      stripeSecretKey: 'stripe-secret',
      userId: 'user-1',
    });

    expect(result).toEqual({ kind: 'database_unavailable', stage: 'stripe_customer_lookup' });
    expect(stripeSubscriptionsList).not.toHaveBeenCalled();
  });

  it('preserves a successful empty lookup as no customer', async () => {
    const supabase = clientWithResults({
      user_subscriptions: [{ data: null, error: null }],
      users: [{ data: null, error: null }],
    });

    const result = await ensureStartupWorkspace({
      supabase: supabase as never,
      stripeSecretKey: 'stripe-secret',
      userId: 'user-1',
    });

    expect(result).toEqual({ kind: 'no_stripe_customer' });
    expect(stripeSubscriptionsList).not.toHaveBeenCalled();
  });

  it('classifies Stripe list failure as a retryable provider outage', async () => {
    stripeSubscriptionsList.mockRejectedValueOnce(new Error('stripe unavailable'));
    const supabase = clientWithResults({
      user_subscriptions: [{ data: null, error: null }],
      users: [{ data: { stripe_customer_id: 'cus_123' }, error: null }],
    });

    const result = await ensureStartupWorkspace({
      supabase: supabase as never,
      stripeSecretKey: 'stripe-secret',
      userId: 'user-1',
    });

    expect(result).toEqual({ kind: 'provider_unavailable', provider: 'stripe' });
  });
});
