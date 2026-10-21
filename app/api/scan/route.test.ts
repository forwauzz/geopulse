import { beforeEach, describe, expect, it, vi } from 'vitest';

const runFreeScan = vi.fn();
const resolveAgencyModelPolicy = vi.fn();
const emitMarketingEvent = vi.fn();
const structuredLog = vi.fn();
const storeLimit = vi.fn();

vi.mock('@workers/providers/gemini', () => ({
  GeminiProvider: class GeminiProvider {},
}));

vi.mock('@workers/scan-engine/run-scan', () => ({
  registerLlmVerdictCache: vi.fn(),
  runFreeScan,
}));

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getScanApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-model',
    GEMINI_ENDPOINT: 'https://example.test/gemini',
  })),
}));

vi.mock('@/lib/server/rate-limit-kv', () => ({
  checkScanRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/server/agency-access', () => ({
  resolveAgencyFeatureEntitlements: vi.fn(),
  validateAgencyContext: vi.fn(),
}));

vi.mock('@/lib/server/agency-model-policy', () => ({ resolveAgencyModelPolicy }));

vi.mock('@/lib/server/startup-scan-context', () => ({
  validateStartupWorkspaceScanContext: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ limit: storeLimit })),
    })),
  })),
}));

vi.mock('@/lib/server/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/server/structured-log', () => ({ structuredLog }));

vi.mock('@services/marketing-attribution/emit', () => ({ emitMarketingEvent }));

describe('free scan route data-plane guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeLimit.mockResolvedValue({
      data: null,
      error: { code: 'PGRST001', message: 'private database detail' },
    });
  });

  it('returns a sanitized 503 before crawl or provider work when storage is unavailable', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://getgeopulse.com/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          turnstileToken: 'verified-token',
        }),
      })
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'service_unavailable',
        message: 'The free audit is temporarily unavailable. Please try again shortly.',
      },
    });
    expect(runFreeScan).not.toHaveBeenCalled();
    expect(resolveAgencyModelPolicy).not.toHaveBeenCalled();
    expect(emitMarketingEvent).not.toHaveBeenCalled();
    expect(structuredLog).toHaveBeenCalledWith(
      'scan_store_unavailable',
      { reason: 'query_failed', errorCode: 'PGRST001' },
      'warning'
    );
  });
});
