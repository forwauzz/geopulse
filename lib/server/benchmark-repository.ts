import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBenchmarkDomainIdentity,
  type BenchmarkDomainIdentity,
} from './benchmark-domains';

export type BenchmarkDomainRow = {
  readonly id: string;
  readonly domain: string;
  readonly canonical_domain: string;
  readonly site_url: string | null;
  readonly display_name: string | null;
  readonly vertical: string | null;
  readonly subvertical: string | null;
  readonly geo_region: string | null;
  readonly is_customer: boolean;
  readonly is_competitor: boolean;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type BenchmarkDomainUpsertInput = {
  readonly siteUrl?: string | null;
  readonly domain?: string | null;
  readonly displayName?: string | null;
  readonly vertical?: string | null;
  readonly subvertical?: string | null;
  readonly geoRegion?: string | null;
  readonly isCustomer?: boolean;
  readonly isCompetitor?: boolean;
  readonly metadata?: Record<string, unknown>;
};

export type BenchmarkQuerySetRow = {
  readonly id: string;
  readonly name: string;
  readonly vertical: string | null;
  readonly version: string;
  readonly description: string | null;
  readonly status: 'draft' | 'active' | 'archived';
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
};

export type BenchmarkQueryRow = {
  readonly id: string;
  readonly query_set_id: string;
  readonly query_key: string;
  readonly query_text: string;
  readonly intent_type: 'direct' | 'comparative' | 'discovery';
  readonly topic: string | null;
  readonly weight: number;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
};

export type BenchmarkRunGroupRow = {
  readonly id: string;
  readonly query_set_id: string;
  readonly label: string;
  readonly run_scope: string;
  readonly model_set_version: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly notes: string | null;
  readonly metadata: Record<string, unknown>;
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
};

export type QueryRunRow = {
  readonly id: string;
  readonly run_group_id: string;
  readonly domain_id: string;
  readonly query_id: string;
  readonly model_id: string;
  readonly auditor_model_id: string | null;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly response_text: string | null;
  readonly response_metadata: Record<string, unknown>;
  readonly error_message: string | null;
  readonly executed_at: string | null;
  readonly created_at: string;
};

export type QueryCitationRow = {
  readonly id: string;
  readonly query_run_id: string;
  readonly cited_domain: string | null;
  readonly cited_url: string | null;
  readonly grounding_evidence_id: string | null;
  readonly grounding_page_url: string | null;
  readonly grounding_page_type: string | null;
  readonly rank_position: number | null;
  readonly citation_type: 'explicit_url' | 'explicit_domain' | 'brand_mention' | 'paraphrased_reference';
  readonly sentiment: string | null;
  readonly confidence: number | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
};

export type ClientBenchmarkConfigRow = {
  readonly id: string;
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
  readonly benchmark_domain_id: string;
  readonly topic: string;
  readonly location: string;
  readonly query_set_id: string | null;
  readonly competitor_list: string[];
  readonly cadence: 'monthly' | 'biweekly' | 'weekly';
  readonly platforms_enabled: string[];
  readonly report_email: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

type SupabaseLike = SupabaseClient<any, 'public', any>;

function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    ...(incoming ?? {}),
  };
}

