import type { SupabaseClient } from '@supabase/supabase-js';

export type IntelligenceAdminStatus = 'ready' | 'migration_pending' | 'error';

export type IntelligenceAdminResult<T> = {
  readonly status: IntelligenceAdminStatus;
  readonly data: T;
  readonly message: string | null;
};

export type IntelligenceOverview = {
  readonly domainCount: number;
  readonly runCount: number;
  readonly evidenceCount: number;
  readonly qualityCount: number;
  readonly eligibleWindowCount: number;
  readonly ineligibleWindowCount: number;
  readonly openAlertCount: number;
  readonly interventionCount: number;
  readonly latestObservedAt: string | null;
  readonly recentSourceKinds: readonly string[];
};

export type IntelligenceDomainRow = {
  readonly canonical_domain_id: string | null;
  readonly observed_at: string | null;
  readonly model_id: string | null;
  readonly run_mode: string | null;
  readonly citation_rate: number | null;
  readonly coverage: number | null;
  readonly freshness_hours: number | null;
  readonly comparison_label: string | null;
};

export type IntelligenceLaneRow = {
  readonly id: string;
  readonly lane_key: string;
  readonly provider: string | null;
  readonly model_id: string | null;
  readonly run_mode: string | null;
  readonly comparability: string | null;
  readonly created_at: string;
};

export type IntelligenceWindowRow = {
  readonly source_kind: string;
  readonly source_id: string;
  readonly lane_id: string | null;
  readonly window_id: string | null;
  readonly eligible: boolean;
  readonly coverage: number;
  readonly sample_size: number;
  readonly missing_cells: readonly string[];
  readonly anomaly_codes: readonly string[];
  readonly freshness_hours: number | null;
  readonly metric_status: string;
};

export type IntelligenceEvidenceRow = {
  readonly stable_evidence_id: string;
  readonly evidence_kind: string;
  readonly object_class: string;
  readonly source_kind: string;
  readonly source_id: string;
  readonly artifact_status: string;
  readonly privacy: string;
  readonly content_hash: string | null;
  readonly collected_at: string | null;
  readonly source_created_at: string | null;
  readonly parser_version: string | null;
  readonly extractor_version: string | null;
};

export type IntelligenceRunRow = {
  readonly id: string;
  readonly source_kind: string;
  readonly source_id: string;
  readonly source_status: string | null;
  readonly quality_state: string;
  readonly provider: string | null;
  readonly model_id: string | null;
  readonly run_mode: string | null;
  readonly observed_at: string | null;
  readonly lane_id: string | null;
  readonly window_id: string | null;
  readonly versions: Readonly<Record<string, string | null>>;
};

export type IntelligenceQualityRow = {
  readonly stable_classification_id: string;
  readonly source_kind: string;
  readonly source_id: string;
  readonly original_status: string | null;
  readonly quality_state: string;
  readonly reason_codes: readonly string[];
  readonly age_hours: number | null;
  readonly classified_at: string;
};

export type IntelligenceAlertRow = {
  readonly id: string;
  readonly severity: string;
  readonly source_kind: string;
  readonly source_id: string | null;
  readonly reason_code: string;
  readonly observed_at: string;
  readonly resolved_at: string | null;
};

export type IntelligencePatternRow = {
  readonly recommendation_id: string;
  readonly canonical_domain_id: string | null;
  readonly metric_status: string;
  readonly citation_rate_delta: number | null;
  readonly elapsed_hours: number | null;
  readonly sample_size: number;
  readonly comparison_label: string;
  readonly causality_label: string;
};

type CountResult = { count: number | null; error: { code?: string; message: string } | null };
type RowsResult = { data: unknown[] | null; error: { code?: string; message: string } | null };

function statusForError(error: { code?: string; message: string }): IntelligenceAdminStatus {
  return error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)
    ? 'migration_pending'
    : 'error';
}

