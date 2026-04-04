import { describe, expect, it } from 'vitest';
import { resolveServiceBillingGuard } from './service-billing-guard';
import type { ResolvedServiceEntitlement } from './service-entitlements';

function createSupabaseMock(args: {
  readonly workspaceBillingMode?: 'free' | 'paid' | 'trial';
  readonly serviceId?: string;
  readonly bundleId?: string;
  readonly mapping?: {
    stripe_product_id: string | null;
    stripe_price_id: string | null;
    billing_mode: 'free' | 'paid' | 'trial' | 'off';
    is_active: boolean;
  } | null;
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        maybeSingle() {
          if (table === 'startup_workspaces') {
            return Promise.resolve({
              data: { billing_mode: args.workspaceBillingMode ?? 'free' },
              error: null,
            });
          }
          if (table === 'service_catalog') {
            return Promise.resolve({ data: { id: args.serviceId ?? 'svc-1' }, error: null });
          }
          if (table === 'service_bundles') {
            return Promise.resolve({ data: { id: args.bundleId ?? 'bundle-1' }, error: null });
          }
          if (table === 'service_billing_mappings') {
            return Promise.resolve({ data: args.mapping ?? null, error: null });
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };
    },
  } as any;
}

const paidEntitlement: ResolvedServiceEntitlement = {
  serviceKey: 'github_integration',
  enabled: true,
  accessMode: 'paid',
  usageLimit: null,
  source: 'bundle_service',
};

describe('service billing guard', () => {
  it('allows free/trial entitlement without stripe mapping', async () => {
    const supabase = createSupabaseMock({ workspaceBillingMode: 'free' });
    const result = await resolveServiceBillingGuard({
      supabase,
      startupWorkspaceId: 'ws-1',
      bundleKey: 'startup_lite',
      serviceKey: 'skills_library',
      entitlement: {
        serviceKey: 'skills_library',
        enabled: true,
        accessMode: 'free',
        usageLimit: null,
        source: 'service_default',
      },
    });
    expect(result.allowed).toBe(true);
    expect(result.requiresStripePayment).toBe(false);
  });

  it('blocks paid entitlement for free workspace mode', async () => {
    const supabase = createSupabaseMock({ workspaceBillingMode: 'free' });
    const result = await resolveServiceBillingGuard({
      supabase,
      startupWorkspaceId: 'ws-1',
      bundleKey: 'startup_dev',
      serviceKey: 'github_integration',
      entitlement: paidEntitlement,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('workspace_requires_paid_mode');
  });

  it('blocks when stripe mapping is missing for paid service in paid mode', async () => {
    const supabase = createSupabaseMock({ workspaceBillingMode: 'paid', mapping: null });
    const result = await resolveServiceBillingGuard({
      supabase,
      startupWorkspaceId: 'ws-1',
      bundleKey: 'startup_dev',
      serviceKey: 'github_integration',
      entitlement: paidEntitlement,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('stripe_mapping_missing');
  });

  it('allows paid service when active stripe mapping exists', async () => {
    const supabase = createSupabaseMock({
      workspaceBillingMode: 'paid',
      mapping: {
        stripe_product_id: 'prod_123',
        stripe_price_id: 'price_123',
        billing_mode: 'paid',
        is_active: true,
      },
    });
    const result = await resolveServiceBillingGuard({
      supabase,
      startupWorkspaceId: 'ws-1',
      bundleKey: 'startup_dev',
      serviceKey: 'github_integration',
      entitlement: paidEntitlement,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.mapping?.stripePriceId).toBe('price_123');
  });
});
