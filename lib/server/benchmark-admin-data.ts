type SupabaseLike = {
  from(table: string): any;
};

export type BenchmarkAdminFilters = {
  readonly domainId?: string | null;
  readonly querySetId?: string | null;
  readonly modelId?: string | null;
  readonly status?: string | null;
};

export type BenchmarkRunListRow = {
  readonly id: string;
  readonly query_set_id: string;
  readonly label: string;
  readonly run_scope: string;
  readonly model_set_version: string;
  readonly status: string;
  readonly notes: string | null;
  readonly metadata: Record<string, unknown>;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly domain_id: string;
  readonly domain: string;
  readonly canonical_domain: string;
  readonly site_url: string | null;
  readonly display_name: string | null;
  readonly query_set_name: string;
  readonly query_set_version: string;
  readonly query_coverage: number | null;
  readonly citation_rate: number | null;
  readonly share_of_voice: number | null;
};

export type BenchmarkRunGroupDetail = {
  readonly runGroup: BenchmarkRunListRow;
  readonly queryRuns: Array<{
    readonly id: string;
    readonly query_id: string;
    readonly query_key: string;
    readonly query_text: string;
    readonly status: string;
    readonly response_text: string | null;
    readonly response_metadata: Record<string, unknown>;
    readonly error_message: string | null;
    readonly executed_at: string | null;
    readonly citation_count: number;
  }>;
  readonly citations: Array<{
    readonly id: string;
    readonly query_run_id: string;
    readonly cited_domain: string | null;
    readonly cited_url: string | null;
    readonly rank_position: number | null;
    readonly citation_type: string;
    readonly confidence: number | null;
    readonly metadata: Record<string, unknown>;
    readonly created_at: string;
  }>;
};

export type BenchmarkDomainHistoryPoint = {
  readonly runGroupId: string;
  readonly label: string;
  readonly modelId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly queryCoverage: number | null;
  readonly citationRate: number | null;
  readonly shareOfVoice: number | null;
};

export type BenchmarkOption = {
  readonly id: string;
  readonly label: string;
};

function toMap<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row] as const));
}

