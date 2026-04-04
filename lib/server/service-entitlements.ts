import { isBundleKey, isServiceKey, type BundleKey, type ServiceKey } from './service-entitlements-contract';

type SupabaseLike = {
  from(table: string): any;
};

type ServiceCatalogRow = {
  id: string;
  service_key: string;
  default_access_mode: 'free' | 'paid' | 'trial' | 'off';
  is_active: boolean;
};

type ServiceBundleRow = {
  id: string;
  bundle_key: string;
};

type ServiceBundleServiceRow = {
  enabled: boolean;
  access_mode: 'free' | 'paid' | 'trial' | 'off' | null;
  usage_limit: number | null;
};

type ServiceEntitlementOverrideRow = {
  enabled: boolean;
  access_mode: 'free' | 'paid' | 'trial' | 'off' | null;
  usage_limit: number | null;
};

type EntitlementCandidate = {
  readonly enabled?: boolean;
  readonly accessMode?: 'free' | 'paid' | 'trial' | 'off';
  readonly usageLimit?: number | null;
};

export type ResolvedServiceEntitlement = {
  readonly serviceKey: ServiceKey;
  readonly enabled: boolean;
  readonly accessMode: 'free' | 'paid' | 'trial' | 'off';
  readonly usageLimit: number | null;
  readonly source:
    | 'service_default'
    | 'bundle_service'
    | 'global_override'
    | 'bundle_override'
    | 'agency_account_override'
    | 'agency_client_override'
    | 'user_override';
};

const SOURCE_BY_STEP = {
  service_default: 'service_default',
  bundle_service: 'bundle_service',
  global: 'global_override',
  bundle_default: 'bundle_override',
  agency_account: 'agency_account_override',
  agency_client: 'agency_client_override',
  user: 'user_override',
} as const;

type SourceStep = keyof typeof SOURCE_BY_STEP;

function normalizeCandidate(row: ServiceEntitlementOverrideRow | null): EntitlementCandidate | null {
  if (!row) return null;
  return {
    enabled: typeof row.enabled === 'boolean' ? row.enabled : undefined,
    accessMode: row.access_mode ?? undefined,
    usageLimit: row.usage_limit ?? null,
  };
}

function baseFromService(service: ServiceCatalogRow): EntitlementCandidate {
  return {
    enabled: service.is_active && service.default_access_mode !== 'off',
    accessMode: service.default_access_mode,
    usageLimit: null,
  };
}

function applyCandidate(
  current: ResolvedServiceEntitlement,
  candidate: EntitlementCandidate | null,
  sourceStep: SourceStep
): ResolvedServiceEntitlement {
  if (!candidate) return current;
  return {
    serviceKey: current.serviceKey,
    enabled: candidate.enabled ?? current.enabled,
    accessMode: candidate.accessMode ?? current.accessMode,
    usageLimit: candidate.usageLimit ?? current.usageLimit,
    source: SOURCE_BY_STEP[sourceStep],
  };
}

