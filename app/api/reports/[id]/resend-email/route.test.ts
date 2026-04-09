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

function makeChain(result: { data: unknown; error: null | { message: string } }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
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
            data: {
              id: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f',
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
            },
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
      new Request('https://example.com/api/reports/9fa517bd-cb3f-4072-9110-ec629ea1bd1f/resend-email', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '9fa517bd-cb3f-4072-9110-ec629ea1bd1f' }) }
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
});
