import type { BundleKey, ServiceKey } from './service-entitlements-contract';
import type { ResolvedServiceEntitlement } from './service-entitlements';

type SupabaseLike = {
  from(table: string): any;
};

type WorkspaceBillingMode = 'free' | 'paid' | 'trial';

export type ResolvedServiceBillingGuard = {
  readonly allowed: boolean;
  readonly reason:
    | 'ok'
    | 'service_disabled'
    | 'service_off'
    | 'workspace_requires_paid_mode'
    | 'stripe_mapping_missing'
    | 'stripe_mapping_inactive';
  readonly requiresStripePayment: boolean;
  readonly workspaceBillingMode: WorkspaceBillingMode;
  readonly mapping: {
    readonly stripeProductId: string | null;
    readonly stripePriceId: string | null;
    readonly billingMode: 'free' | 'paid' | 'trial' | 'off';
    readonly isActive: boolean;
  } | null;
};

async function loadServiceId(args: { supabase: SupabaseLike; serviceKey: ServiceKey }): Promise<string> {
  const { data, error } = await args.supabase
    .from('service_catalog')
    .select('id')
    .eq('service_key', args.serviceKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Service not found: ${args.serviceKey}`);
  return data.id as string;
}

async function loadBundleId(args: { supabase: SupabaseLike; bundleKey: BundleKey }): Promise<string> {
  const { data, error } = await args.supabase
    .from('service_bundles')
    .select('id')
    .eq('bundle_key', args.bundleKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Bundle not found: ${args.bundleKey}`);
  return data.id as string;
}

async function loadWorkspaceBillingMode(args: {
  supabase: SupabaseLike;
  startupWorkspaceId: string;
}): Promise<WorkspaceBillingMode> {
  const { data, error } = await args.supabase
    .from('startup_workspaces')
    .select('billing_mode')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (error) throw error;
  const mode = (data?.billing_mode as WorkspaceBillingMode | undefined) ?? 'free';
  if (mode === 'free' || mode === 'paid' || mode === 'trial') return mode;
  return 'free';
}

export async function resolveServiceBillingGuard(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly bundleKey: BundleKey;
  readonly serviceKey: ServiceKey;
  readonly entitlement: ResolvedServiceEntitlement;
}): Promise<ResolvedServiceBillingGuard> {
  if (!args.entitlement.enabled) {
    return {
      allowed: false,
      reason: 'service_disabled',
      requiresStripePayment: false,
      workspaceBillingMode: 'free',
      mapping: null,
    };
  }
  if (args.entitlement.accessMode === 'off') {
    return {
      allowed: false,
      reason: 'service_off',
      requiresStripePayment: false,
      workspaceBillingMode: 'free',
      mapping: null,
    };
  }

  const workspaceBillingMode = await loadWorkspaceBillingMode({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });

  if (args.entitlement.accessMode === 'free' || args.entitlement.accessMode === 'trial') {
    return {
      allowed: true,
      reason: 'ok',
      requiresStripePayment: false,
      workspaceBillingMode,
      mapping: null,
    };
  }

  if (workspaceBillingMode === 'free') {
    return {
      allowed: false,
      reason: 'workspace_requires_paid_mode',
      requiresStripePayment: true,
      workspaceBillingMode,
      mapping: null,
    };
  }

  const [serviceId, bundleId] = await Promise.all([
    loadServiceId({ supabase: args.supabase, serviceKey: args.serviceKey }),
    loadBundleId({ supabase: args.supabase, bundleKey: args.bundleKey }),
  ]);

  const { data, error } = await args.supabase
    .from('service_billing_mappings')
    .select('stripe_product_id,stripe_price_id,billing_mode,is_active')
    .eq('service_id', serviceId)
    .eq('bundle_id', bundleId)
    .eq('provider', 'stripe')
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return {
      allowed: false,
      reason: 'stripe_mapping_missing',
      requiresStripePayment: true,
      workspaceBillingMode,
      mapping: null,
    };
  }

  const mapping = {
    stripeProductId: (data.stripe_product_id as string | null) ?? null,
    stripePriceId: (data.stripe_price_id as string | null) ?? null,
    billingMode: ((data.billing_mode as 'free' | 'paid' | 'trial' | 'off' | null) ?? 'paid'),
    isActive: Boolean(data.is_active),
  };

  if (!mapping.isActive || mapping.billingMode === 'off') {
    return {
      allowed: false,
      reason: 'stripe_mapping_inactive',
      requiresStripePayment: true,
      workspaceBillingMode,
      mapping,
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    requiresStripePayment: true,
    workspaceBillingMode,
    mapping,
  };
}
