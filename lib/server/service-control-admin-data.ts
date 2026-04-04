type SupabaseLike = {
  from(table: string): any;
};

export type ServiceCatalogAdminRow = {
  readonly id: string;
  readonly service_key: string;
  readonly name: string;
  readonly category: string;
  readonly default_access_mode: 'free' | 'paid' | 'trial' | 'off';
  readonly is_active: boolean;
  readonly metadata: Record<string, unknown>;
  readonly updated_at: string;
};

export type ServiceBundleAdminRow = {
  readonly id: string;
  readonly bundle_key: string;
  readonly name: string;
  readonly workspace_type: string;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly updated_at: string;
};

export type ServiceBundleServiceAdminRow = {
  readonly id: string;
  readonly bundle_id: string;
  readonly service_id: string;
  readonly enabled: boolean;
  readonly access_mode: 'free' | 'paid' | 'trial' | 'off' | null;
  readonly usage_limit: number | null;
  readonly metadata: Record<string, unknown>;
  readonly updated_at: string;
};

export type ServiceEntitlementOverrideAdminRow = {
  readonly id: string;
  readonly service_id: string;
  readonly scope_type: 'global' | 'bundle_default' | 'agency_account' | 'agency_client' | 'user';
  readonly bundle_id: string | null;
  readonly agency_account_id: string | null;
  readonly agency_client_id: string | null;
  readonly user_id: string | null;
  readonly enabled: boolean;
  readonly access_mode: 'free' | 'paid' | 'trial' | 'off' | null;
  readonly usage_limit: number | null;
  readonly metadata: Record<string, unknown>;
  readonly updated_at: string;
};

export type ServiceControlAdminOverview = {
  readonly services: ServiceCatalogAdminRow[];
  readonly bundles: ServiceBundleAdminRow[];
  readonly bundleServices: Array<
    ServiceBundleServiceAdminRow & {
      readonly service_key: string;
      readonly bundle_key: string;
    }
  >;
  readonly overrides: Array<
    ServiceEntitlementOverrideAdminRow & {
      readonly service_key: string;
      readonly bundle_key: string | null;
      readonly agency_account_key: string | null;
      readonly agency_client_key: string | null;
    }
  >;
  readonly agencyAccounts: Array<{
    readonly id: string;
    readonly account_key: string;
    readonly name: string;
  }>;
  readonly agencyClients: Array<{
    readonly id: string;
    readonly agency_account_id: string;
    readonly client_key: string;
    readonly name: string;
  }>;
};

function normalizeObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value ?? {};
}

export function createServiceControlAdminData(supabase: SupabaseLike) {
  return {
    async getOverview(): Promise<ServiceControlAdminOverview> {
      const [
        { data: services, error: servicesError },
        { data: bundles, error: bundlesError },
        { data: bundleServices, error: bundleServicesError },
        { data: overrides, error: overridesError },
        { data: agencyAccounts, error: agencyAccountsError },
        { data: agencyClients, error: agencyClientsError },
      ] = await Promise.all([
        supabase
          .from('service_catalog')
          .select('id,service_key,name,category,default_access_mode,is_active,metadata,updated_at')
          .order('service_key', { ascending: true }),
        supabase
          .from('service_bundles')
          .select('id,bundle_key,name,workspace_type,status,metadata,updated_at')
          .order('bundle_key', { ascending: true }),
        supabase
          .from('service_bundle_services')
          .select('id,bundle_id,service_id,enabled,access_mode,usage_limit,metadata,updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('service_entitlement_overrides')
          .select(
            'id,service_id,scope_type,bundle_id,agency_account_id,agency_client_id,user_id,enabled,access_mode,usage_limit,metadata,updated_at'
          )
          .order('updated_at', { ascending: false }),
        supabase.from('agency_accounts').select('id,account_key,name').order('account_key', { ascending: true }),
        supabase
          .from('agency_clients')
          .select('id,agency_account_id,client_key,name')
          .order('client_key', { ascending: true }),
      ]);

      if (
        servicesError ||
        bundlesError ||
        bundleServicesError ||
        overridesError ||
        agencyAccountsError ||
        agencyClientsError
      ) {
        throw (
          servicesError ??
          bundlesError ??
          bundleServicesError ??
          overridesError ??
          agencyAccountsError ??
          agencyClientsError
        );
      }

      const normalizedServices = ((services ?? []) as ServiceCatalogAdminRow[]).map((service) => ({
        ...service,
        metadata: normalizeObject(service.metadata),
      }));
      const normalizedBundles = ((bundles ?? []) as ServiceBundleAdminRow[]).map((bundle) => ({
        ...bundle,
        metadata: normalizeObject(bundle.metadata),
      }));
      const normalizedBundleServices = ((bundleServices ?? []) as ServiceBundleServiceAdminRow[]).map((row) => ({
        ...row,
        metadata: normalizeObject(row.metadata),
      }));
      const normalizedOverrides = ((overrides ?? []) as ServiceEntitlementOverrideAdminRow[]).map((row) => ({
        ...row,
        metadata: normalizeObject(row.metadata),
      }));

      const serviceKeyById = new Map(normalizedServices.map((service) => [service.id, service.service_key]));
      const bundleKeyById = new Map(normalizedBundles.map((bundle) => [bundle.id, bundle.bundle_key]));
      const agencyAccountKeyById = new Map(
        (((agencyAccounts ?? []) as Array<{ id: string; account_key: string }>) ?? []).map((account) => [
          account.id,
          account.account_key,
        ])
      );
      const agencyClientKeyById = new Map(
        (((agencyClients ?? []) as Array<{ id: string; client_key: string }>) ?? []).map((client) => [
          client.id,
          client.client_key,
        ])
      );

      return {
        services: normalizedServices,
        bundles: normalizedBundles,
        bundleServices: normalizedBundleServices.map((row) => ({
          ...row,
          service_key: serviceKeyById.get(row.service_id) ?? 'unknown_service',
          bundle_key: bundleKeyById.get(row.bundle_id) ?? 'unknown_bundle',
        })),
        overrides: normalizedOverrides.map((row) => ({
          ...row,
          service_key: serviceKeyById.get(row.service_id) ?? 'unknown_service',
          bundle_key: row.bundle_id ? (bundleKeyById.get(row.bundle_id) ?? null) : null,
          agency_account_key: row.agency_account_id
            ? (agencyAccountKeyById.get(row.agency_account_id) ?? null)
            : null,
          agency_client_key: row.agency_client_id
            ? (agencyClientKeyById.get(row.agency_client_id) ?? null)
            : null,
        })),
        agencyAccounts:
          ((agencyAccounts ?? []) as Array<{ id: string; account_key: string; name: string }>) ?? [],
        agencyClients:
          ((agencyClients ?? []) as Array<{
            id: string;
            agency_account_id: string;
            client_key: string;
            name: string;
          }>) ?? [],
      };
    },
  };
}