export function createBenchmarkRepository(supabase: SupabaseLike) {
  return {
    deriveDomainIdentity(
      siteUrl: string | null | undefined,
      fallbackDomain?: string | null | undefined
    ): BenchmarkDomainIdentity {
      return deriveBenchmarkDomainIdentity(siteUrl, fallbackDomain);
    },

    async getDomainByCanonicalDomain(
      canonicalDomain: string
    ): Promise<BenchmarkDomainRow | null> {
      const { data, error } = await supabase
        .from('benchmark_domains')
        .select(
          'id,domain,canonical_domain,site_url,display_name,vertical,subvertical,geo_region,is_customer,is_competitor,metadata,created_at,updated_at'
        )
        .eq('canonical_domain', canonicalDomain)
        .maybeSingle<BenchmarkDomainRow>();

      if (error) throw error;
      return data ?? null;
    },

    async getDomainById(id: string): Promise<BenchmarkDomainRow | null> {
      const { data, error } = await supabase
        .from('benchmark_domains')
        .select(
          'id,domain,canonical_domain,site_url,display_name,vertical,subvertical,geo_region,is_customer,is_competitor,metadata,created_at,updated_at'
        )
        .eq('id', id)
        .maybeSingle<BenchmarkDomainRow>();

      if (error) throw error;
      return data ?? null;
    },

    async listDomainsForBenchmarkScheduling(args?: {
      readonly limit?: number;
      readonly vertical?: string | null;
      readonly seedPriorities?: readonly number[];
      readonly canonicalDomains?: readonly string[];
      readonly requireScheduleEnabled?: boolean;
    }): Promise<BenchmarkDomainRow[]> {
      const limit = args?.limit ?? 20;
      const vertical = args?.vertical?.trim() || null;
      const seedPriorities = (args?.seedPriorities ?? []).filter((value) => Number.isFinite(value));
      const canonicalDomains = Array.from(
        new Set(
          (args?.canonicalDomains ?? [])
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0)
        )
      );
      const requireScheduleEnabled =
        args?.requireScheduleEnabled ??
        (seedPriorities.length > 0 || !!vertical || canonicalDomains.length > 0);
      const fetchLimit = Math.max(limit * 5, 100);

      let query = supabase
        .from('benchmark_domains')
        .select(
          'id,domain,canonical_domain,site_url,display_name,vertical,subvertical,geo_region,is_customer,is_competitor,metadata,created_at,updated_at'
        )
        .not('site_url', 'is', null)
        .order('created_at', { ascending: true })
        .limit(fetchLimit);

      if (vertical) {
        query = query.eq('vertical', vertical);
      }

      if (canonicalDomains.length > 0) {
        query = query.in('canonical_domain', canonicalDomains);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as BenchmarkDomainRow[])
        .filter((row) => {
          if (!row.site_url) return false;

          const metadata = row.metadata ?? {};
          const scheduleEnabled = metadata['schedule_enabled'] === true;
          const rawPriority = metadata['seed_priority'];
          const priority =
            typeof rawPriority === 'number'
              ? rawPriority
              : typeof rawPriority === 'string'
                ? Number.parseInt(rawPriority, 10)
                : null;

          if (seedPriorities.length > 0 && (!priority || !seedPriorities.includes(priority))) {
            return false;
          }

          if (
            canonicalDomains.length > 0 &&
            !canonicalDomains.includes(row.canonical_domain.trim().toLowerCase())
          ) {
            return false;
          }

          if (requireScheduleEnabled) {
            return scheduleEnabled;
          }

          return scheduleEnabled || (row.is_customer && !row.is_competitor);
        })
        .slice(0, limit);
    },

    async upsertDomain(input: BenchmarkDomainUpsertInput): Promise<BenchmarkDomainRow> {
      const identity = deriveBenchmarkDomainIdentity(input.siteUrl, input.domain);
      if (!identity.domain || !identity.canonicalDomain) {
        throw new Error('Benchmark domain identity requires a valid site URL or domain');
      }

      const existing = await this.getDomainByCanonicalDomain(identity.canonicalDomain);
      const payload = {
        domain: identity.domain,
        canonical_domain: identity.canonicalDomain,
        site_url: identity.siteUrl,
        display_name: input.displayName?.trim() || null,
        vertical: input.vertical?.trim() || null,
        subvertical: input.subvertical?.trim() || null,
        geo_region: input.geoRegion?.trim() || null,
        is_customer: input.isCustomer ?? existing?.is_customer ?? false,
        is_competitor: input.isCompetitor ?? existing?.is_competitor ?? false,
        metadata: mergeMetadata(existing?.metadata, input.metadata),
      };

      const { data, error } = await supabase
        .from('benchmark_domains')
        .upsert(payload, { onConflict: 'canonical_domain' })
        .select(
          'id,domain,canonical_domain,site_url,display_name,vertical,subvertical,geo_region,is_customer,is_competitor,metadata,created_at,updated_at'
        )
        .single<BenchmarkDomainRow>();

      if (error) throw error;
      return data;
    },

    async getActiveQuerySet(
      name: string,
      version: string
    ): Promise<BenchmarkQuerySetRow | null> {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .select('id,name,vertical,version,description,status,metadata,created_at')
        .eq('name', name)
        .eq('version', version)
        .eq('status', 'active')
        .maybeSingle<BenchmarkQuerySetRow>();

      if (error) throw error;
      return data ?? null;
    },

    async getQuerySetById(id: string): Promise<BenchmarkQuerySetRow | null> {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .select('id,name,vertical,version,description,status,metadata,created_at')
        .eq('id', id)
        .maybeSingle<BenchmarkQuerySetRow>();

      if (error) throw error;
      return data ?? null;
    },

    async upsertQuerySet(input: {
      readonly name: string;
      readonly version: string;
      readonly vertical?: string | null;
      readonly description?: string | null;
      readonly status?: 'draft' | 'active' | 'archived';
      readonly metadata?: Record<string, unknown>;
    }): Promise<BenchmarkQuerySetRow> {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .upsert(
          {
            name: input.name.trim(),
            version: input.version.trim(),
            vertical: input.vertical?.trim() || null,
            description: input.description?.trim() || null,
            status: input.status ?? 'draft',
            metadata: input.metadata ?? {},
          },
          { onConflict: 'name,version' }
        )
        .select('id,name,vertical,version,description,status,metadata,created_at')
        .single<BenchmarkQuerySetRow>();

      if (error) throw error;
      return data;
    },

    async replaceQueries(
      querySetId: string,
      queries: ReadonlyArray<{
        readonly queryKey: string;
        readonly queryText: string;
        readonly intentType: 'direct' | 'comparative' | 'discovery';
        readonly topic?: string | null;
        readonly weight?: number;
        readonly metadata?: Record<string, unknown>;
      }>
    ): Promise<BenchmarkQueryRow[]> {
      const { error: deleteError } = await supabase
        .from('benchmark_queries')
        .delete()
        .eq('query_set_id', querySetId);

      if (deleteError) throw deleteError;

      const payload = queries.map((query) => ({
        query_set_id: querySetId,
        query_key: query.queryKey.trim(),
        query_text: query.queryText.trim(),
        intent_type: query.intentType,
        topic: query.topic?.trim() || null,
        weight: query.weight ?? 1,
        metadata: query.metadata ?? {},
      }));

      const { data, error } = await supabase
        .from('benchmark_queries')
        .insert(payload)
        .select('id,query_set_id,query_key,query_text,intent_type,topic,weight,metadata,created_at');

      if (error) throw error;
      return (data ?? []) as BenchmarkQueryRow[];
    },

    async getQueriesForQuerySet(querySetId: string): Promise<BenchmarkQueryRow[]> {
      const { data, error } = await supabase
        .from('benchmark_queries')
        .select('id,query_set_id,query_key,query_text,intent_type,topic,weight,metadata,created_at')
        .eq('query_set_id', querySetId)
        .order('query_key', { ascending: true });

      if (error) throw error;
      return (data ?? []) as BenchmarkQueryRow[];
    },

    async createRunGroup(input: {
      readonly querySetId: string;
      readonly label: string;
      readonly modelSetVersion: string;
      readonly runScope?: string;
      readonly notes?: string | null;
      readonly metadata?: Record<string, unknown>;
      readonly status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
      readonly startedAt?: string | null;
      readonly completedAt?: string | null;
      readonly startupWorkspaceId?: string | null;
      readonly agencyAccountId?: string | null;
    }): Promise<BenchmarkRunGroupRow> {
      const { data, error } = await supabase
        .from('benchmark_run_groups')
        .insert({
          query_set_id: input.querySetId,
          label: input.label,
          model_set_version: input.modelSetVersion,
          run_scope: input.runScope ?? 'internal_benchmark',
          notes: input.notes ?? null,
          metadata: input.metadata ?? {},
          status: input.status ?? 'running',
          started_at: input.startedAt ?? null,
          completed_at: input.completedAt ?? null,
          startup_workspace_id: input.startupWorkspaceId ?? null,
          agency_account_id: input.agencyAccountId ?? null,
        })
        .select(
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,startup_workspace_id,agency_account_id,started_at,completed_at,created_at'
        )
        .single<BenchmarkRunGroupRow>();

      if (error) throw error;
      return data;
    },

    async getRunGroupByScheduleKey(
      scheduleRunKey: string
    ): Promise<BenchmarkRunGroupRow | null> {
      const { data, error } = await supabase
        .from('benchmark_run_groups')
        .select(
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,startup_workspace_id,agency_account_id,started_at,completed_at,created_at'
        )
        .contains('metadata', { schedule_run_key: scheduleRunKey })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<BenchmarkRunGroupRow>();

      if (error) throw error;
      return data ?? null;
    },

    async updateRunGroup(
      id: string,
      input: {
        readonly status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
        readonly completedAt?: string | null;
        readonly notes?: string | null;
        readonly metadata?: Record<string, unknown>;
      }
    ): Promise<BenchmarkRunGroupRow> {
      const { data, error } = await supabase
        .from('benchmark_run_groups')
        .update({
          status: input.status,
          completed_at: input.completedAt,
          notes: input.notes,
          metadata: input.metadata,
        })
        .eq('id', id)
        .select(
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,startup_workspace_id,agency_account_id,started_at,completed_at,created_at'
        )
        .single<BenchmarkRunGroupRow>();

      if (error) throw error;
      return data;
    },

    async insertQueryRuns(
      runs: ReadonlyArray<{
        readonly runGroupId: string;
        readonly domainId: string;
        readonly queryId: string;
        readonly modelId: string;
        readonly auditorModelId?: string | null;
        readonly status?: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
        readonly responseText?: string | null;
        readonly responseMetadata?: Record<string, unknown>;
        readonly errorMessage?: string | null;
        readonly executedAt?: string | null;
      }>
    ): Promise<QueryRunRow[]> {
      const payload = runs.map((run) => ({
        run_group_id: run.runGroupId,
        domain_id: run.domainId,
        query_id: run.queryId,
        model_id: run.modelId,
        auditor_model_id: run.auditorModelId ?? null,
        status: run.status ?? 'queued',
        response_text: run.responseText ?? null,
        response_metadata: run.responseMetadata ?? {},
        error_message: run.errorMessage ?? null,
        executed_at: run.executedAt ?? null,
      }));

      const { data, error } = await supabase
        .from('query_runs')
        .insert(payload)
        .select(
          'id,run_group_id,domain_id,query_id,model_id,auditor_model_id,status,response_text,response_metadata,error_message,executed_at,created_at'
        );

      if (error) throw error;
      return (data ?? []) as QueryRunRow[];
    },

    async insertDomainMetric(input: {
      readonly runGroupId: string;
      readonly domainId: string;
      readonly modelId: string;
      readonly citationRate?: number | null;
      readonly shareOfVoice?: number | null;
      readonly queryCoverage?: number | null;
      readonly inferenceProbability?: number | null;
      readonly driftScore?: number | null;
      readonly metrics?: Record<string, unknown>;
      readonly computedAt?: string | null;
    }): Promise<void> {
      const { error } = await supabase.from('benchmark_domain_metrics').insert({
        run_group_id: input.runGroupId,
        domain_id: input.domainId,
        model_id: input.modelId,
        citation_rate: input.citationRate ?? null,
        share_of_voice: input.shareOfVoice ?? null,
        query_coverage: input.queryCoverage ?? null,
        inference_probability: input.inferenceProbability ?? null,
        drift_score: input.driftScore ?? null,
        metrics: input.metrics ?? {},
        computed_at: input.computedAt ?? null,
      });

      if (error) throw error;
    },

    async insertQueryCitations(
      citations: ReadonlyArray<{
        readonly queryRunId: string;
        readonly citedDomain?: string | null;
        readonly citedUrl?: string | null;
        readonly groundingEvidenceId?: string | null;
        readonly groundingPageUrl?: string | null;
        readonly groundingPageType?: string | null;
        readonly rankPosition?: number | null;
        readonly citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention' | 'paraphrased_reference';
        readonly sentiment?: string | null;
        readonly confidence?: number | null;
        readonly metadata?: Record<string, unknown>;
      }>
    ): Promise<QueryCitationRow[]> {
      if (citations.length === 0) return [];

      const { data, error } = await supabase
        .from('query_citations')
        .insert(
          citations.map((citation) => ({
            query_run_id: citation.queryRunId,
            cited_domain: citation.citedDomain ?? null,
            cited_url: citation.citedUrl ?? null,
            grounding_evidence_id: citation.groundingEvidenceId ?? null,
            grounding_page_url: citation.groundingPageUrl ?? null,
            grounding_page_type: citation.groundingPageType ?? null,
            rank_position: citation.rankPosition ?? null,
            citation_type: citation.citationType,
            sentiment: citation.sentiment ?? null,
            confidence: citation.confidence ?? null,
            metadata: citation.metadata ?? {},
          }))
        )
        .select(
          'id,query_run_id,cited_domain,cited_url,grounding_evidence_id,grounding_page_url,grounding_page_type,rank_position,citation_type,sentiment,confidence,metadata,created_at'
        );

      if (error) throw error;
      return (data ?? []) as QueryCitationRow[];
    },

    async listDomainMetricsForRunGroup(runGroupId: string): Promise<Array<{
      readonly id: string;
      readonly run_group_id: string;
      readonly domain_id: string;
      readonly model_id: string;
      readonly citation_rate: number | null;
      readonly share_of_voice: number | null;
      readonly query_coverage: number | null;
      readonly inference_probability: number | null;
      readonly drift_score: number | null;
      readonly metrics: Record<string, unknown>;
      readonly computed_at: string | null;
      readonly created_at: string;
    }>> {
      const { data, error } = await supabase
        .from('benchmark_domain_metrics')
        .select(
          'id,run_group_id,domain_id,model_id,citation_rate,share_of_voice,query_coverage,inference_probability,drift_score,metrics,computed_at,created_at'
        )
        .eq('run_group_id', runGroupId);

      if (error) throw error;
      return (data ?? []) as any[];
    },

    async listQueryRunsForRunGroup(runGroupId: string): Promise<QueryRunRow[]> {
      const { data, error } = await supabase
        .from('query_runs')
        .select(
          'id,run_group_id,domain_id,query_id,model_id,auditor_model_id,status,response_text,response_metadata,error_message,executed_at,created_at'
        )
        .eq('run_group_id', runGroupId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as QueryRunRow[];
    },

    async listCitationsForRunGroup(runGroupId: string): Promise<QueryCitationRow[]> {
      // Fetch citations for all query_runs belonging to this run group
      const { data: runs, error: runsErr } = await supabase
        .from('query_runs')
        .select('id')
        .eq('run_group_id', runGroupId);

      if (runsErr) throw runsErr;
      if (!runs || runs.length === 0) return [];

      const runIds = (runs as { id: string }[]).map((r) => r.id);

      const { data, error } = await supabase
        .from('query_citations')
        .select(
          'id,query_run_id,cited_domain,cited_url,grounding_evidence_id,grounding_page_url,grounding_page_type,rank_position,citation_type,sentiment,confidence,metadata,created_at'
        )
        .in('query_run_id', runIds);

      if (error) throw error;
      return (data ?? []) as QueryCitationRow[];
    },

    async insertClientBenchmarkConfig(input: {
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
      readonly metadata?: Record<string, unknown>;
    }): Promise<ClientBenchmarkConfigRow> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .insert({
          startup_workspace_id: input.startupWorkspaceId ?? null,
          agency_account_id: input.agencyAccountId ?? null,
          benchmark_domain_id: input.benchmarkDomainId,
          topic: input.topic,
          location: input.location,
          query_set_id: input.querySetId ?? null,
          competitor_list: input.competitorList ?? [],
          cadence: input.cadence ?? 'monthly',
          platforms_enabled: input.platformsEnabled ?? ['chatgpt', 'gemini', 'perplexity'],
          report_email: input.reportEmail ?? null,
          metadata: input.metadata ?? {},
        })
        .select(
          'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
        )
        .single();

      if (error) throw error;
      return data as ClientBenchmarkConfigRow;
    },

    async getClientBenchmarkConfig(id: string): Promise<ClientBenchmarkConfigRow | null> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .select(
          'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as ClientBenchmarkConfigRow | null;
    },

    async listClientBenchmarkConfigsByStartupWorkspace(
      workspaceId: string
    ): Promise<ClientBenchmarkConfigRow[]> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .select(
          'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
        )
        .eq('startup_workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ClientBenchmarkConfigRow[];
    },

    async listClientBenchmarkConfigsByAgencyAccount(
      accountId: string
    ): Promise<ClientBenchmarkConfigRow[]> {
      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .select(
          'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
        )
        .eq('agency_account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ClientBenchmarkConfigRow[];
    },

    async updateClientBenchmarkConfig(
      id: string,
      input: {
        readonly topic?: string;
        readonly location?: string;
        readonly querySetId?: string | null;
        readonly competitorList?: string[];
        readonly cadence?: 'monthly' | 'biweekly' | 'weekly';
        readonly platformsEnabled?: string[];
        readonly reportEmail?: string | null;
        readonly metadata?: Record<string, unknown>;
      }
    ): Promise<ClientBenchmarkConfigRow> {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.topic !== undefined) patch['topic'] = input.topic;
      if (input.location !== undefined) patch['location'] = input.location;
      if (input.querySetId !== undefined) patch['query_set_id'] = input.querySetId;
      if (input.competitorList !== undefined) patch['competitor_list'] = input.competitorList;
      if (input.cadence !== undefined) patch['cadence'] = input.cadence;
      if (input.platformsEnabled !== undefined) patch['platforms_enabled'] = input.platformsEnabled;
      if (input.reportEmail !== undefined) patch['report_email'] = input.reportEmail;
      if (input.metadata !== undefined) patch['metadata'] = input.metadata;

      const { data, error } = await supabase
        .from('client_benchmark_configs')
        .update(patch)
        .eq('id', id)
        .select(
          'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
        )
        .single();

      if (error) throw error;
      return data as ClientBenchmarkConfigRow;
    },

    async deleteClientBenchmarkConfig(id: string): Promise<void> {
      const { error } = await supabase
        .from('client_benchmark_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
  };
}
