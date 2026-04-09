import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const stripePortalCreate = vi.fn();
const userMaybeSingle = vi.fn();
const subMaybeSingle = vi.fn();

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
      const maybeSingle = table === 'users' ? userMaybeSingle : subMaybeSingle;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
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

describe('billing portal route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    stripePortalCreate.mockResolvedValue({ url: 'https://stripe.test/portal' });
    userMaybeSingle.mockResolvedValue({ data: null, error: null });
    subMaybeSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_from_subscription' }, error: null });
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
});
