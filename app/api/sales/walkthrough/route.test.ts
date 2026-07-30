import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadInsert = vi.fn();
const emitMarketingEvent = vi.fn();
const sendSalesEmail = vi.fn();
const structuredLogWithClientAndWait = vi.fn();

const leadSingle = vi.fn();
const leadSelect = vi.fn(() => ({ single: leadSingle }));
leadInsert.mockImplementation(() => ({ select: leadSelect }));

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.20'),
  getPaymentApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'reports@getgeopulse.com',
    SELF_IMPROVEMENT_REPORT_TO: 'operator@example.com',
  })),
}));

vi.mock('@/lib/server/rate-limit-kv', () => ({
  checkEmailLeadRateLimit: vi.fn(async () => ({ ok: true })),
  emailRateKey: vi.fn((email: string) => email.trim().toLowerCase()),
}));

vi.mock('@/lib/server/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'leads') return { insert: leadInsert };
      throw new Error(`Unexpected table: ${table}`);
    }),
  })),
}));

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent,
}));

vi.mock('@/lib/server/sales-email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/sales-email')>();
  return {
    ...actual,
    sendSalesEmail,
  };
});

vi.mock('@/lib/server/structured-log', () => ({
  structuredLogWithClientAndWait,
}));

function request(overrides: Record<string, unknown> = {}) {
  return new Request('https://getgeopulse.com/api/sales/walkthrough', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Alex Rivera',
      company: 'Northstar IT',
      email: 'Alex@Northstar.Example',
      website: 'https://northstar.example',
      note: 'We want to understand local managed IT visibility.',
      source: 'msp_solution',
      turnstileToken: 'token-1',
      anonymous_id: 'anon-1',
      utm_source: 'outreach',
      utm_medium: 'email',
      utm_campaign: 'msp-first-customer',
      utm_content: 'sequence-2',
      utm_term: null,
      referrer_url: 'https://example.com/',
      landing_path: '/solutions/msps',
      ...overrides,
    }),
  });
}

describe('POST /api/sales/walkthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadInsert.mockImplementation(() => ({ select: leadSelect }));
    leadSingle.mockResolvedValue({
      data: { id: '8bc3b84d-1f22-4703-b0ab-1c07997c04aa' },
      error: null,
    });
    sendSalesEmail.mockResolvedValue({ ok: true });
    emitMarketingEvent.mockResolvedValue(undefined);
    structuredLogWithClientAndWait.mockResolvedValue(undefined);
  });

  it('records an owned sales lead, preserves attribution, and routes both emails', async () => {
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      confirmationDelivered: true,
      operatorNotified: true,
    });
    expect(leadInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alex@northstar.example',
        url: 'https://northstar.example',
        source: 'msp_solution',
        request_type: 'walkthrough',
        status: 'new',
        owner: 'elena',
        next_action: expect.stringContaining('respond personally'),
      })
    );
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      expect.anything(),
      'lead_submitted',
      expect.objectContaining({
        utm_campaign: 'msp-first-customer',
        channel: 'sales_assisted',
        content_id: 'msp_solution',
      })
    );
    expect(sendSalesEmail).toHaveBeenCalledTimes(2);
    expect(sendSalesEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: 'operator@example.com' })
    );
  });

  it('rejects invalid input before writing a lead', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(leadInsert).not.toHaveBeenCalled();
    expect(sendSalesEmail).not.toHaveBeenCalled();
  });
});
