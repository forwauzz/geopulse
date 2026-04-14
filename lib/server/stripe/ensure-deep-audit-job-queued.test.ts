import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { ensureDeepAuditJobQueued } from './ensure-deep-audit-job-queued';
import type { PaymentApiEnv } from '@/lib/server/cf-env';

const sessionBase = {
  id: 'cs_test_1',
  metadata: { scan_id: 'scan-uuid' },
  customer_details: { email: 'buyer@example.com' },
} as unknown as Stripe.Checkout.Session;

function envWithQueue(send: () => Promise<void>): PaymentApiEnv {
  return {
    SCAN_QUEUE: { send } as unknown as Queue,
    SCAN_CACHE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DISTRIBUTION_ENGINE_UI_ENABLED: '',
    DISTRIBUTION_ENGINE_WRITE_ENABLED: '',
    TURNSTILE_SECRET_KEY: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-2.0-flash',
    GEMINI_ENDPOINT: '',
    BENCHMARK_EXECUTION_PROVIDER: '',
    BENCHMARK_EXECUTION_API_KEY: '',
    BENCHMARK_EXECUTION_MODEL: '',
    BENCHMARK_EXECUTION_ENABLED_MODELS: '',
    BENCHMARK_EXECUTION_ENDPOINT: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_ID_DEEP_AUDIT: '',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    KIT_API_KEY: '',
    BUTTONDOWN_API_KEY: '',
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

describe('ensureDeepAuditJobQueued', () => {
  it('stamps the resolved deep-audit model policy onto the scan and scan run config', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

    const supabase = {
      from(table: string) {
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
                      data: {
                        id: 'scan-uuid',
                        domain: 'example.com',
                        agency_account_id: 'acct-1',
                        agency_client_id: 'client-1',
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(values: Record<string, unknown>) {
              updates.push({ table, values });
              return {
                eq() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }

        if (table === 'agency_model_policies') {
          let filters: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            is(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            maybeSingle() {
              if (filters['agency_client_id'] === 'client-1') {
                return Promise.resolve({
                  data: { provider_name: 'gemini', model_id: 'gemini-2.5-pro' },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
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
            insert(values: Record<string, unknown>) {
              inserts.push({ table, values });
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
            update(values: Record<string, unknown>) {
              updates.push({ table, values });
              return {
                eq() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
    } as any;

    const result = await ensureDeepAuditJobQueued(
      supabase,
      envWithQueue(send),
      sessionBase,
      'buyer@example.com',
      { id: 'pay-1', scan_id: 'scan-uuid' },
      false
    );

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(updates).toContainEqual({
      table: 'scans',
      values: {
        requested_model_policy: 'gemini/gemini-2.5-pro',
        effective_model: 'gemini-2.5-pro',
      },
    });
    expect(inserts[0]?.values).toMatchObject({
      scan_id: 'scan-uuid',
      domain: 'example.com',
      mode: 'deep',
      config: {
        page_limit: 10,
        render_mode: 'off',
        model_policy: {
          requested_model_policy: 'gemini/gemini-2.5-pro',
          requested_provider: 'gemini',
          requested_model: 'gemini-2.5-pro',
          effective_provider: 'gemini',
          effective_model: 'gemini-2.5-pro',
          resolution_source: 'client',
          fallback_reason: null,
        },
      },
    });
    expect(updates).toContainEqual({
      table: 'scan_runs',
      values: {
        config: {
          page_limit: 10,
          render_mode: 'off',
          model_policy: {
            requested_model_policy: 'gemini/gemini-2.5-pro',
            requested_provider: 'gemini',
            requested_model: 'gemini-2.5-pro',
            effective_provider: 'gemini',
            effective_model: 'gemini-2.5-pro',
            resolution_source: 'client',
            fallback_reason: null,
          },
        },
      },
    });
    expect(send).toHaveBeenCalledOnce();
  });
});
