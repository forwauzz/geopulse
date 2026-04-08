import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const cookiesMock = vi.fn();
const createServerClientMock = vi.fn();
const createServiceRoleClientMock = vi.fn();
const linkGuestPurchasesToUserMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClientMock(...args),
}));

vi.mock('@/lib/server/link-guest-purchases', () => ({
  linkGuestPurchasesToUser: (...args: unknown[]) => linkGuestPurchasesToUserMock(...args),
}));

function makeSupabaseClient(overrides?: {
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
  verifyOtp?: ReturnType<typeof vi.fn>;
  getUser?: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: {
      exchangeCodeForSession:
        overrides?.exchangeCodeForSession ?? vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: overrides?.verifyOtp ?? vi.fn().mockResolvedValue({ error: null }),
      getUser: overrides?.getUser ?? vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  };
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    cookiesMock.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    });
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { created_at: new Date().toISOString() } }),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exchanges code-based magic links and resumes signup onboarding', async () => {
    const supabase = makeSupabaseClient({
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } } }),
    });
    createServerClientMock.mockReturnValue(supabase);

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'https://example.com/auth/callback?code=abc123&next=%2Fpricing&bundle=startup_dev&mode=signup&name=Uzziel',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/pricing?bundle=startup_dev&autosubscribe=1');
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(linkGuestPurchasesToUserMock).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      'user@example.com',
    );
  });

  it('verifies token-hash magic links when code is not present', async () => {
    const supabase = makeSupabaseClient({
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-2', email: 'user@example.com' } } }),
    });
    createServerClientMock.mockReturnValue(supabase);

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('https://example.com/auth/callback?token_hash=hash123&type=email&next=%2Fdashboard'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.com/dashboard');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash123',
      type: 'email',
    });
  });

  it('returns the user to login with the original signup context when Supabase marks the link expired', async () => {
    const supabase = makeSupabaseClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: { message: 'Email link is invalid or has expired' },
      }),
    });
    createServerClientMock.mockReturnValue(supabase);

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'https://example.com/auth/callback?code=badcode&next=%2Fpricing&bundle=startup_dev&mode=signup',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?');
    expect(response.headers.get('location')).toContain('next=%2Fpricing');
    expect(response.headers.get('location')).toContain('bundle=startup_dev');
    expect(response.headers.get('location')).toContain('mode=signup');
    expect(response.headers.get('location')).toContain(
      'error=Email+link+is+invalid+or+has+expired',
    );
  });
});