async function loadServiceByKey(supabase: SupabaseLike, serviceKey: ServiceKey): Promise<ServiceCatalogRow> {
  const { data, error } = await supabase
    .from('service_catalog')
    .select('id,service_key,default_access_mode,is_active')
    .eq('service_key', serviceKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Missing service_catalog row for service key: ${serviceKey}`);
  }
  return data as ServiceCatalogRow;
}

async function loadBundleByKey(
  supabase: SupabaseLike,
  bundleKey: BundleKey | null
): Promise<ServiceBundleRow | null> {
  if (!bundleKey) return null;
  const { data, error } = await supabase
    .from('service_bundles')
    .select('id,bundle_key')
    .eq('bundle_key', bundleKey)
    .maybeSingle();
  if (error) throw error;
  return (data as ServiceBundleRow | null) ?? null;
}

async function loadBundleService(args: {
  supabase: SupabaseLike;
  bundleId: string | null;
  serviceId: string;
}): Promise<ServiceBundleServiceRow | null> {
  if (!args.bundleId) return null;
  const { data, error } = await args.supabase
    .from('service_bundle_services')
    .select('enabled,access_mode,usage_limit')
    .eq('bundle_id', args.bundleId)
    .eq('service_id', args.serviceId)
    .maybeSingle();
  if (error) throw error;
  return (data as ServiceBundleServiceRow | null) ?? null;
}

async function loadOverride(args: {
  supabase: SupabaseLike;
  serviceId: string;
  scopeType: 'global' | 'bundle_default' | 'agency_account' | 'agency_client' | 'user';
  bundleId?: string | null;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  userId?: string | null;
}): Promise<ServiceEntitlementOverrideRow | null> {
  let query = args.supabase
    .from('service_entitlement_overrides')
    .select('enabled,access_mode,usage_limit')
    .eq('service_id', args.serviceId)
    .eq('scope_type', args.scopeType);

  if (args.scopeType === 'bundle_default') {
    query = query.eq('bundle_id', args.bundleId ?? '');
  }
  if (args.scopeType === 'agency_account') {
    query = query.eq('agency_account_id', args.agencyAccountId ?? '');
  }
  if (args.scopeType === 'agency_client') {
    query = query.eq('agency_client_id', args.agencyClientId ?? '');
  }
  if (args.scopeType === 'user') {
    query = query.eq('user_id', args.userId ?? '');
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ServiceEntitlementOverrideRow | null) ?? null;
}

export async function resolveServiceEntitlement(args: {
  supabase: SupabaseLike;
  serviceKey: ServiceKey;
  bundleKey?: BundleKey | null;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  userId?: string | null;
}): Promise<ResolvedServiceEntitlement> {
  const bundleKey = args.bundleKey ?? null;
  const service = await loadServiceByKey(args.supabase, args.serviceKey);
  const bundle = await loadBundleByKey(args.supabase, bundleKey);

  const [bundleService, globalOverride, bundleOverride, accountOverride, clientOverride, userOverride] =
    await Promise.all([
      loadBundleService({
        supabase: args.supabase,
        bundleId: bundle?.id ?? null,
        serviceId: service.id,
      }),
      loadOverride({
        supabase: args.supabase,
        serviceId: service.id,
        scopeType: 'global',
      }),
      bundle?.id
        ? loadOverride({
            supabase: args.supabase,
            serviceId: service.id,
            scopeType: 'bundle_default',
            bundleId: bundle.id,
          })
        : Promise.resolve(null),
      args.agencyAccountId
        ? loadOverride({
            supabase: args.supabase,
            serviceId: service.id,
            scopeType: 'agency_account',
            agencyAccountId: args.agencyAccountId,
          })
        : Promise.resolve(null),
      args.agencyClientId
        ? loadOverride({
            supabase: args.supabase,
            serviceId: service.id,
            scopeType: 'agency_client',
            agencyClientId: args.agencyClientId,
          })
        : Promise.resolve(null),
      args.userId
        ? loadOverride({
            supabase: args.supabase,
            serviceId: service.id,
            scopeType: 'user',
            userId: args.userId,
          })
        : Promise.resolve(null),
    ]);

  const start: ResolvedServiceEntitlement = {
    serviceKey: args.serviceKey,
    enabled: baseFromService(service).enabled ?? false,
    accessMode: baseFromService(service).accessMode ?? 'off',
    usageLimit: baseFromService(service).usageLimit ?? null,
    source: 'service_default',
  };

  const withBundle = applyCandidate(start, normalizeCandidate(bundleService), 'bundle_service');
  const withGlobal = applyCandidate(withBundle, normalizeCandidate(globalOverride), 'global');
  const withBundleOverride = applyCandidate(
    withGlobal,
    normalizeCandidate(bundleOverride),
    'bundle_default'
  );
  const withAccountOverride = applyCandidate(
    withBundleOverride,
    normalizeCandidate(accountOverride),
    'agency_account'
  );
  const withClientOverride = applyCandidate(
    withAccountOverride,
    normalizeCandidate(clientOverride),
    'agency_client'
  );
  return applyCandidate(withClientOverride, normalizeCandidate(userOverride), 'user');
}

export async function resolveServiceEntitlements(args: {
  supabase: SupabaseLike;
  serviceKeys: ServiceKey[];
  bundleKey?: BundleKey | null;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  userId?: string | null;
}): Promise<Record<ServiceKey, ResolvedServiceEntitlement>> {
  const resolved = await Promise.all(
    args.serviceKeys.map((serviceKey) =>
      resolveServiceEntitlement({
        supabase: args.supabase,
        serviceKey,
        bundleKey: args.bundleKey ?? null,
        agencyAccountId: args.agencyAccountId ?? null,
        agencyClientId: args.agencyClientId ?? null,
        userId: args.userId ?? null,
      })
    )
  );

  return resolved.reduce(
    (acc, item) => {
      acc[item.serviceKey] = item;
      return acc;
    },
    {} as Record<ServiceKey, ResolvedServiceEntitlement>
  );
}

export function parseServiceKey(value: string): ServiceKey | null {
  return isServiceKey(value) ? value : null;
}

export function parseBundleKey(value: string | null | undefined): BundleKey | null {
  if (!value) return null;
  return isBundleKey(value) ? value : null;
}
