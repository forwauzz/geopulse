import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const scanMaybeSingle = vi.fn();
const getScanForPublicShare = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    LEGACY_PAID_ENABLED: 'false',
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq']) {
        chain[method] = vi.fn(() => chain);
      }
      chain['maybeSingle'] = scanMaybeSingle;
      return chain;
    }),
  })),
}));

vi.mock('@/lib/server/get-scan-for-public-share', () => ({
  getScanForPublicShare,
}));

vi.mock('@/lib/server/get-score-benchmark', () => ({
  getScoreBenchmark: vi.fn(async () => null),
}));

vi.mock('@/lib/server/agency-access', () => ({
  resolveAgencyFeatureEntitlements: vi.fn(),
  resolveAgencyScanAccess: vi.fn(),
}));

vi.mock('@/lib/server/startup-scan-context', () => ({
  validateStartupWorkspaceScanContext: vi.fn(),
}));

describe('scan result route outage contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUser.mockResolvedValue({ data: { user: null }, error: null });
    scanMaybeSingle.mockResolvedValue({ data: null, error: null });
    getScanForPublicShare.mockResolvedValue({
      ok: false,
      code: 'db_error',
      message: 'sensitive database outage detail',
    });
  });

  async function expectSanitizedOutage(response: Response) {
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
    expect(JSON.stringify(body)).not.toContain('sensitive database outage detail');
  }

  it('sanitizes a public-share database failure', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://getgeopulse.com/api/scans/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) }
    );

    await expectSanitizedOutage(response);
  });

  it('sanitizes an authenticated scan lookup failure', async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'owner@example.com' } },
      error: null,
    });
    scanMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST000', message: 'sensitive database outage detail' },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://getgeopulse.com/api/scans/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) }
    );

    await expectSanitizedOutage(response);
    expect(getScanForPublicShare).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_id', 400],
    ['not_found', 404],
    ['forbidden', 403],
    ['expired', 410],
  ])('preserves the %s public-share status', async (code, status) => {
    getScanForPublicShare.mockResolvedValueOnce({ ok: false, code });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://getgeopulse.com/api/scans/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) }
    );

    expect(response.status).toBe(status);
  });
});