function resultFromError<T>(error: { code?: string; message: string }, fallback: T): IntelligenceAdminResult<T> {
  const status = statusForError(error);
  return {
    status,
    data: fallback,
    message: status === 'migration_pending'
      ? 'The intelligence database foundation is queued for deployment. Existing product data is unchanged.'
      : 'The intelligence control room could not load this dataset.',
  };
}

function ready<T>(data: T): IntelligenceAdminResult<T> {
  return { status: 'ready', data, message: null };
}

async function count(
  db: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<CountResult> {
  let query: any = db.from(table).select('*', { count: 'exact', head: true });
  if (configure) query = configure(query);
  return await query as CountResult;
}

async function rows<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  configure: (query: any) => any,
  fallback: T[] = []
): Promise<IntelligenceAdminResult<T[]>> {
  const response = await configure(db.from(table).select(columns)) as RowsResult;
  if (response.error) return resultFromError(response.error, fallback);
  return ready((response.data ?? []) as T[]);
}

export function createIntelligenceAdminData(db: SupabaseClient) {
  return {
    async getOverview(): Promise<IntelligenceAdminResult<IntelligenceOverview>> {
      const definitions: Array<{
        key: keyof IntelligenceOverview;
        table: string;
        configure?: (query: any) => any;
      }> = [
        { key: 'domainCount', table: 'intelligence_domains' },
        { key: 'runCount', table: 'intelligence_runs' },
        { key: 'evidenceCount', table: 'intelligence_evidence_objects' },
        { key: 'qualityCount', table: 'intelligence_run_quality_classifications' },
        { key: 'eligibleWindowCount', table: 'intelligence_window_quality_assessments', configure: (query) => query.eq('eligible', true) },
        { key: 'ineligibleWindowCount', table: 'intelligence_window_quality_assessments', configure: (query) => query.eq('eligible', false) },
        { key: 'openAlertCount', table: 'intelligence_quality_alerts', configure: (query) => query.is('resolved_at', null) },
        { key: 'interventionCount', table: 'intelligence_mart_intervention_outcomes' },
      ];
      const overview: IntelligenceOverview = {
        domainCount: 0, runCount: 0, evidenceCount: 0, qualityCount: 0,
        eligibleWindowCount: 0, ineligibleWindowCount: 0, openAlertCount: 0,
        interventionCount: 0, latestObservedAt: null, recentSourceKinds: [],
      };
      for (const definition of definitions) {
        const response = await count(db, definition.table, definition.configure);
        if (response.error) return resultFromError(response.error, overview);
        (overview as unknown as Record<string, number>)[definition.key] = response.count ?? 0;
      }
      const recent = await rows<{ source_kind: string; observed_at: string | null }>(
        db,
        'intelligence_runs',
        'source_kind,observed_at',
        (query) => query.order('observed_at', { ascending: false }).limit(100)
      );
      if (recent.status !== 'ready') return { ...recent, data: overview };
      const observed = recent.data.find((row) => row.observed_at)?.observed_at ?? null;
      return ready({
        ...overview,
        latestObservedAt: observed,
        recentSourceKinds: [...new Set(recent.data.map((row) => row.source_kind))].sort(),
      });
    },

    getDomains(limit = 100): Promise<IntelligenceAdminResult<IntelligenceDomainRow[]>> {
      return rows<IntelligenceDomainRow>(
        db,
        'intelligence_mart_domain_measurement_timeline',
        'canonical_domain_id,observed_at,model_id,run_mode,citation_rate,coverage,freshness_hours,comparison_label',
        (query) => query.order('observed_at', { ascending: false }).limit(Math.min(limit, 250))
      );
    },

    getLanes(limit = 100): Promise<IntelligenceAdminResult<IntelligenceLaneRow[]>> {
      return rows<IntelligenceLaneRow>(
        db,
        'intelligence_measurement_lanes',
        'id,lane_key,provider,model_id,run_mode,comparability,created_at',
        (query) => query.order('created_at', { ascending: false }).limit(Math.min(limit, 250))
      );
    },

    getWindows(laneId?: string): Promise<IntelligenceAdminResult<IntelligenceWindowRow[]>> {
      return rows<IntelligenceWindowRow>(
        db,
        'intelligence_mart_lane_window_health',
        'source_kind,source_id,lane_id,window_id,eligible,coverage,sample_size,missing_cells,anomaly_codes,freshness_hours,metric_status',
        (query) => {
          let next = query.order('refreshed_at', { ascending: false }).limit(200);
          if (laneId) next = next.eq('lane_id', laneId);
          return next;
        }
      );
    },

    getEvidence(filters: {
      sourceKind?: string;
      sourceId?: string;
      limit?: number;
    } = {}): Promise<IntelligenceAdminResult<IntelligenceEvidenceRow[]>> {
      return rows<IntelligenceEvidenceRow>(
        db,
        'intelligence_evidence_objects',
        'stable_evidence_id,evidence_kind,object_class,source_kind,source_id,artifact_status,privacy,content_hash,collected_at,source_created_at,parser_version,extractor_version',
        (query) => {
          let next = query.order('indexed_at', { ascending: false }).limit(Math.min(filters.limit ?? 100, 250));
          if (filters.sourceKind) next = next.eq('source_kind', filters.sourceKind);
          if (filters.sourceId) next = next.eq('source_id', filters.sourceId);
          return next;
        }
      );
    },

    getRuns(filters: {
      laneId?: string;
      windowId?: string;
      sourceKind?: string;
      sourceId?: string;
      limit?: number;
    } = {}): Promise<IntelligenceAdminResult<IntelligenceRunRow[]>> {
      return rows<IntelligenceRunRow>(
        db,
        'intelligence_runs',
        'id,source_kind,source_id,source_status,quality_state,provider,model_id,run_mode,observed_at,lane_id,window_id,versions',
        (query) => {
          let next = query.order('observed_at', { ascending: false }).limit(Math.min(filters.limit ?? 100, 250));
          if (filters.laneId) next = next.eq('lane_id', filters.laneId);
          if (filters.windowId) next = next.eq('window_id', filters.windowId);
          if (filters.sourceKind) next = next.eq('source_kind', filters.sourceKind);
          if (filters.sourceId) next = next.eq('source_id', filters.sourceId);
          return next;
        }
      );
    },

    async getQuality(): Promise<IntelligenceAdminResult<{
      classifications: IntelligenceQualityRow[];
      alerts: IntelligenceAlertRow[];
    }>> {
      const classifications = await rows<IntelligenceQualityRow>(
        db,
        'intelligence_run_quality_classifications',
        'stable_classification_id,source_kind,source_id,original_status,quality_state,reason_codes,age_hours,classified_at',
        (query) => query.order('classified_at', { ascending: false }).limit(150)
      );
      if (classifications.status !== 'ready') {
        return { ...classifications, data: { classifications: [], alerts: [] } };
      }
      const alerts = await rows<IntelligenceAlertRow>(
        db,
        'intelligence_quality_alerts',
        'id,severity,source_kind,source_id,reason_code,observed_at,resolved_at',
        (query) => query.is('resolved_at', null).order('observed_at', { ascending: false }).limit(100)
      );
      if (alerts.status !== 'ready') {
        return { ...alerts, data: { classifications: classifications.data, alerts: [] } };
      }
      return ready({ classifications: classifications.data, alerts: alerts.data });
    },

    getPatterns(limit = 100): Promise<IntelligenceAdminResult<IntelligencePatternRow[]>> {
      return rows<IntelligencePatternRow>(
        db,
        'intelligence_mart_intervention_outcomes',
        'recommendation_id,canonical_domain_id,metric_status,citation_rate_delta,elapsed_hours,sample_size,comparison_label,causality_label',
        (query) => query.order('intervention_at', { ascending: false }).limit(Math.min(limit, 250))
      );
    },
  };
}
