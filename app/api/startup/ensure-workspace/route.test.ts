import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const ensureStartupWorkspace = vi.fn();
const structuredError = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    STRIPE_SECRET_KEY: 'stripe-secret',
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('@/lib/server/startup-workspace-ensure', () => ({
  ensureStartupWorkspace,
}));

vi.mock('@/lib/server/structured-log', () => ({ structuredError }));

describe('startup workspace recovery route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
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
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Workspace setup is temporarily unavailable. Please try again shortly.',
      },
    });
    expect(ensureStartupWorkspace).not.toHaveBeenCalled();
  });

  it('fails closed when the subscription prerequisite is unavailable', async () => {
    ensureStartupWorkspace.mockResolvedValueOnce({
      kind: 'database_unavailable',
      stage: 'subscription_lookup',
    });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.json()).toMatchObject({
      error: { code: 'service_unavailable' },
    });
    expect(structuredError).toHaveBeenCalledWith(
      'startup_workspace_recovery_unavailable',
      { stage: 'subscription_lookup', errorCode: 'unknown' }
    );
  });

  it('preserves the truthful no-customer redirect contract', async () => {
    ensureStartupWorkspace.mockResolvedValueOnce({ kind: 'no_stripe_customer' });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      kind: 'no_stripe_customer',
      redirectTo: '/pricing?onboarding=1',
    });
  });

  it('preserves successful recovery', async () => {
    ensureStartupWorkspace.mockResolvedValueOnce({
      kind: 'already_exists',
      workspaceId: 'workspace-1',
    });

    const { POST } = await import('./route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      kind: 'already_exists',
      workspaceId: 'workspace-1',
    });
  });
});
