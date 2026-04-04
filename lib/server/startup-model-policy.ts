import { isServiceKey, type ServiceKey } from './service-entitlements-contract';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

type ServiceModelPolicyRow = {
  readonly provider_name: string;
  readonly model_id: string;
  readonly max_cost_usd: number | null;
  readonly fallback_provider_name: string | null;
  readonly fallback_model_id: string | null;
};

export type StartupResolvedModelPolicy = {
  readonly serviceKey: ServiceKey;
  readonly bundleKey: 'startup_lite' | 'startup_dev';
  readonly source: 'service_default' | 'bundle' | 'startup_workspace';
  readonly requestedProvider: string;
  readonly requestedModel: string;
  readonly effectiveProvider: string;
  readonly effectiveModel: string;
  readonly maxCostUsd: number | null;
  readonly estimatedCostUsd: number | null;
  readonly budgetExceeded: boolean;
  readonly fallbackReason: 'unsupported_provider' | 'budget_guardrail' | null;
};

async function resolveStartupBundleKey(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<'startup_lite' | 'startup_dev'> {
  const { data: workspace, error: workspaceError } = await args.supabase
    .from('startup_workspaces')
    .select('default_bundle_id,billing_mode')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;

  let bundleKey: 'startup_lite' | 'startup_dev' =
    (workspace?.billing_mode as string | null) === 'paid' || (workspace?.billing_mode as string | null) === 'trial'
      ? 'startup_dev'
      : 'startup_lite';

  const bundleId = (workspace?.default_bundle_id as string | null) ?? null;
  if (!bundleId) return bundleKey;

  const { data: bundle, error: bundleError } = await args.supabase
    .from('service_bundles')
    .select('bundle_key')
    .eq('id', bundleId)
    .maybeSingle();
  if (bundleError) throw bundleError;
  if (bundle?.bundle_key === 'startup_lite' || bundle?.bundle_key === 'startup_dev') {
    bundleKey = bundle.bundle_key;
  }
  return bundleKey;
}

async function loadServiceId(args: { readonly supabase: SupabaseLike; readonly serviceKey: ServiceKey }): Promise<string> {
  const { data, error } = await args.supabase
    .from('service_catalog')
    .select('id')
    .eq('service_key', args.serviceKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Missing service row for ${args.serviceKey}`);
  return data.id as string;
}

async function loadBundleId(args: {
  readonly supabase: SupabaseLike;
  readonly bundleKey: 'startup_lite' | 'startup_dev';
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from('service_bundles')
    .select('id')
    .eq('bundle_key', args.bundleKey)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

async function loadPolicy(args: {
  readonly supabase: SupabaseLike;
  readonly serviceId: string;
  readonly scopeType: 'service_default' | 'bundle' | 'startup_workspace';
  readonly bundleId?: string | null;
  readonly startupWorkspaceId?: string | null;
}): Promise<ServiceModelPolicyRow | null> {
  let query = args.supabase
    .from('service_model_policies')
    .select('provider_name,model_id,max_cost_usd,fallback_provider_name,fallback_model_id')
    .eq('service_id', args.serviceId)
    .eq('scope_type', args.scopeType)
    .eq('is_active', true);
  if (args.scopeType === 'bundle') query = query.eq('bundle_id', args.bundleId ?? '');
  if (args.scopeType === 'startup_workspace') {
    query = query.eq('startup_workspace_id', args.startupWorkspaceId ?? '');
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ServiceModelPolicyRow | null) ?? null;
}

export async function resolveStartupServiceModelPolicy(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly serviceKey: ServiceKey;
  readonly fallbackProvider: string;
  readonly fallbackModel: string;
  readonly supportedProviders?: readonly string[];
  readonly estimatedCostUsd?: number | null;
}): Promise<StartupResolvedModelPolicy> {
  if (!isServiceKey(args.serviceKey)) throw new Error('Invalid service key.');
  const supportedProviders = args.supportedProviders ?? ['gemini', 'openai', 'anthropic', 'custom'];
  const estimatedCost = args.estimatedCostUsd ?? null;

  const bundleKey = await resolveStartupBundleKey({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  const serviceId = await loadServiceId({ supabase: args.supabase, serviceKey: args.serviceKey });
  const bundleId = await loadBundleId({ supabase: args.supabase, bundleKey });

  const [serviceDefault, bundlePolicy, workspacePolicy] = await Promise.all([
    loadPolicy({
      supabase: args.supabase,
      serviceId,
      scopeType: 'service_default',
    }),
    bundleId
      ? loadPolicy({
          supabase: args.supabase,
          serviceId,
          scopeType: 'bundle',
          bundleId,
        })
      : Promise.resolve(null),
    loadPolicy({
      supabase: args.supabase,
      serviceId,
      scopeType: 'startup_workspace',
      startupWorkspaceId: args.startupWorkspaceId,
    }),
  ]);

  const selected =
    workspacePolicy ??
    bundlePolicy ??
    serviceDefault ?? {
      provider_name: args.fallbackProvider,
      model_id: args.fallbackModel,
      max_cost_usd: null,
      fallback_provider_name: null,
      fallback_model_id: null,
    };
  const source: StartupResolvedModelPolicy['source'] = workspacePolicy
    ? 'startup_workspace'
    : bundlePolicy
      ? 'bundle'
      : 'service_default';

  const requestedProvider = selected.provider_name;
  const requestedModel = selected.model_id;

  let effectiveProvider = requestedProvider;
  let effectiveModel = requestedModel;
  let fallbackReason: StartupResolvedModelPolicy['fallbackReason'] = null;
  const budgetExceeded =
    estimatedCost != null && selected.max_cost_usd != null && estimatedCost > selected.max_cost_usd;

  const fallbackProvider = selected.fallback_provider_name ?? args.fallbackProvider;
  const fallbackModel = selected.fallback_model_id ?? args.fallbackModel;

  if (!supportedProviders.includes(requestedProvider)) {
    effectiveProvider = fallbackProvider;
    effectiveModel = fallbackModel;
    fallbackReason = 'unsupported_provider';
  } else if (budgetExceeded && selected.fallback_provider_name && selected.fallback_model_id) {
    effectiveProvider = selected.fallback_provider_name;
    effectiveModel = selected.fallback_model_id;
    fallbackReason = 'budget_guardrail';
  }

  const resolved = {
    serviceKey: args.serviceKey,
    bundleKey,
    source,
    requestedProvider,
    requestedModel,
    effectiveProvider,
    effectiveModel,
    maxCostUsd: selected.max_cost_usd,
    estimatedCostUsd: estimatedCost,
    budgetExceeded,
    fallbackReason,
  };

  structuredLog(
    'startup_model_policy_resolved',
    {
      startup_workspace_id: args.startupWorkspaceId,
      service_key: resolved.serviceKey,
      bundle_key: resolved.bundleKey,
      source: resolved.source,
      requested_provider: resolved.requestedProvider,
      requested_model: resolved.requestedModel,
      effective_provider: resolved.effectiveProvider,
      effective_model: resolved.effectiveModel,
      max_cost_usd: resolved.maxCostUsd ?? null,
      estimated_cost_usd: resolved.estimatedCostUsd ?? null,
      budget_exceeded: resolved.budgetExceeded,
      fallback_reason: resolved.fallbackReason ?? null,
    },
    'info'
  );

  return resolved;
}
