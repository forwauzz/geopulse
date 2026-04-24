import { createBenchmarkRepository, type ClientBenchmarkConfigRow } from './benchmark-repository';
import type { GeoPerformanceCadence, GeoPerformanceDeliverySurface } from './geo-performance-entitlements';

type SupabaseLike = { from(table: string): any };

export type GpmBundleCapOverride = {
  readonly maxPromptsPerRun: number | null;
  readonly allowedCadences: readonly GeoPerformanceCadence[];
  readonly deliverySurfaces: readonly GeoPerformanceDeliverySurface[];
};

export type GpmReportAdminRow = {
  readonly id: string;
  readonly config_id: string;
  readonly run_group_id: string;
  readonly platform: string;
  readonly window_date: string;
  readonly pdf_r2_key: string | null;
  readonly pdf_url: string | null;
  readonly narrative_generated: boolean;
  readonly generated_at: string;
};

export type GpmConfigAdminRow = ClientBenchmarkConfigRow & {
  readonly domain_canonical: string;
  readonly domain_display: string | null;
  readonly domain_site_url: string | null;
};

export type GpmDomainOption = {
  readonly id: string;
  readonly canonicalDomain: string;
  readonly displayName: string | null;
  readonly siteUrl: string | null;
};

export type GpmQuerySetOption = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
};

export type GpmWorkspaceOption = {
  readonly id: string;
  readonly label: string;
};

export type GpmAgencyOption = {
  readonly id: string;
  readonly label: string;
};

