import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REASONING_POLICY_VERSION,
  type ReasoningAccess,
  type ReasoningFact,
  type ReasoningRequest,
} from './reasoning-contracts';
import type { ReasoningFactReader } from './reasoning';

type SourceDefinition = {
  readonly table: string;
  readonly idColumn: string;
  readonly evidenceColumn: string;
  readonly runColumn: string;
  readonly summary: (row: Record<string, unknown>) => string;
};

const SOURCES: Record<ReasoningRequest['capability'], SourceDefinition> = {
  domain_timeline: {
    table: 'intelligence_mart_domain_measurement_timeline',
    idColumn: 'canonical_domain_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `Citation rate was ${String(row['citation_rate'] ?? 'unavailable')} at ${String(row['observed_at'] ?? 'an unknown time')}.`,
  },
  lane_window_health: {
    table: 'intelligence_mart_lane_window_health',
    idColumn: 'lane_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `Window coverage is ${String(row['coverage'] ?? 'unavailable')} with ${String(row['sample_size'] ?? 0)} expected cells.`,
  },
  compare_windows: {
    table: 'intelligence_mart_lane_window_health',
    idColumn: 'window_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `Window ${String(row['window_id'])} has coverage ${String(row['coverage'] ?? 'unavailable')}.`,
  },
  uncited_buyer_questions: {
    table: 'intelligence_mart_domain_query_model_outcomes',
    idColumn: 'canonical_domain_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `Question ${String(row['query_id'])} did not cite the measured domain.`,
  },
  evidence_lineage: {
    table: 'intelligence_evidence_objects',
    idColumn: 'stable_evidence_id',
    evidenceColumn: 'stable_evidence_id',
    runColumn: 'run_id',
    summary: (row) => `Evidence ${String(row['stable_evidence_id'])} is ${String(row['artifact_status'])}.`,
  },
  intervention_outcomes: {
    table: 'intelligence_mart_intervention_outcomes',
    idColumn: 'recommendation_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `The observed citation-rate delta is ${String(row['citation_rate_delta'] ?? 'unavailable')}.`,
  },
  explain_anomaly: {
    table: 'intelligence_mart_lane_window_health',
    idColumn: 'anomaly_codes',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `Anomaly ${String((row['anomaly_codes'] as unknown[] | undefined)?.join(', ') ?? 'unknown')} was observed.`,
  },
  recommend_next_action: {
    table: 'intelligence_mart_domain_measurement_timeline',
    idColumn: 'canonical_domain_id',
    evidenceColumn: 'source_evidence_ids',
    runColumn: 'source_run_ids',
    summary: (row) => `The latest compatible citation rate is ${String(row['citation_rate'] ?? 'unavailable')}.`,
  },
};

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return [];
}

export class SupabaseReasoningFactReader implements ReasoningFactReader {
  constructor(private readonly db: SupabaseClient) {}

  async read(request: ReasoningRequest, access: ReasoningAccess): Promise<readonly ReasoningFact[]> {
    if (!access.isPlatformAdmin) {
      throw Object.assign(
        new Error('The shared repository is platform-admin only until tenant-scoped SQL policies are added.'),
        { code: 'tenant_scope_violation' }
      );
    }
    const source = SOURCES[request.capability];
    let query: any = this.db.from(source.table).select('*').limit(request.limit);
    if (request.capability === 'compare_windows') {
      query = query.in(source.idColumn, request.windowIds ?? []);
    } else {
      const value =
        request.canonicalDomainId ?? request.laneId ?? request.evidenceId ??
        request.recommendationId ?? request.anomalyCode;
      if (request.capability === 'explain_anomaly') query = query.contains(source.idColumn, [value]);
      else if (value) query = query.eq(source.idColumn, value);
    }
    if (request.capability === 'uncited_buyer_questions') query = query.eq('citation_rate', 0);
    const response = await query as {
      data: Record<string, unknown>[] | null;
      error: { code?: string; message: string } | null;
    };
    if (response.error) throw Object.assign(new Error(response.error.message), { code: response.error.code });
    const rows = response.data ?? [];
    const selectedRunIds = [...new Set(rows.flatMap((row) => list(row[source.runColumn])))];
    const evidenceByRun = new Map<string, string[]>();
    if (selectedRunIds.length > 0 && source.table !== 'intelligence_evidence_objects') {
      const evidenceResponse = await this.db
        .from('intelligence_evidence_objects')
        .select('stable_evidence_id,run_id')
        .in('run_id', selectedRunIds) as unknown as {
          data: Array<{ stable_evidence_id: string; run_id: string }> | null;
          error: { code?: string; message: string } | null;
        };
      if (evidenceResponse.error) {
        throw Object.assign(new Error(evidenceResponse.error.message), { code: evidenceResponse.error.code });
      }
      for (const item of evidenceResponse.data ?? []) {
        evidenceByRun.set(item.run_id, [
          ...(evidenceByRun.get(item.run_id) ?? []),
          item.stable_evidence_id,
        ]);
      }
    }
    return rows.map((row, index) => {
      const runIds = list(row[source.runColumn]);
      const evidenceIds = [
        ...new Set([
          ...list(row[source.evidenceColumn]),
          ...runIds.flatMap((runId) => evidenceByRun.get(runId) ?? []),
        ]),
      ];
      return {
        factId: `${request.capability}:${String(row[source.idColumn] ?? index)}`,
        factType: request.capability,
        summary: source.summary(row),
        value: row,
        evidenceIds,
        compatibleRunIds: runIds,
        qualityState: row['quality_state'] === 'valid_partial' ? 'valid_partial' : 'valid',
        comparisonLabel: row['comparison_label'] === 'exact_lane_version'
          ? 'exact_lane_version'
          : request.capability === 'compare_windows' || request.capability === 'intervention_outcomes'
            ? 'exact'
            : 'not_applicable',
        causalityLabel: row['causality_label'] === 'observational_association_not_causation'
          ? 'observational_association_not_causation'
          : 'not_applicable',
        tenantType: null,
        tenantId: null,
        policyVersion: REASONING_POLICY_VERSION,
        promptVersion: null,
        modelVersion: typeof row['model_id'] === 'string' ? row['model_id'] : null,
      };
    });
  }
}
