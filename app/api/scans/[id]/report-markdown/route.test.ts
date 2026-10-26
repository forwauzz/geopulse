import { beforeEach, describe, expect, it, vi } from 'vitest';

const getScanForPublicShare = vi.fn();
const createSupabaseServerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const getScanApiEnv = vi.fn();

vi.mock('@/lib/server/get-scan-for-public-share', () => ({ getScanForPublicShare }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient }));
vi.mock('@/lib/server/cf-env', () => ({ getScanApiEnv }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('binding unavailable');
  }),
}));

describe('GET /api/scans/[id]/report-markdown', () => {
  const scanId = '9fa517bd-cb3f-4072-9110-ec629ea1bd1f';

  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockRejectedValue(new Error('no session storage'));
    getScanApiEnv.mockResolvedValue({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });
  });

  async function callRoute() {
    const { GET } = await import('./route');
    return GET(new Request(`https://getgeopulse.com/api/scans/${scanId}/report-markdown`), {
      params: Promise.resolve({ id: scanId }),
    });
  }

  async function expectRetryableOutage(response: Response) {
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Scan results are temporarily unavailable. Please try again shortly.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('sensitive');
  }

  it('sanitizes a public-share database failure', async () => {
    getScanForPublicShare.mockResolvedValue({
      ok: false,
      code: 'db_error',
      message: 'sensitive database outage detail',
    });

    await expectRetryableOutage(await callRoute());
  });

  it('sanitizes a thrown public-share request failure', async () => {
    getScanForPublicShare.mockRejectedValue(new Error('sensitive network failure'));

    await expectRetryableOutage(await callRoute());
  });

  it('sanitizes an authenticated scan lookup failure', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    });
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: null,
      error: { code: 'PGRST000', message: 'sensitive database outage detail' },
    }));
    createServiceRoleClient.mockReturnValue({ from: vi.fn(() => chain) });

    await expectRetryableOutage(await callRoute());
    expect(getScanForPublicShare).not.toHaveBeenCalled();
  });

  it('sanitizes an authenticated report lookup failure', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    });
    const makeChain = (result: unknown) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => result);
      return chain;
    };
    createServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'scans'
          ? makeChain({ data: { id: scanId, user_id: 'user-1' }, error: null })
          : makeChain({
              data: null,
              error: { code: 'PGRST000', message: 'sensitive report lookup detail' },
            })
      ),
    });

    await expectRetryableOutage(await callRoute());
    expect(getScanForPublicShare).not.toHaveBeenCalled();
  });
});
