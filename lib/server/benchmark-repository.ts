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
        })
        .select(
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,started_at,completed_at,created_at'
        )
        .single<BenchmarkRunGroupRow>();

      if (error) throw error;
      return data;
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
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,started_at,completed_at,created_at'
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
  };
}
