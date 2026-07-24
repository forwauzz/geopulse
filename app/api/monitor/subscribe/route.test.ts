import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const scanMaybeSingle = vi.fn();
const monitorMaybeSingle = vi.fn();
const userMaybeSingle = vi.fn();
const customerCreate = vi.fn();
const subscriptionsList = vi.fn();
const checkoutCreate = vi.fn();
const emitMarketingEvent = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getPaymentApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'stripe-secret',
    STRIPE_PRICE_ID_MONITOR_MONTHLY: 'price_month',
    STRIPE_PRICE_ID_MONITOR_ANNUAL: 'price_year',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
  })),
}));

vi.mock('@/lib/server/app-ui-flags', () => ({
  loadUiFlags: vi.fn(async () => ({ show_monitor_subscription: true })),
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
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'update']) {
        chain[method] = vi.fn(() => chain);
      }
      chain['maybeSingle'] =
        table === 'scans'
          ? scanMaybeSingle
          : table === 'monitoring_subscriptions'
            ? monitorMaybeSingle
            : userMaybeSingle;
      return chain;
    }),
  })),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    customers: { create: customerCreate },
    subscriptions: { list: subscriptionsList },
    checkout: { sessions: { create: checkoutCreate } },
  })),
}));

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent,
}));

describe('monitor subscription checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'Owner@Example.com' } },
      error: null,
    });
    scanMaybeSingle.mockResolvedValue({
      data: {
        id: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
        url: 'https://www.example.com/',
        status: 'complete',
      },
      error: null,
    });
    monitorMaybeSingle.mockResolvedValue({ data: null, error: null });
    userMaybeSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_existing' }, error: null });
    subscriptionsList.mockResolvedValue({ data: [] });
    customerCreate.mockResolvedValue({ id: 'cus_created' });
    checkoutCreate.mockResolvedValue({ id: 'cs_monitor_1', url: 'https://stripe.test/monitor' });
    emitMarketingEvent.mockResolvedValue(undefined);
  });

  function request() {
    return new Request('https://getgeopulse.com/api/monitor/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scanId: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
        plan: 'monthly',
        turnstileToken: 'token-1',
      }),
    });
  }

  it('requires an account before paid monitoring checkout', async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('reuses the account customer and creates an account-managed subscription checkout', async () => {
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://stripe.test/monitor' });
    expect(customerCreate).not.toHaveBeenCalled();
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_existing',
        client_reference_id: 'user-1',
        line_items: [{ price: 'price_month', quantity: 1 }],
        metadata: expect.objectContaining({
          kind: 'monitor',
          user_id: 'user-1',
          monitored_url: 'https://www.example.com/',
        }),
        subscription_data: {
          metadata: expect.objectContaining({ kind: 'monitor', user_id: 'user-1' }),
        },
      })
    );
  });

  it('creates and links one Stripe customer when the account has none', async () => {
    userMaybeSingle.mockResolvedValueOnce({ data: { stripe_customer_id: null }, error: null });
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(customerCreate).toHaveBeenCalledTimes(1);
    expect(customerCreate).toHaveBeenCalledWith({
      email: 'owner@example.com',
      metadata: { user_id: 'user-1' },
    });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_created' })
    );
  });

  it('blocks a second checkout when the site already has a live local subscription', async () => {
    monitorMaybeSingle.mockResolvedValueOnce({
      data: { id: 'monitor-1', status: 'active' },
      error: null,
    });
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('blocks a second checkout when Stripe is live but the webhook has not reconciled locally', async () => {
    subscriptionsList.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_existing',
          status: 'active',
          metadata: { kind: 'monitor', monitored_url: 'https://example.com' },
        },
      ],
    });
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});
