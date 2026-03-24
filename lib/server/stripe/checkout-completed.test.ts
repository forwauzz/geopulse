import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { handleCheckoutSessionCompleted } from './checkout-completed';
import type { PaymentApiEnv } from '@/lib/server/cf-env';

const sessionBase = {
  id: 'cs_test_1',
  metadata: { scan_id: 'scan-uuid' },
  customer_details: { email: 'buyer@example.com' },
  amount_total: 100,
  currency: 'usd',
} as unknown as Stripe.Checkout.Session;

function envWithQueue(send: () => Promise<void>): PaymentApiEnv {
  return {
    SCAN_QUEUE: { send } as unknown as Queue,
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    TURNSTILE_SECRET_KEY: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    GEMINI_ENDPOINT: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_ID_DEEP_AUDIT: '',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    NEXT_PUBLIC_APP_URL: '',
    RECONCILE_SECRET: '',
  };
}

describe('handleCheckoutSessionCompleted', () => {
  it('re-enqueues when payment exists but deep_audit report does not', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const supabase = {
      from(table: string) {
        if (table === 'payments') {
          return {
            select() {
              return {
                or() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: 'pay-1', scan_id: 'scan-uuid' },
                      error: null,
                    }),
                  };
                },
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                    single: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
          };
        }
        if (table === 'reports') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: null, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const r = await handleCheckoutSessionCompleted(
      supabase,
      sessionBase,
      'evt_1',
      envWithQueue(send)
    );

    expect(r).toEqual({ ok: true, duplicate: true });
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0]![0] as string)).toMatchObject({
      v: 1,
      scanId: 'scan-uuid',
      paymentId: 'pay-1',
      customerEmail: 'buyer@example.com',
    });
  });

  it('does not enqueue when deep_audit report already exists', async () => {
    const send = vi.fn();
    const supabase = {
      from(table: string) {
        if (table === 'payments') {
          return {
            select() {
              return {
                or() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: 'pay-1', scan_id: 'scan-uuid' },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (table === 'reports') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: { id: 'rep-1' }, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const r = await handleCheckoutSessionCompleted(
      supabase,
      sessionBase,
      'evt_1',
      envWithQueue(send)
    );

    expect(r).toEqual({ ok: true, duplicate: true });
    expect(send).not.toHaveBeenCalled();
  });
});
