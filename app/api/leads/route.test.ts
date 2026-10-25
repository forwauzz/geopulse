import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadInsert = vi.fn();
const leadSelect = vi.fn();
const leadSingle = vi.fn();
const emitMarketingEvent = vi.fn();
const sendLeadEmail = vi.fn();
const structuredLogWithClientAndWait = vi.fn();
const structuredError = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getClientIp: vi.fn(() => '203.0.113.30'),
  getPaymentApiEnv: vi.fn(async () => ({
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
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
    from: vi.fn(() => ({ insert: leadInsert })),
  })),
}));

vi.mock('@services/marketing-attribution/emit', () => ({ emitMarketingEvent }));

vi.mock('@/lib/server/lead-email', () => ({
  buildSavedPreviewEmail: vi.fn(() => ({ subject: 'Saved preview', html: '<p>Saved</p>' })),
  sendLeadEmail,
}));

vi.mock('@/lib/server/structured-log', () => ({
  structuredError,
  structuredLogWithClientAndWait,
}));

function request() {
  return new Request('https://getgeopulse.com/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@northstar.example',
      url: 'https://northstar.example',
      score: 58,
      scanId: '8bc3b84d-1f22-4703-b0ab-1c07997c04aa',
      turnstileToken: 'verified-token',
      anonymous_id: 'anon-1',
      marketingConsent: true,
    }),
  });
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadInsert.mockImplementation(() => ({ select: leadSelect }));
    leadSelect.mockImplementation(() => ({ single: leadSingle }));
    leadSingle.mockResolvedValue({
      data: { id: '5e4a09eb-19f8-48cf-9065-85b92e02788e' },
      error: null,
    });
    emitMarketingEvent.mockResolvedValue(undefined);
    sendLeadEmail.mockResolvedValue({ ok: true });
    structuredLogWithClientAndWait.mockResolvedValue(undefined);
  });

  it('preserves the healthy saved-preview flow', async () => {
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, emailDelivered: true });
    expect(leadInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@northstar.example',
        scan_id: '8bc3b84d-1f22-4703-b0ab-1c07997c04aa',
      })
    );
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      expect.anything(),
      'lead_submitted',
      expect.objectContaining({
        anonymous_id: 'anon-1',
        metadata: expect.objectContaining({ marketing_consent: true }),
      })
    );
    expect(sendLeadEmail).toHaveBeenCalledOnce();
  });

  it('returns a sanitized retryable outage without side effects when the insert fails', async () => {
    leadSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST001', message: 'database host and private provider detail' },
    });

    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Saving this preview is temporarily unavailable. Please try again shortly.',
      },
    });
    expect(emitMarketingEvent).not.toHaveBeenCalled();
    expect(sendLeadEmail).not.toHaveBeenCalled();
    expect(structuredLogWithClientAndWait).not.toHaveBeenCalled();
    expect(structuredError).toHaveBeenCalledWith('lead_preview_store_unavailable', {
      reason: 'insert_failed',
      errorCode: 'PGRST001',
    });
  });

  it('returns the same outage contract when the store request throws', async () => {
    leadSingle.mockRejectedValue(new Error('private network detail'));

    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Saving this preview is temporarily unavailable. Please try again shortly.',
      },
    });
    expect(emitMarketingEvent).not.toHaveBeenCalled();
    expect(sendLeadEmail).not.toHaveBeenCalled();
    expect(structuredError).toHaveBeenCalledWith('lead_preview_store_unavailable', {
      reason: 'request_failed',
      errorCode: null,
    });
  });
});
