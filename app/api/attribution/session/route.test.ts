import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitMarketingEvent = vi.fn();
const resolvePublishedArticleContentId = vi.fn();
const createServiceRoleClient = vi.fn(() => ({ from: vi.fn() }));

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getScanApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  })),
}));

vi.mock('@/lib/server/rate-limit-kv', () => ({
  checkSessionEventRateLimit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient,
}));

vi.mock('@/lib/server/marketing-session-attribution', () => ({
  resolvePublishedArticleContentId,
}));

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent,
}));

describe('POST /api/attribution/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitMarketingEvent.mockResolvedValue(undefined);
    resolvePublishedArticleContentId.mockResolvedValue(
      'seo-agent:msp-remote-support-page-evidence-grounded-v1'
    );
  });

  it('adds server-resolved article lineage to the session event', async () => {
    const { POST } = await import('./route');
    const request = new Request('https://getgeopulse.com/api/attribution/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'gp_anon_id=server-cookie-id',
      },
      body: JSON.stringify({
        anonymous_id: 'client-id',
        landing_path: '/blog/msp-remote-support-page-evidence',
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        referrer_url: null,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(resolvePublishedArticleContentId).toHaveBeenCalledWith(
      expect.anything(),
      '/blog/msp-remote-support-page-evidence'
    );
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      expect.anything(),
      'session_started',
      expect.objectContaining({
        anonymous_id: 'server-cookie-id',
        landing_path: '/blog/msp-remote-support-page-evidence',
        content_id: 'seo-agent:msp-remote-support-page-evidence-grounded-v1',
      })
    );
  });
});
