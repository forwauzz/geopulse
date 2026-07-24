import { beforeEach, describe, expect, it, vi } from 'vitest';

const constructEvent = vi.fn();
const retrieveSession = vi.fn();
const handleCheckoutSessionCompleted = vi.fn();
const handleSubscriptionUpserted = vi.fn();
const handleSubscriptionCancelled = vi.fn();
const handleInvoicePaid = vi.fn();
const handleInvoiceFailed = vi.fn();
const emitMarketingEvent = vi.fn();
const createServiceRoleClient = vi.fn();
const getPaymentApiEnv = vi.fn();
const handleMonitorCheckoutCompleted = vi.fn();
const handleMonitorSubscriptionEvent = vi.fn();
const handleMonitorInvoiceEvent = vi.fn();
const markMonitorLeadConverted = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv,
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: vi.fn(() => ({
    webhooks: {
      constructEvent,
    },
    checkout: {
      sessions: {
        retrieve: retrieveSession,
      },
    },
  })),
}));

vi.mock('@/lib/server/stripe/checkout-completed', () => ({
  handleCheckoutSessionCompleted,
}));

vi.mock('@/lib/server/stripe/subscription-handlers', () => ({
  handleSubscriptionUpserted,
  handleSubscriptionCancelled,
  handleInvoicePaid,
  handleInvoiceFailed,
}));

vi.mock('@/lib/server/monitor-subscription', () => ({
  handleMonitorCheckoutCompleted,
  handleMonitorSubscriptionEvent,
  handleMonitorInvoiceEvent,
}));

vi.mock('@/lib/server/monitor-lead-conversion', () => ({
  markMonitorLeadConverted,
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient,
}));

vi.mock('@services/marketing-attribution/emit', () => ({
  emitMarketingEvent,
}));

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleMonitorCheckoutCompleted.mockResolvedValue({ handled: false });
    handleMonitorSubscriptionEvent.mockResolvedValue({ handled: false });
    handleMonitorInvoiceEvent.mockResolvedValue({ handled: false });
    markMonitorLeadConverted.mockResolvedValue(0);
  });

  it('rejects missing stripe signature', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Missing signature');
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid stripe signature', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });
    constructEvent.mockImplementation(() => {
      throw new Error('invalid_signature');
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad' },
        body: '{"id":"evt_1"}',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Webhook signature verification failed');
  });

  it('ignores unrelated event types after signature verification', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    });
    constructEvent.mockReturnValue({
      id: 'evt_ignore',
      type: 'charge.succeeded',
      data: { object: {} },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_ignore"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled();
  });

  it('dispatches subscription lifecycle events to the subscription handlers', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });
    constructEvent.mockReturnValue({
      id: 'evt_sub_created',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
        },
      },
    });
    const supabase = { from: vi.fn() };
    createServiceRoleClient.mockReturnValue(supabase);
    handleSubscriptionUpserted.mockResolvedValue(undefined);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_sub_created"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleSubscriptionUpserted).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ id: 'sub_123' }),
      expect.objectContaining({ STRIPE_SECRET_KEY: 'sk_test' })
    );
    expect(handleSubscriptionCancelled).not.toHaveBeenCalled();
    expect(handleInvoicePaid).not.toHaveBeenCalled();
    expect(handleInvoiceFailed).not.toHaveBeenCalled();
  });

  it('dispatches invoice lifecycle events to the invoice handlers', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });
    constructEvent.mockReturnValue({
      id: 'evt_invoice_paid',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_123',
          subscription: 'sub_123',
        },
      },
    });
    const supabase = { from: vi.fn() };
    createServiceRoleClient.mockReturnValue(supabase);
    handleInvoicePaid.mockResolvedValue(undefined);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_invoice_paid"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleInvoicePaid).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ id: 'in_123', subscription: 'sub_123' })
    );
    expect(handleSubscriptionUpserted).not.toHaveBeenCalled();
    expect(handleSubscriptionCancelled).not.toHaveBeenCalled();
    expect(handleInvoiceFailed).not.toHaveBeenCalled();
  });

  it('skips subscription-mode checkout completions', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });
    constructEvent.mockReturnValue({
      id: 'evt_checkout_sub',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_sub',
          mode: 'subscription',
          metadata: { bundle_key: 'startup_dev', user_id: 'user-1' },
        },
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_checkout_sub"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled();
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('handles checkout.session.completed after verified signature', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });
    constructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          metadata: { scan_id: 'scan-1' },
          customer_email: 'buyer@example.com',
          amount_total: 2900,
        },
      },
    });
    const supabase = { from: vi.fn() };
    createServiceRoleClient.mockReturnValue(supabase);
    handleCheckoutSessionCompleted.mockResolvedValue({ ok: true, payment_id: 'pay-1' });
    emitMarketingEvent.mockResolvedValue(undefined);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_checkout"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleCheckoutSessionCompleted).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ id: 'cs_123' }),
      'evt_checkout',
      expect.objectContaining({
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      })
    );
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      supabase,
      'payment_completed',
      expect.objectContaining({
        scan_id: 'scan-1',
        payment_id: 'pay-1',
      })
    );
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('links a monitor checkout to the account and emits one idempotent paid conversion key', async () => {
    getPaymentApiEnv.mockResolvedValue({
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });
    constructEvent.mockReturnValue({
      id: 'evt_monitor_paid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_monitor',
          mode: 'subscription',
          customer: 'cus_monitor',
          subscription: 'sub_monitor',
          customer_details: { email: 'owner@example.com' },
          amount_total: 3900,
          metadata: {
            kind: 'monitor',
            scan_id: '33333333-3333-4333-8333-333333333333',
            user_id: 'user-1',
          },
        },
      },
    });
    const chain: Record<string, unknown> = {};
    for (const method of ['update', 'eq', 'is']) chain[method] = vi.fn(() => chain);
    const supabase = { from: vi.fn(() => chain) };
    createServiceRoleClient.mockReturnValue(supabase);
    handleMonitorCheckoutCompleted.mockResolvedValue({ handled: true, ok: true });
    markMonitorLeadConverted.mockResolvedValue(1);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'good' },
        body: '{"id":"evt_monitor_paid"}',
      })
    );

    expect(response.status).toBe(200);
    expect(handleMonitorCheckoutCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase,
        session: expect.objectContaining({ id: 'cs_monitor' }),
      })
    );
    expect(emitMarketingEvent).toHaveBeenCalledWith(
      supabase,
      'payment_completed',
      expect.objectContaining({
        idempotency_key: 'monitor_payment:evt_monitor_paid',
        scan_id: '33333333-3333-4333-8333-333333333333',
        user_id: 'user-1',
        email: 'owner@example.com',
      })
    );
  });
});
