import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: null as any,
  buildCoverDesign: vi.fn(),
  renderAuditCampaignThumbnail: vi.fn(),
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
      recipientFirstName: 'Alex',
      recipientCompany: 'Example',
    },
  })),
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.db),
}));
vi.mock('@workers/report/design-agent', () => ({
  buildCoverDesign: mocks.buildCoverDesign,
}));
vi.mock('@workers/report/audit-campaign-thumbnail', () => ({
  buildAuditCampaignThumbnailHtml: vi.fn(),
  renderAuditCampaignThumbnail: mocks.renderAuditCampaignThumbnail,
}));

import { GET } from './route';

function chain(result: unknown) {
  const value: any = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    not: vi.fn(() => value),
    order: vi.fn(() => value),
    limit: vi.fn(() => value),
    maybeSingle: vi.fn(async () => result),
  };
  return value;
}

async function callRoute() {
  return GET(
    new Request('https://getgeopulse.com/api/audit-preview/thumbnail/token'),
    { params: Promise.resolve({ token: 'token' }) },
  );
}

async function expectRetryableOutage(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('retry-after')).toBe('300');
  const body = await response.json() as { error: { code: string } };
  expect(body.error.code).toBe('service_unavailable');
  expect(JSON.stringify(body)).not.toContain('provider-secret');
  expect(mocks.buildCoverDesign).not.toHaveBeenCalled();
  expect(mocks.renderAuditCampaignThumbnail).not.toHaveBeenCalled();
}

describe('GET /api/audit-preview/thumbnail/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['scans', 'reports'])('fails closed when the %s lookup returns an error', async (failedTable) => {
    mocks.db = {
      from: vi.fn((table: string) => chain(
        table === failedTable
          ? { data: null, error: { message: 'provider-secret' } }
          : { data: {}, error: null },
      )),
    };
    await expectRetryableOutage(await callRoute());
  });

  it('fails closed when a database lookup throws', async () => {
    mocks.db = { from: vi.fn(() => { throw new Error('provider-secret'); }) };
    await expectRetryableOutage(await callRoute());
  });
});