export function createGpmAdminData(supabase: SupabaseLike) {
  const repo = createBenchmarkRepository(supabase as any);

  return {
    async listAllConfigs(): Promise<GpmConfigAdminRow[]> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .select(
          [
            'id',
            'startup_workspace_id',
            'agency_account_id',
            'benchmark_domain_id',
            'topic',
            'location',
            'query_set_id',
            'competitor_list',
            'cadence',
            'platforms_enabled',
            'report_email',
            'metadata',
            'created_at',
            'updated_at',
            'benchmark_domains(canonical_domain,display_name,site_url)',
          ].join(',')
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as Array<Record<string, any>>).map((row) => {
        const domain = (row['benchmark_domains'] as Record<string, unknown> | null) ?? {};
        return {
          id: String(row['id']),
          startup_workspace_id: (row['startup_workspace_id'] as string | null) ?? null,
          agency_account_id: (row['agency_account_id'] as string | null) ?? null,
          benchmark_domain_id: String(row['benchmark_domain_id']),
          topic: String(row['topic']),
          location: String(row['location']),
          query_set_id: (row['query_set_id'] as string | null) ?? null,
          competitor_list: (row['competitor_list'] as string[] | null) ?? [],
          cadence: row['cadence'] as 'monthly' | 'biweekly' | 'weekly',
          platforms_enabled: (row['platforms_enabled'] as string[]) ?? [],
          report_email: (row['report_email'] as string | null) ?? null,
          metadata: (row['metadata'] as Record<string, unknown> | null) ?? {},
          created_at: String(row['created_at']),
          updated_at: String(row['updated_at']),
          domain_canonical: typeof domain['canonical_domain'] === 'string' ? domain['canonical_domain'] : '',
          domain_display: typeof domain['display_name'] === 'string' ? domain['display_name'] : null,
          domain_site_url: typeof domain['site_url'] === 'string' ? domain['site_url'] : null,
        };
      });
    },

    async getConfig(id: string): Promise<GpmConfigAdminRow | null> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .select(
          [
            'id',
            'startup_workspace_id',
            'agency_account_id',
            'benchmark_domain_id',
            'topic',
            'location',
            'query_set_id',
            'competitor_list',
            'cadence',
            'platforms_enabled',
            'report_email',
            'metadata',
            'created_at',
            'updated_at',
            'benchmark_domains(canonical_domain,display_name,site_url)',
          ].join(',')
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, any>;
      const domain = (row['benchmark_domains'] as Record<string, unknown> | null) ?? {};
      return {
        id: String(row['id']),
        startup_workspace_id: (row['startup_workspace_id'] as string | null) ?? null,
        agency_account_id: (row['agency_account_id'] as string | null) ?? null,
        benchmark_domain_id: String(row['benchmark_domain_id']),
        topic: String(row['topic']),
        location: String(row['location']),
        query_set_id: (row['query_set_id'] as string | null) ?? null,
        competitor_list: (row['competitor_list'] as string[] | null) ?? [],
        cadence: row['cadence'] as 'monthly' | 'biweekly' | 'weekly',
        platforms_enabled: (row['platforms_enabled'] as string[]) ?? [],
        report_email: (row['report_email'] as string | null) ?? null,
        metadata: (row['metadata'] as Record<string, unknown> | null) ?? {},
        created_at: String(row['created_at']),
        updated_at: String(row['updated_at']),
        domain_canonical: typeof domain['canonical_domain'] === 'string' ? domain['canonical_domain'] : '',
        domain_display: typeof domain['display_name'] === 'string' ? domain['display_name'] : null,
        domain_site_url: typeof domain['site_url'] === 'string' ? domain['site_url'] : null,
      };
    },

    async getDomainOptions(): Promise<GpmDomainOption[]> {
      const { data, error } = await supabase
        .from('benchmark_domains')
        .select('id,canonical_domain,display_name,site_url')
        .order('canonical_domain', { ascending: true });

      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row['id']),
        canonicalDomain: String(row['canonical_domain']),
        displayName: (row['display_name'] as string | null) ?? null,
        siteUrl: (row['site_url'] as string | null) ?? null,
      }));
    },

    async getQuerySetOptions(): Promise<GpmQuerySetOption[]> {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .select('id,name,version')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row['id']),
        name: String(row['name']),
        version: String(row['version']),
      }));
    },

    async updateConfig(
      configId: string,
      input: {
        readonly topic?: string;
        readonly location?: string;
        readonly cadence?: 'monthly' | 'biweekly' | 'weekly';
        readonly platformsEnabled?: string[];
        readonly querySetId?: string | null;
        readonly reportEmail?: string | null;
      }
    ): Promise<ClientBenchmarkConfigRow> {
      return repo.updateClientBenchmarkConfig(configId, input);
    },

    async updateCompetitorList(
      configId: string,
      competitors: string[]
    ): Promise<ClientBenchmarkConfigRow> {
      return repo.updateClientBenchmarkConfig(configId, { competitorList: competitors });
    },

    async createConfig(input: {
      readonly startupWorkspaceId?: string | null;
      readonly agencyAccountId?: string | null;
      readonly benchmarkDomainId: string;
      readonly topic: string;
      readonly location: string;
      readonly querySetId?: string | null;
      readonly competitorList?: string[];
      readonly cadence?: 'monthly' | 'biweekly' | 'weekly';
      readonly platformsEnabled?: string[];
      readonly reportEmail?: string | null;
    }): Promise<ClientBenchmarkConfigRow> {
      return repo.insertClientBenchmarkConfig(input);
    },

    async deleteConfig(configId: string): Promise<void> {
      return repo.deleteClientBenchmarkConfig(configId);
    },

    async getStartupWorkspaceOptions(): Promise<GpmWorkspaceOption[]> {
      const { data, error } = await supabase
        .from('startup_workspaces')
        .select('id,workspace_key,name,canonical_domain')
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row['id']),
        label: [row['name'], row['canonical_domain'] ?? row['workspace_key']]
          .filter(Boolean)
          .join(' · '),
      }));
    },

    async getAgencyAccountOptions(): Promise<GpmAgencyOption[]> {
      const { data, error } = await supabase
        .from('agency_accounts')
        .select('id,account_key,name,canonical_domain')
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row['id']),
        label: [row['name'], row['canonical_domain'] ?? row['account_key']]
          .filter(Boolean)
          .join(' · '),
      }));
    },

    async getReportsForConfig(configId: string): Promise<GpmReportAdminRow[]> {
      const { data, error } = await supabase
        .from('gpm_reports')
        .select('id,config_id,run_group_id,platform,window_date,pdf_r2_key,pdf_url,narrative_generated,generated_at')
        .eq('config_id', configId)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row['id']),
        config_id: String(row['config_id']),
        run_group_id: String(row['run_group_id']),
        platform: String(row['platform']),
        window_date: String(row['window_date']),
        pdf_r2_key: (row['pdf_r2_key'] as string | null) ?? null,
        pdf_url: (row['pdf_url'] as string | null) ?? null,
        narrative_generated: Boolean(row['narrative_generated']),
        generated_at: String(row['generated_at']),
      }));
    },

    async getBundleCapOverrides(): Promise<Record<string, GpmBundleCapOverride>> {
      const { data, error } = await supabase
        .from('service_bundle_services')
        .select('metadata,service_bundles(bundle_key),service_catalog(service_key)')
        .eq('service_catalog.service_key', 'geo_performance_monitoring');

      if (error) throw error;

      const result: Record<string, GpmBundleCapOverride> = {};
      for (const row of (data ?? []) as Array<Record<string, any>>) {
        const bundleKey = row['service_bundles']?.['bundle_key'] as string | undefined;
        if (!bundleKey) continue;
        const gpmCaps = row['metadata']?.['gpm_caps'] as Record<string, unknown> | undefined;
        if (!gpmCaps) continue;
        const maxPromptsPerRun =
          gpmCaps['maxPromptsPerRun'] === null
            ? null
            : typeof gpmCaps['maxPromptsPerRun'] === 'number'
              ? gpmCaps['maxPromptsPerRun']
              : null;
        const allowedCadences = Array.isArray(gpmCaps['allowedCadences'])
          ? (gpmCaps['allowedCadences'] as GeoPerformanceCadence[])
          : [];
        const deliverySurfaces = Array.isArray(gpmCaps['deliverySurfaces'])
          ? (gpmCaps['deliverySurfaces'] as GeoPerformanceDeliverySurface[])
          : [];
        result[bundleKey] = { maxPromptsPerRun, allowedCadences, deliverySurfaces };
      }
      return result;
    },

    async updateBundleCaps(
      bundleKey: string,
      caps: {
        readonly maxPromptsPerRun: number | null;
        readonly allowedCadences: readonly GeoPerformanceCadence[];
        readonly deliverySurfaces: readonly GeoPerformanceDeliverySurface[];
      }
    ): Promise<void> {
      const { data: bundleRow, error: bundleError } = await supabase
        .from('service_bundles')
        .select('id')
        .eq('bundle_key', bundleKey)
        .maybeSingle();
      if (bundleError) throw bundleError;
      if (!bundleRow?.id) throw new Error(`Bundle not found: ${bundleKey}`);

      const { data: serviceRow, error: serviceError } = await supabase
        .from('service_catalog')
        .select('id')
        .eq('service_key', 'geo_performance_monitoring')
        .maybeSingle();
      if (serviceError) throw serviceError;
      if (!serviceRow?.id) throw new Error('GPM service not found in catalog.');

      const { data: existing, error: existingError } = await supabase
        .from('service_bundle_services')
        .select('id,metadata')
        .eq('bundle_id', bundleRow.id)
        .eq('service_id', serviceRow.id)
        .maybeSingle();
      if (existingError) throw existingError;

      const existingMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
      const updatedMeta = {
        ...existingMeta,
        gpm_caps: {
          maxPromptsPerRun: caps.maxPromptsPerRun,
          allowedCadences: [...caps.allowedCadences],
          deliverySurfaces: [...caps.deliverySurfaces],
        },
      };

      if (existing?.id) {
        const { error } = await supabase
          .from('service_bundle_services')
          .update({ metadata: updatedMeta })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('service_bundle_services').insert({
          bundle_id: bundleRow.id,
          service_id: serviceRow.id,
          enabled: true,
          access_mode: 'paid',
          metadata: updatedMeta,
        });
        if (error) throw error;
      }
    },
  };
}
