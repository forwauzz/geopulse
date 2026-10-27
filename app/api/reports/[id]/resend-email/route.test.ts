import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendDeepAuditEmail = vi.fn();
const getUser = vi.fn();
const createSupabaseServerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const getPaymentApiEnv = vi.fn();

vi.mock('@workers/report/resend-delivery', () => ({
  sendDeepAuditEmail,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient,
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient,
}));
vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv,
}));
vi.mock('@/lib/server/structured-log', () => ({
  structuredError: vi.fn(),
}));

function makeChain(result: { data: unknown; error: null | { message: string } }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

const scanId = '9fa517bd-cb3f-4072-9110-ec629ea1bd1f';

function makeRequest() {
  return new Request(`https://example.com/api/reports/${scanId}/resend-email`, {
    method: 'POST',
  });
}

function makeScan(overrides: Record<string, unknown> = {}) {
  return {
    id: scanId,
    url: 'https://example.com',
    domain: 'example.com',
    score: 91,
    letter_grade: 'A',
    issues_json: [
      { passed: false, check: 'Title tag', fix: 'Add a title tag', weight: 9 },
      { passed: true, check: 'robots.txt', weight: 1 },
    ],
    full_results_json: {},
    user_id: 'user-1',
    agency_account_id: null,
    agency_client_id: null,
    startup_workspace_id: null,
    ...overrides,
  };
}

async function expectUnavailable(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Retry-After')).toBe('300');
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: 'service_unavailable',
      message: 'Report email delivery is temporarily unavailable. Please try again shortly.',
    },
  });
  expect(JSON.stringify(body)).not.toContain('provider-secret');
  expect(sendDeepAuditEmail).not.toHaveBeenCalled();
}

describe('POST /api/reports/[id]/resend-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'buyer@example.com' } } });
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser } });
    getPaymentApiEnv.mockResolvedValue({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM_EMAIL: 'reports@getgeopulse.com',
    });
    sendDeepAuditEmail.mockResolvedValue({ ok: true });
  });

  it('resends the report email to the signed-in user', async () => {
    const adminDb = {
      from: vi.fn((table: string) => {
        if (table === 'scans') {
          return makeChain({
            data: makeScan(),
            error: null,
          });
        }
        if (table === 'reports') {
          return makeChain({
            data: {
              id: 'report-1',
              pdf_url: 'https://files.example.com/report.pdf',
              markdown_url: 'https://files.example.com/report.md',
              email_delivered_at: '2026-04-09T00:00:00.000Z',
            },
            error: null,
          });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    createServiceRoleClient.mockReturnValue(adminDb);

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest(),
      { params: Promise.resolve({ id: scanId }) }
    );

    expect(response.status).toBe(200);
    expect(sendDeepAuditEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        from: 'reports@getgeopulse.com',
        attachPdf: false,
        downloadLinks: {
          pdfUrl: 'https://files.example.com/report.pdf',
          markdownUrl: 'https://files.example.com/report.md',
        },
        score: 91,
        grade: 'A',
        scanId: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
      })
    );
  });

  it('fails closed when the authenticated user lookup returns a provider error', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { code: '1016', message: 'provider-secret' },
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed when the authenticated user lookup throws', async () => {
    getUser.mockRejectedValue(new Error('provider-secret'));

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed before access or email work when the scan lookup returns an error', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => makeChain({ data: null, error: { message: 'provider-secret' } })),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed before access or email work when the scan lookup throws', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => {
        throw new Error('provider-secret');
      }),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed when agency access lookup fails', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'scans') {
          return makeChain({
            data: makeScan({ user_id: 'different-user', agency_account_id: 'agency-1' }),
            error: null,
          });
        }
        if (table === 'agency_users') {
          return makeChain({ data: null, error: { message: 'provider-secret' } });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed when startup workspace access lookup returns an error', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'scans') {
          return makeChain({
            data: makeScan({ user_id: 'different-user', startup_workspace_id: 'workspace-1' }),
            error: null,
          });
        }
        if (table === 'startup_workspace_users') {
          return makeChain({ data: null, error: { message: 'provider-secret' } });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed before email delivery when the report lookup returns an error', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'scans') return makeChain({ data: makeScan(), error: null });
        if (table === 'reports') {
          return makeChain({ data: null, error: { message: 'provider-secret' } });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });

  it('fails closed before email delivery when the report lookup throws', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'scans') return makeChain({ data: makeScan(), error: null });
        if (table === 'reports') throw new Error('provider-secret');
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import('./route');
    await expectUnavailable(await POST(makeRequest(), { params: Promise.resolve({ id: scanId }) }));
  });
});
