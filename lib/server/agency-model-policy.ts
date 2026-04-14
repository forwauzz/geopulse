type SupabaseLike = {
  from(table: string): any;
};

type AgencyModelPolicyRow = {
  readonly provider_name: string;
  readonly model_id: string;
};

export type AgencyEffectiveModelPolicy = {
  readonly requestedModelPolicy: string | null;
  readonly requestedProvider: string | null;
  readonly requestedModel: string | null;
  readonly effectiveProvider: string;
  readonly effectiveModel: string;
  readonly source: 'default' | 'account' | 'client';
  readonly fallbackReason: 'unsupported_provider' | null;
};

function formatRequestedModelPolicy(
  providerName: string | null,
  modelId: string | null
): string | null {
  if (!providerName || !modelId) return null;
  return `${providerName}/${modelId}`;
}

async function loadScopedPolicy(args: {
  readonly supabase: SupabaseLike;
  readonly agencyAccountId: string;
  readonly agencyClientId: string | null;
  readonly productSurface: string;
}): Promise<AgencyModelPolicyRow | null> {
  const { supabase, agencyAccountId, agencyClientId, productSurface } = args;

  if (agencyClientId) {
    const { data: clientPolicy, error: clientPolicyError } = await supabase
      .from('agency_model_policies')
      .select('provider_name,model_id')
      .eq('agency_account_id', agencyAccountId)
      .eq('agency_client_id', agencyClientId)
      .eq('product_surface', productSurface)
      .eq('is_active', true)
      .maybeSingle();

    if (clientPolicyError) throw clientPolicyError;
    if (clientPolicy?.provider_name && clientPolicy?.model_id) {
      return clientPolicy as AgencyModelPolicyRow;
    }
  }

  const { data: accountPolicy, error: accountPolicyError } = await supabase
    .from('agency_model_policies')
    .select('provider_name,model_id')
    .eq('agency_account_id', agencyAccountId)
    .is('agency_client_id', null)
    .eq('product_surface', productSurface)
    .eq('is_active', true)
    .maybeSingle();

  if (accountPolicyError) throw accountPolicyError;
  if (accountPolicy?.provider_name && accountPolicy?.model_id) {
    return accountPolicy as AgencyModelPolicyRow;
  }

  return null;
}

export async function resolveAgencyModelPolicy(args: {
  readonly supabase: SupabaseLike;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
  readonly productSurface: string;
  readonly fallbackProvider: string;
  readonly fallbackModelId: string;
  readonly supportedProviders?: readonly string[];
}): Promise<AgencyEffectiveModelPolicy> {
  const {
    supabase,
    agencyAccountId,
    agencyClientId,
    productSurface,
    fallbackProvider,
    fallbackModelId,
    supportedProviders = ['gemini'],
  } = args;

  if (!agencyAccountId) {
    return {
      requestedModelPolicy: null,
      requestedProvider: null,
      requestedModel: null,
      effectiveProvider: fallbackProvider,
      effectiveModel: fallbackModelId,
      source: 'default',
      fallbackReason: null,
    };
  }

  const requestedPolicy = await loadScopedPolicy({
    supabase,
    agencyAccountId,
    agencyClientId,
    productSurface,
  });

  if (!requestedPolicy) {
    return {
      requestedModelPolicy: null,
      requestedProvider: null,
      requestedModel: null,
      effectiveProvider: fallbackProvider,
      effectiveModel: fallbackModelId,
      source: agencyClientId ? 'client' : 'account',
      fallbackReason: null,
    };
  }

  const requestedProvider = requestedPolicy.provider_name;
  const requestedModel = requestedPolicy.model_id;
  const requestedModelPolicy = formatRequestedModelPolicy(requestedProvider, requestedModel);
  const providerSupported = supportedProviders.includes(requestedProvider);

  return {
    requestedModelPolicy,
    requestedProvider,
    requestedModel,
    effectiveProvider: providerSupported ? requestedProvider : fallbackProvider,
    effectiveModel: providerSupported ? requestedModel : fallbackModelId,
    source: agencyClientId ? 'client' : 'account',
    fallbackReason: providerSupported ? null : 'unsupported_provider',
  };
}
