import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signBrevoOAuthState } from '@/lib/server/brevo-oauth-state';

const getUser = vi.fn();
const loadWorkspace = vi.fn();
const consumeOAuthState = vi.fn();
const connect = vi.fn();
const exchangeBrevoCode = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    BREVO_OAUTH_CLIENT_ID: 'client-id',
    BREVO_OAUTH_CLIENT_SECRET: 'a-production-shaped-client-secret',
    DISTRIBUTION_TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock('@/lib/server/current-agency-workspace', () => ({ loadCurrentAgencyWorkspace: loadWorkspace }));
vi.mock('@/lib/server/brevo-connector-repository', () => ({
  createBrevoConnectorRepository: vi.fn(() => ({ consumeOAuthState, connect })),
}));
vi.mock('@/lib/connectors/providers/brevo', async (original) => ({
  ...(await original<typeof import('@/lib/connectors/providers/brevo')>()),
  exchangeBrevoCode,
}));
vi.mock('@/lib/server/structured-log', () => ({ structuredLog: vi.fn(), structuredError: vi.fn() }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AGENCY_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'a-production-shaped-client-secret';

async function state(userId = USER_ID): Promise<string> {
  return signBrevoOAuthState({ userId, agencyAccountId: AGENCY_ID, issuedAt: Date.now(), nonce: crypto.randomUUID() }, SECRET);
}

describe('Brevo OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    maybeSingle.mockResolvedValue({ data: { role: 'owner' }, error: null });
    const chain = { select: vi.fn(), eq: vi.fn() } as { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; maybeSingle?: typeof maybeSingle };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle = maybeSingle;
    loadWorkspace.mockResolvedValue({
      data: { selectedAccountId: AGENCY_ID },
      admin: { from: vi.fn(() => chain) },
    });
    consumeOAuthState.mockResolvedValue(true);
    exchangeBrevoCode.mockResolvedValue({
      accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600,
      scopes: ['contacts:read'], subject: 'brevo-user',
    });
    connect.mockResolvedValue({});
  });

  it('fails closed before persistence when state is invalid', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('https://getgeopulse.com/api/connectors/brevo/callback?code=code&state=invalid'));
    expect(response.headers.get('location')).toContain('brevo=authorization-error');
    expect(consumeOAuthState).not.toHaveBeenCalled();
  });

  it('consumes denied state without exchanging tokens', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest(`https://getgeopulse.com/api/connectors/brevo/callback?error=access_denied&state=${encodeURIComponent(await state())}`));
    expect(response.headers.get('location')).toContain('brevo=access-denied');
    expect(consumeOAuthState).toHaveBeenCalledTimes(1);
    expect(exchangeBrevoCode).not.toHaveBeenCalled();
  });

  it('stores a verified connection for the same user and tenant', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest(`https://getgeopulse.com/api/connectors/brevo/callback?code=code&state=${encodeURIComponent(await state())}`));
    expect(response.headers.get('location')).toContain('brevo=connected');
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      agencyAccountId: AGENCY_ID, userId: USER_ID,
      token: expect.objectContaining({ scopes: ['contacts:read'] }),
    }));
  });
});
