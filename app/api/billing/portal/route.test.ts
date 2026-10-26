import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const stripePortalCreate = vi.fn();
const userMaybeSingle = vi.fn();
const subMaybeSingle = vi.fn();
const monitorMaybeSingle = vi.fn();
const structuredError = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'stripe-secret',
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: authGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const maybeSingle =
        table === 'users'
          ? userMaybeSingle
          : table === 'monitoring_subscriptions'
            ? monitorMaybeSingle
            : subMaybeSingle;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        not: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle,
      };
      return chain;
    }),
  })),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    billingPortal: {
      sessions: {
        create: stripePortalCreate,
      },
    },
  })),
}));

vi.mock('@/lib/server/structured-log', () => ({
  structuredError,
}));

describe('billing portal route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'owner@example.com' } },
      error: null,
    });
    stripePortalCreate.mockResolvedValue({ url: 'https://stripe.test/portal' });
    userMaybeSingle.mockResolvedValue({ data: null, error: null });
    subMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_from_subscription' },
      error: null,
    });
    monitorMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('falls back to the subscription row customer id when the user row is empty', async () => {
    const { POST } = await import('./route');
    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ url: 'https://stripe.test/portal' });
    expect(stripePortalCreate).toHaveBeenCalledWith({
      customer: 'cus_from_subscription',
      return_url: 'https://getgeopulse.com/dashboard/billing',
    });
  });

  it('opens the correct monitor customer when no workspace subscription exists', async () => {
    subMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    monitorMaybeSingle.mockResolvedValueOnce({
      data: { stripe_customer_id: 'cus_from_monitor' },
      error: null,
    });
    const { POST } = await import('./route');
    const response = await POST();
    expect(response.status).toBe(200);
    expect(stripePortalCreate).toHaveBeenCalledWith({
      customer: 'cus_from_monitor',
      return_url: 'https://getgeopulse.com/dashboard/billing',
    });
  });

  it.each([
    ['user', userMaybeSingle, 'billing_customer_lookup'],
    ['subscription', subMaybeSingle, 'subscription_customer_lookup'],
    ['monitor', monitorMaybeSingle, 'monitor_customer_lookup'],
  ] as const)(
    'fails closed when the %s customer lookup returns a database error',
    async (_label, lookup, stage) => {
      if (lookup === subMaybeSingle || lookup === monitorMaybeSingle) {
        userMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      }
      if (lookup === monitorMaybeSingle) {
        subMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      }
      lookup.mockResolvedValueOnce({ data: null, error: { code: 'PGRST000' } });

      const { POST } = await import('./route');
      const response = await POST();

      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('retry-after')).toBe('300');
      expect(await response.json()).toEqual({
        error: {
          code: 'service_unavailable',
          message:
            'Billing management is temporarily unavailable. Please try again shortly.',
        },
      });
      expect(structuredError).toHaveBeenCalledWith(
        'billing_portal_database_unavailable',
        {
          stage,
          errorCode: 'PGRST000',
        }
      );
      expect(stripePortalCreate).not.toHaveBeenCalled();
    }
  );

  it('fails closed when authentication lookup throws', async () => {
    authGetUser.mockRejectedValueOnce(new Error('network unavailable'));

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    expect(stripePortalCreate).not.toHaveBeenCalled();
  });

  it('fails closed when authentication returns a provider error', async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'auth_provider_unavailable' },
    });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(stripePortalCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['user', userMaybeSingle],
    ['subscription', subMaybeSingle],
    ['monitor', monitorMaybeSingle],
  ] as const)(
    'fails closed when the %s customer lookup throws',
    async (_label, lookup) => {
      if (lookup === subMaybeSingle || lookup === monitorMaybeSingle) {
        userMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      }
      if (lookup === monitorMaybeSingle) {
        subMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      }
      lookup.mockRejectedValueOnce(new Error('network unavailable'));

      const { POST } = await import('./route');
      const response = await POST();

      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('300');
      expect(stripePortalCreate).not.toHaveBeenCalled();
    }
  );

  it('preserves a truthful no-customer response when all lookups succeed empty', async () => {
    subMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    monitorMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'no_customer',
        message: 'No billing account found for your user.',
      },
    });
    expect(stripePortalCreate).not.toHaveBeenCalled();
  });
});
