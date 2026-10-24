import { beforeEach, describe, expect, it, vi } from 'vitest';

const getScanForShareSlug = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    LEGACY_PAID_ENABLED: 'false',
  })),
}));

vi.mock('@/lib/server/get-scan-for-public-share', () => ({
  getScanForShareSlug,
}));

vi.mock('@/lib/server/get-score-benchmark', () => ({
  getScoreBenchmark: vi.fn(async () => null),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));

describe('shared scan result route outage contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getScanForShareSlug.mockResolvedValue({
      ok: false,
      code: 'db_error',
      message: 'sensitive database outage detail',
    });
  });

  it('returns a sanitized retryable response for a database failure', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://getgeopulse.com/api/scans/share/share-token-123456789'),
      { params: Promise.resolve({ slug: 'share-token-123456789' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    expect(body).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Scan results are temporarily unavailable. Please try again shortly.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('sensitive database outage detail');
  });

  it.each([
    ['invalid_id', 400],
    ['not_found', 404],
    ['forbidden', 403],
    ['expired', 410],
  ])('preserves the %s shared-scan status', async (code, status) => {
    getScanForShareSlug.mockResolvedValueOnce({ ok: false, code });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://getgeopulse.com/api/scans/share/share-token-123456789'),
      { params: Promise.resolve({ slug: 'share-token-123456789' }) }
    );

    expect(response.status).toBe(status);
  });
});
