import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  checkUnsubscribeRateLimit: vi.fn(),
  setLifecycleEmailSuppression: vi.fn(),
}));

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    SCAN_CACHE: {},
  })),
}));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));
vi.mock('@/lib/server/rate-limit-kv', () => ({ checkUnsubscribeRateLimit: mocks.checkUnsubscribeRateLimit }));
vi.mock('@/lib/server/lifecycle-email', () => ({ setLifecycleEmailSuppression: mocks.setLifecycleEmailSuppression }));
vi.mock('@/lib/server/structured-log', () => ({ structuredLog: vi.fn() }));

import { GET, POST } from './route';

const prospectId = '11111111-1111-4111-8111-111111111111';

function context(id = prospectId) {
  return { params: Promise.resolve({ prospectId: id }) };
}

describe('outreach unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkUnsubscribeRateLimit.mockResolvedValue({ ok: true });
    const updates: unknown[] = [];
    mocks.createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { email: 'buyer@example.com' } })) })),
        })),
        update: vi.fn((value: unknown) => {
          updates.push(value);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      })),
      updates,
    });
  });

  it('keeps scanner-prefetched GET requests non-mutating', async () => {
    const response = await GET(
      new Request(`https://getgeopulse.com/api/outreach/unsubscribe/${prospectId}`),
      context(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Unsubscribe from audit emails?');
    expect(html).toContain('method="post"');
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('suppresses the exact prospect on one-click POST and returns a blank 200', async () => {
    const response = await POST(
      new Request(`https://getgeopulse.com/api/outreach/unsubscribe/${prospectId}`, { method: 'POST' }),
      context(),
    );
    const client = mocks.createServiceRoleClient.mock.results[0]?.value as { updates: unknown[] };

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(client.updates[0]).toMatchObject({ enabled: false, lifecycle_status: 'unsubscribed' });
    expect(mocks.setLifecycleEmailSuppression).toHaveBeenCalledWith(expect.objectContaining({
      email: 'buyer@example.com',
      scope: 'marketing',
      reason: 'unsubscribe',
    }));
  });

  it('acknowledges rate-limited repeats without another database mutation', async () => {
    mocks.checkUnsubscribeRateLimit.mockResolvedValue({ ok: false, code: 'ip', retryAfterSec: 60 });
    const response = await POST(
      new Request(`https://getgeopulse.com/api/outreach/unsubscribe/${prospectId}`, { method: 'POST' }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });
});
