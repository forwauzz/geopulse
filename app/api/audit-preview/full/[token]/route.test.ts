import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: null as any,
  shareSlug: null as string | null,
  getScanForShareSlug: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    AUDIT_REPORT_CAPABILITY_SECRET: 'test-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
  })),
}));
vi.mock('@/lib/server/audit-report-capability', () => ({
  verifyAuditFullReportCapability: vi.fn(() => ({
    ok: true,
    payload: {
      scanId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      domain: 'example.com',
      campaignId: 'campaign-1',
      recipientHash: 'recipient-hash',
      shareSlug: mocks.shareSlug,
    },
  })),
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.db),
}));
vi.mock('@/lib/server/get-scan-for-public-share', () => ({
  getScanForShareSlug: mocks.getScanForShareSlug,
}));
vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent: mocks.emitMarketingEvent,
}));

import { GET } from './route';

function chain(result: unknown) {
  const value: any = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    is: vi.fn(() => value),
    neq: vi.fn(() => value),
    order: vi.fn(() => value),
    limit: vi.fn(() => value),
    maybeSingle: vi.fn(async () => result),
  };
  return value;
}

async function callRoute() {
  return GET(
    new Request('https://getgeopulse.com/api/audit-preview/full/token'),
    { params: Promise.resolve({ token: 'token' }) },
  );
}

async function expectRetryableOutage(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('retry-after')).toBe('300');
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: 'service_unavailable',
      message: 'This audit is temporarily unavailable. Please try again shortly.',
    },
  });
  expect(JSON.stringify(body)).not.toContain('provider-secret');
  expect(mocks.emitMarketingEvent).not.toHaveBeenCalled();
}

describe('GET /api/audit-preview/full/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shareSlug = null;
  });

  it.each(['scans', 'reports'])('fails closed when the %s lookup returns an error', async (failedTable) => {
    mocks.db = {
      from: vi.fn((table: string) => chain(
        table === failedTable
          ? { data: null, error: { message: 'provider-secret' } }
          : table === 'scans'
            ? { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', domain: 'example.com' }, error: null }
            : { data: { pdf_url: 'https://files.example/report.pdf' }, error: null },
      )),
    };

    await expectRetryableOutage(await callRoute());
  });

  it('fails closed when a database lookup throws', async () => {
    mocks.db = { from: vi.fn(() => { throw new Error('provider-secret'); }) };
    await expectRetryableOutage(await callRoute());
  });

  it('fails closed when a share-target lookup reports a database failure', async () => {
    mocks.shareSlug = 'share-slug-123456';
    mocks.db = { from: vi.fn() };
    mocks.getScanForShareSlug.mockResolvedValue({ ok: false, code: 'db_error', message: 'provider-secret' });
    await expectRetryableOutage(await callRoute());
  });
});
