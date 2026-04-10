import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const scanMaybeSingle = vi.fn();
const stripeCheckoutCreate = vi.fn();
const emitMarketingEvent = vi.fn();
const resolveStartupAccess = vi.fn();
const handleCheckoutSessionCompleted = vi.fn(async () => ({ ok: true }));

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getPaymentApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'stripe-secret',
    STRIPE_PRICE_ID_DEEP_AUDIT: 'price_123',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    GEMINI_MODEL: 'gemini-2.0-flash',
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
    BENCHMARK_EXECUTION_PROVIDER: '',
    BENCHMARK_EXECUTION_API_KEY: '',
    BENCHMARK_EXECUTION_MODEL: '',
    BENCHMARK_EXECUTION_ENDPOINT: '',
    DISTRIBUTION_ENGINE_UI_ENABLED: '',
    DISTRIBUTION_ENGINE_WRITE_ENABLED: '',
    DEEP_AUDIT_BROWSER_RENDER_MODE: 'off',
    DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '10',
    DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
    DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
  })),
}));

vi.mock('@/lib/server/rate-limit-kv', () => ({
  checkCheckoutRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/server/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/server/stripe/checkout-completed', () => ({
  handleCheckoutSessionCompleted: handleCheckoutSessionCompleted,
}));

vi.mock('@/lib/server/startup-access-resolver', () => ({
  resolveStartupAccess: resolveStartupAccess,
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
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: table === 'scans' ? scanMaybeSingle : vi.fn(async () => ({ data: null, error: null })),
      };
      return chain;
    }),
  })),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: stripeCheckoutCreate,
      },
    },
  })),
}));

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent: emitMarketingEvent,
}));

describe('deep audit checkout route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null });
    scanMaybeSingle.mockResolvedValue({
      data: {
        id: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
        user_id: 'user-1',
        status: 'complete',
        agency_account_id: null,
        agency_client_id: null,
        startup_workspace_id: null,
      },
      error: null,
    });
    stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://stripe.test/checkout',
    });
    emitMarketingEvent.mockResolvedValue(undefined);
    handleCheckoutSessionCompleted.mockResolvedValue({ ok: true });
    resolveStartupAccess.mockResolvedValue({
      kind: 'no_subscription',
      bundleKey: null,
      subscription: null,
      workspace: null,
      membership: null,
      selectedWorkspaceId: null,
      canLaunchStartupScan: false,
      needsProvisioning: false,
    });
  });

  it('redirects Stripe checkout to the canonical report route', async () => {
    const { POST } = await import('./route');
    const request = new Request('https://example.com/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scanId: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f', turnstileToken: 'token-1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ url: 'https://stripe.test/checkout' });
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://getgeopulse.com/results/9fa517bd-cb3f-4072-9110-ec629ea1bd1f/report',
        cancel_url: 'https://getgeopulse.com/results/9fa517bd-cb3f-4072-9110-ec629ea1bd1f?checkout=cancel',
      })
    );
  });

  it('bypasses Stripe for a ready startup workspace scan', async () => {
    scanMaybeSingle.mockResolvedValueOnce({
      data: {
        id: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
        user_id: 'user-1',
        status: 'complete',
        agency_account_id: null,
        agency_client_id: null,
        startup_workspace_id: 'ws_1',
      },
      error: null,
    });
    resolveStartupAccess.mockResolvedValueOnce({
      kind: 'ready',
      bundleKey: 'startup_dev',
      subscription: {
        id: 'sub_1',
        bundle_key: 'startup_dev',
        status: 'active',
        startup_workspace_id: 'ws_1',
        created_at: '2026-04-09T00:00:00.000Z',
      },
      workspace: {
        id: 'ws_1',
        workspace_key: 'acme',
        name: 'Acme',
        status: 'active',
      },
      membership: {
        id: 'member_1',
        role: 'founder',
        status: 'active',
      },
      selectedWorkspaceId: 'ws_1',
      canLaunchStartupScan: true,
      needsProvisioning: false,
    });

    const { POST } = await import('./route');
    const request = new Request('https://example.com/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scanId: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f', turnstileToken: 'token-1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ url: 'https://getgeopulse.com/results/9fa517bd-cb3f-4072-9110-ec629ea1bd1f/report' });
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });
});
