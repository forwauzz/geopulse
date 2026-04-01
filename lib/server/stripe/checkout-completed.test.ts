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
    BENCHMARK_EXECUTION_PROVIDER: '',
    BENCHMARK_EXECUTION_API_KEY: '',
    BENCHMARK_EXECUTION_MODEL: '',
    BENCHMARK_EXECUTION_ENDPOINT: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_ID_DEEP_AUDIT: '',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    KIT_API_KEY: '',
    GHOST_ADMIN_API_URL: '',
    GHOST_ADMIN_API_KEY: '',
    GHOST_ADMIN_API_VERSION: '',
    NEXT_PUBLIC_APP_URL: '',
    RECONCILE_SECRET: '',
    DEEP_AUDIT_DEFAULT_PAGE_LIMIT: '',
    DEEP_AUDIT_BROWSER_RENDER_MODE: 'off',
    DEEP_AUDIT_INTERNAL_REWRITE_ENABLED: '',
    DEEP_AUDIT_INTERNAL_REWRITE_MODEL: '',
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
        if (table === 'scans') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: 'scan-uuid', domain: 'example.com' },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (table === 'scan_runs') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
            insert() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: 'run-uuid-1' },
                      error: null,
                    }),
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
      v: 2,
      scanId: 'scan-uuid',
      scanRunId: 'run-uuid-1',
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

