import { beforeEach, describe, expect, it, vi } from 'vitest';

const verify = vi.fn();
const getReceivingEmail = vi.fn();
const forwardReceivingEmail = vi.fn();
const processInboundSalesReply = vi.fn();
const structuredLogWithClientAndWait = vi.fn();
const reconcileResendLifecycleEvent = vi.fn();
const supabase = { from: vi.fn() };

vi.mock('resend', () => ({
  Resend: class {
    webhooks = { verify };
    emails = {
      receiving: {
        get: getReceivingEmail,
        forward: forwardReceivingEmail,
      },
    };
  },
}));

vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv: vi.fn(async () => ({
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'reports@getgeopulse.com',
    RESEND_INBOUND_WEBHOOK_SECRET: 'whsec_test',
    SALES_REPLY_TO_EMAIL: 'sales@replies.getgeopulse.com',
    SALES_OPERATOR_EMAIL: 'operator@example.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => supabase),
}));

vi.mock('@/lib/server/outreach-replies', () => ({
  processInboundSalesReply,
}));

vi.mock('@/lib/server/structured-log', () => ({
  structuredLogWithClientAndWait,
}));

vi.mock('@/lib/server/lifecycle-email', () => ({
  reconcileResendLifecycleEvent,
}));

function request() {
  return new Request('https://getgeopulse.com/api/webhooks/resend/inbound', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_webhook_1',
      'svix-timestamp': '1785400000',
      'svix-signature': 'v1,signature',
    },
    body: '{"type":"email.received"}',
  });
}

describe('POST /api/webhooks/resend/inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verify.mockReturnValue({
      type: 'email.received',
      created_at: '2026-07-30T14:00:00.000Z',
      data: {
        email_id: 'inbound_email_1',
        created_at: '2026-07-30T14:00:00.000Z',
        from: 'Buyer <buyer@example.com>',
        to: ['sales@replies.getgeopulse.com'],
        bcc: [],
        cc: [],
        received_for: ['sales@replies.getgeopulse.com'],
        message_id: 'message-1',
        subject: 'Re: audit',
        attachments: [],
      },
    });
    getReceivingEmail.mockResolvedValue({
      data: {
        id: 'inbound_email_1',
        from: 'Buyer <buyer@example.com>',
        subject: 'Re: audit',
        text: 'Yes, can we schedule a walkthrough?',
        created_at: '2026-07-30T14:00:00.000Z',
      },
      error: null,
    });
    processInboundSalesReply.mockResolvedValue({
      ok: true,
      duplicate: false,
      matched: true,
      classification: 'positive',
      prospectIds: ['prospect-1'],
      leadId: null,
    });
    forwardReceivingEmail.mockResolvedValue({
      data: { id: 'forwarded-1' },
      error: null,
    });
    structuredLogWithClientAndWait.mockResolvedValue(undefined);
    reconcileResendLifecycleEvent.mockResolvedValue(true);
  });

  it('verifies, classifies, stops the matched sequence, and forwards the original reply', async () => {
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: '{"type":"email.received"}',
        webhookSecret: 'whsec_test',
      })
    );
    expect(processInboundSalesReply).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: 'msg_webhook_1',
        providerEmailId: 'inbound_email_1',
        text: 'Yes, can we schedule a walkthrough?',
      })
    );
    expect(forwardReceivingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailId: 'inbound_email_1',
        to: 'operator@example.com',
        passthrough: true,
      }),
      { idempotencyKey: 'inbound-forward-inbound_email_1' }
    );
  });

  it('rejects an invalid signature before retrieving message content', async () => {
    verify.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(getReceivingEmail).not.toHaveBeenCalled();
    expect(processInboundSalesReply).not.toHaveBeenCalled();
  });

  it.each(['email.delivered', 'email.bounced', 'email.complained'] as const)(
    'reconciles signed %s provider evidence without retrieving inbound content',
    async (type) => {
      verify.mockReturnValueOnce({
        type,
        created_at: '2026-08-10T20:00:00.000Z',
        data: { email_id: 'provider-email-1', to: ['buyer@example.com'] },
      });
      const { POST } = await import('./route');

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(reconcileResendLifecycleEvent).toHaveBeenCalledWith(expect.objectContaining({
        providerEventId: 'msg_webhook_1',
        type,
        messageId: 'provider-email-1',
        to: 'buyer@example.com',
      }));
      expect(getReceivingEmail).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed signed delivery events', async () => {
    verify.mockReturnValueOnce({
      type: 'email.delivered',
      created_at: '2026-08-10T20:00:00.000Z',
      data: { to: ['buyer@example.com'] },
    });
    const { POST } = await import('./route');

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(reconcileResendLifecycleEvent).not.toHaveBeenCalled();
  });
});
