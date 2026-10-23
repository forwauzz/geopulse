import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const bundleMaybeSingle = vi.fn();
const subscriptionMaybeSingle = vi.fn();
const userMaybeSingle = vi.fn();
const customerLinkUpdate = vi.fn();
const customerCreate = vi.fn();
const priceRetrieve = vi.fn();
const subscriptionsList = vi.fn();
const checkoutCreate = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getPaymentApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'stripe-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
  })),
}));

vi.mock('@/lib/server/rate-limit-kv', () => ({
  checkCheckoutRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/server/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in']) {
        chain[method] = vi.fn(() => chain);
      }
      chain['update'] =
        table === 'users'
          ? vi.fn(() => ({ eq: customerLinkUpdate }))
          : vi.fn(() => chain);
      chain['maybeSingle'] =
        table === 'service_bundles'
          ? bundleMaybeSingle
          : table === 'user_subscriptions'
            ? subscriptionMaybeSingle
            : userMaybeSingle;
      return chain;
    }),
  })),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    customers: { create: customerCreate },
    prices: { retrieve: priceRetrieve },
    subscriptions: { list: subscriptionsList },
    checkout: { sessions: { create: checkoutCreate } },
  })),
}));

vi.mock('@/lib/server/qa-buyer-journey', () => ({
  validateQaBuyerJourney: vi.fn(),
  completeQaBuyerJourney: vi.fn(),
}));

vi.mock('@/lib/server/stripe/subscription-handlers', () => ({
  handleSubscriptionUpserted: vi.fn(),
}));

describe('paid bundle subscription checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'owner@example.com' } },
      error: null,
    });
    bundleMaybeSingle.mockResolvedValue({
      data: {
        bundle_key: 'startup_dev',
        billing_mode: 'paid',
        stripe_price_id: 'price_startup',
        trial_period_days: 7,
        monthly_price_cents: 3900,
      },
      error: null,
    });
    subscriptionMaybeSingle.mockResolvedValue({ data: null, error: null });
    userMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_existing' },
      error: null,
    });
    customerLinkUpdate.mockResolvedValue({ error: null });
    customerCreate.mockResolvedValue({ id: 'cus_created' });
    priceRetrieve.mockResolvedValue({ id: 'price_startup' });
    subscriptionsList.mockResolvedValue({ data: [] });
    checkoutCreate.mockResolvedValue({
      id: 'cs_subscription_1',
      url: 'https://stripe.test/subscription',
    });
  });

  function request() {
    return new Request('https://getgeopulse.com/api/billing/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bundleKey: 'startup_dev',
        turnstileToken: 'token-1',
        organizationName: 'Example MSP',
        websiteUrl: 'https://example.com',
      }),
    });
  }

  async function expectRetryableOutage(response: Response) {
    const body = await response.json() as { error: { code: string; message: string } };
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    expect(body).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Subscription checkout is temporarily unavailable. Please try again shortly.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('sensitive');
    expect(customerCreate).not.toHaveBeenCalled();
    expect(checkoutCreate).not.toHaveBeenCalled();
  }

  it('returns a retryable outage before Stripe when account verification fails', async () => {
    authGetUser.mockRejectedValueOnce(new Error('sensitive auth provider detail'));

    const { POST } = await import('./route');
    await expectRetryableOutage(await POST(request()));
  });

  it.each([
    ['bundle lookup', bundleMaybeSingle],
    ['subscription lookup', subscriptionMaybeSingle],
    ['billing customer lookup', userMaybeSingle],
  ])('fails closed before Stripe when the %s is unavailable', async (_stage, lookup) => {
    lookup.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST000', message: 'sensitive database outage detail' },
    });

    const { POST } = await import('./route');
    await expectRetryableOutage(await POST(request()));
  });

  it('does not create a Stripe customer when the billing profile is missing', async () => {
    userMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const { POST } = await import('./route');
    await expectRetryableOutage(await POST(request()));
  });

  it('does not create checkout when a new Stripe customer cannot be linked durably', async () => {
    userMaybeSingle.mockResolvedValueOnce({ data: { stripe_customer_id: null }, error: null });
    customerLinkUpdate.mockResolvedValueOnce({
      error: { code: 'PGRST000', message: 'sensitive database outage detail' },
    });

    const { POST } = await import('./route');
    const response = await POST(request());
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    expect(body.error.code).toBe('service_unavailable');
    expect(JSON.stringify(body)).not.toContain('sensitive database outage detail');
    expect(customerCreate).toHaveBeenCalledTimes(1);
    expect(priceRetrieve).not.toHaveBeenCalled();
    expect(subscriptionsList).not.toHaveBeenCalled();
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('uses one retry-safe Stripe customer when the billing profile has no customer yet', async () => {
    userMaybeSingle.mockResolvedValueOnce({ data: { stripe_customer_id: null }, error: null });

    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(customerCreate).toHaveBeenCalledWith(
      {
        email: 'owner@example.com',
        metadata: { user_id: 'user-1' },
      },
      { idempotencyKey: 'billing-customer-user-1' }
    );
    expect(customerLinkUpdate).toHaveBeenCalledTimes(1);
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_created' })
    );
  });

  it('creates subscription checkout only after all database preflights pass', async () => {
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://stripe.test/subscription' });
    expect(customerCreate).not.toHaveBeenCalled();
    expect(priceRetrieve).toHaveBeenCalledWith('price_startup');
    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: 'cus_existing',
      price: 'price_startup',
      status: 'all',
      limit: 5,
    });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_existing',
        line_items: [{ price: 'price_startup', quantity: 1 }],
      })
    );
  });
});