export function createBenchmarkAdminData(supabase: SupabaseLike) {
  return {
    async getRunGroups(filters: BenchmarkAdminFilters = {}): Promise<BenchmarkRunListRow[]> {
      let query = supabase
        .from('benchmark_run_groups')
        .select(
          'id,query_set_id,label,run_scope,model_set_version,status,notes,metadata,started_at,completed_at,created_at'
        )
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.querySetId) query = query.eq('query_set_id', filters.querySetId);
      if (filters.modelId) query = query.eq('model_set_version', filters.modelId);
      if (filters.status) query = query.eq('status', filters.status);

      const { data: runGroups, error: runGroupError } = await query;
      if (runGroupError) throw runGroupError;

      const rows = (runGroups ?? []) as Array<{
        id: string;
        query_set_id: string;
        label: string;
        run_scope: string;
        model_set_version: string;
        status: string;
        notes: string | null;
        metadata: Record<string, unknown>;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
      }>;

      if (rows.length === 0) return [];

      const runGroupIds = rows.map((row) => row.id);
      const { data: queryRuns, error: queryRunError } = await supabase
        .from('query_runs')
        .select('run_group_id,domain_id')
        .in('run_group_id', runGroupIds);

      if (queryRunError) throw queryRunError;

      const domainIds = Array.from(
        new Set(
          ((queryRuns ?? []) as Array<{ domain_id: string }>).map((row) => row.domain_id)
        )
      );

      const [{ data: metrics, error: metricsError }, { data: querySets, error: querySetError }, { data: domains, error: domainError }] =
        await Promise.all([
          supabase
            .from('benchmark_domain_metrics')
            .select('run_group_id,domain_id,model_id,query_coverage,citation_rate,share_of_voice')
            .in('run_group_id', runGroupIds),
          supabase
            .from('benchmark_query_sets')
            .select('id,name,version')
            .in(
              'id',
              Array.from(new Set(rows.map((row) => row.query_set_id)))
            ),
          domainIds.length > 0
            ? supabase
                .from('benchmark_domains')
                .select('id,domain,canonical_domain,site_url,display_name')
                .in('id', domainIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (metricsError || querySetError || domainError) {
        throw metricsError ?? querySetError ?? domainError;
      }

      const firstDomainIdByRunGroup = new Map<string, string>();
      for (const row of (queryRuns ?? []) as Array<{ run_group_id: string; domain_id: string }>) {
        if (!firstDomainIdByRunGroup.has(row.run_group_id)) {
          firstDomainIdByRunGroup.set(row.run_group_id, row.domain_id);
        }
      }

      const domainMap = toMap(
        ((domains ?? []) as Array<{
          id: string;
          domain: string;
          canonical_domain: string;
          site_url: string | null;
          display_name: string | null;
        }>) ?? []
      );
      const querySetMap = toMap(
        ((querySets ?? []) as Array<{ id: string; name: string; version: string }>) ?? []
      );
      const metricMap = new Map(
        ((metrics ?? []) as Array<{
          run_group_id: string;
          domain_id: string;
          model_id: string;
          query_coverage: number | null;
          citation_rate: number | null;
          share_of_voice: number | null;
        }>).map((row) => [`${row.run_group_id}:${row.domain_id}`, row] as const)
      );

      const hydrated = rows
        .map((row) => {
          const domainId = firstDomainIdByRunGroup.get(row.id);
          if (!domainId) return null;
          if (filters.domainId && domainId !== filters.domainId) return null;
          const domain = domainMap.get(domainId);
          if (!domain) return null;
          const querySet = querySetMap.get(row.query_set_id);
          const metric = metricMap.get(`${row.id}:${domainId}`);

          return {
            ...row,
            domain_id: domainId,
            domain: domain.domain,
            canonical_domain: domain.canonical_domain,
            site_url: domain.site_url,
            display_name: domain.display_name,
            query_set_name: querySet?.name ?? 'unknown',
            query_set_version: querySet?.version ?? 'unknown',
            query_coverage: metric?.query_coverage ?? null,
            citation_rate: metric?.citation_rate ?? null,
            share_of_voice: metric?.share_of_voice ?? null,
          };
        })
        .filter((row): row is BenchmarkRunListRow => row !== null);

      return hydrated;
    },

    async getRunGroupDetail(runGroupId: string): Promise<BenchmarkRunGroupDetail | null> {
      const runGroups = await this.getRunGroups();
      const runGroup = runGroups.find((row) => row.id === runGroupId) ?? null;
      if (!runGroup) return null;

      const { data: queryRuns, error: queryRunError } = await supabase
        .from('query_runs')
        .select(
          'id,query_id,status,response_text,response_metadata,error_message,executed_at'
        )
        .eq('run_group_id', runGroupId);

      if (queryRunError) throw queryRunError;

      const rawQueryRuns = (queryRuns ?? []) as Array<{
        id: string;
        query_id: string;
        status: string;
        response_text: string | null;
        response_metadata: Record<string, unknown>;
        error_message: string | null;
        executed_at: string | null;
      }>;

      const queryIds = rawQueryRuns.map((row) => row.query_id);
      const [{ data: queries, error: queriesError }, citationFetch] = await Promise.all([
        supabase
          .from('benchmark_queries')
          .select('id,query_key,query_text')
          .in('id', queryIds),
        rawQueryRuns.length > 0
          ? supabase
              .from('query_citations')
              .select(
                'id,query_run_id,cited_domain,cited_url,rank_position,citation_type,confidence,metadata,created_at'
              )
              .in(
                'query_run_id',
                rawQueryRuns.map((row) => row.id)
              )
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (queriesError) throw queriesError;
      if (citationFetch.error) throw citationFetch.error;

      const queryMap = toMap(
        ((queries ?? []) as Array<{ id: string; query_key: string; query_text: string }>) ?? []
      );
      const citationRows = (citationFetch.data ?? []) as Array<{
        id: string;
        query_run_id: string;
        cited_domain: string | null;
        cited_url: string | null;
        rank_position: number | null;
        citation_type: string;
        confidence: number | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;

      const citationCountByQueryRun = new Map<string, number>();
      for (const citation of citationRows) {
        citationCountByQueryRun.set(
          citation.query_run_id,
          (citationCountByQueryRun.get(citation.query_run_id) ?? 0) + 1
        );
      }

      return {
        runGroup,
        queryRuns: rawQueryRuns.map((row) => ({
          id: row.id,
          query_id: row.query_id,
          query_key: queryMap.get(row.query_id)?.query_key ?? 'unknown',
          query_text: queryMap.get(row.query_id)?.query_text ?? 'Unknown query',
          status: row.status,
          response_text: row.response_text,
          response_metadata: row.response_metadata,
          error_message: row.error_message,
          executed_at: row.executed_at,
          citation_count: citationCountByQueryRun.get(row.id) ?? 0,
        })),
        citations: citationRows,
      };
    },

    async getDomainHistory(domainId: string): Promise<BenchmarkDomainHistoryPoint[]> {
      const runGroups = await this.getRunGroups({ domainId });
      return runGroups.map((row) => ({
        runGroupId: row.id,
        label: row.label,
        modelId: row.model_set_version,
        status: row.status,
        createdAt: row.created_at,
        queryCoverage: row.query_coverage,
        citationRate: row.citation_rate,
        shareOfVoice: row.share_of_voice,
      }));
    },

    async getDomainOptions(): Promise<BenchmarkOption[]> {
      const { data, error } = await supabase
        .from('benchmark_domains')
        .select('id,display_name,canonical_domain')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as Array<{
        id: string;
        display_name: string | null;
        canonical_domain: string;
      }>).map((row) => ({
        id: row.id,
        label: row.display_name ?? row.canonical_domain,
      }));
    },

    async getQuerySetOptions(): Promise<BenchmarkOption[]> {
      const { data, error } = await supabase
        .from('benchmark_query_sets')
        .select('id,name,version,status')
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as Array<{
        id: string;
        name: string;
        version: string;
        status: string;
      }>).map((row) => ({
        id: row.id,
        label: `${row.name} · ${row.version}${row.status === 'draft' ? ' · draft' : ''}`,
      }));
    },
  };
}
