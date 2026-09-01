import { describe, expect, it } from 'vitest';
import { buildBenchmarkMeasurementReconciliationPlan } from './benchmark-measurement-reconciliation';

function fixture(options?: { missingScheduleVersionGroup?: number }) {
  const querySets = [{
    id: 'msp-query-set',
    name: 'Quebec MSP buyer questions',
    vertical: 'managed_service_providers',
    version: 'msp-v1',
    metadata: {
      subvertical: 'quebec_msp',
      methodology_version: 'msp-cohort-v1',
    },
  }];
  const queries = Array.from({ length: 10 }, (_, index) => ({
    id: `query-${index + 1}`,
    query_set_id: 'msp-query-set',
  }));
  const models = ['sonar', 'gpt-5-mini', 'gemini-2.5-flash-lite'];
  const runGroups = Array.from({ length: 30 }, (_, index) => {
    const runMode = index % 2 === 0 ? 'grounded_site' : 'ungrounded_inference';
    return {
      id: `group-${index + 1}`,
      query_set_id: 'msp-query-set',
      run_scope: 'scheduled_internal_benchmark',
      model_set_version: models[index % models.length],
      status: index === 29 ? 'failed' : 'completed',
      created_at: '2026-09-01T00:01:00.000Z',
      started_at: '2026-09-01T00:01:00.000Z',
      completed_at: '2026-09-01T00:12:00.000Z',
      metadata: {
        domain_id: `domain-${Math.floor(index / 3) + 1}`,
        schedule_window_utc: '2026-09-01T00',
        schedule_run_key: `msp:${index + 1}:2026-09-01T00`,
        schedule_window_hours: 12,
        schedule_vertical: 'managed_service_providers',
        schedule_subvertical: 'quebec_msp',
        schedule_version: options?.missingScheduleVersionGroup === index + 1 ? undefined : 'msp-schedule-v3',
        cohort_definition_version: 'msp-cohort-v1',
        model_snapshot: models[index % models.length],
        run_mode: runMode,
        grounding_context_source: runMode === 'grounded_site' ? 'canonical_homepage' : undefined,
        prompt_version: 'benchmark-prompt-v2',
        citation_parser_version: 'citation-parser-v2',
        metric_definition_version: 'benchmark-metrics-v1',
      },
    };
  });
  const queryRuns = runGroups.flatMap((group) =>
    queries.map((query) => ({
      id: `${group.id}:${query.id}`,
      run_group_id: group.id,
      status: group.status,
    }))
  );
  return { runGroups, querySets, queries, queryRuns };
}

describe('benchmark measurement reconciliation', () => {
  it('maps a completed 30-group scheduled window and all 300 query cells', () => {
    const plan = buildBenchmarkMeasurementReconciliationPlan(fixture());

    expect(plan.runGroupCount).toBe(30);
    expect(plan.queryRunCount).toBe(300);
    expect(plan.mappedQueryRunCount).toBe(300);
    expect(plan.failClosedQueryRunCount).toBe(0);
    expect(plan.qualityStates).toEqual({ complete: 29, failed: 1 });
    expect(plan.mappings.filter((mapping) => mapping.sourceKind === 'benchmark_run_group')).toHaveLength(30);
    expect(plan.mappings.filter((mapping) => mapping.sourceKind === 'benchmark_query_run')).toHaveLength(300);

    const failedRawCell = plan.mappings.find(
      (mapping) => mapping.sourceId === 'group-30:query-1'
    );
    expect(failedRawCell).toMatchObject({
      sourceKind: 'benchmark_query_run',
      mappingStatus: 'mapped',
      mappingReason: null,
      windowKey: '2026-09-01T00',
    });
  });

  it('fails closed for every child cell when a required protocol version is absent', () => {
    const plan = buildBenchmarkMeasurementReconciliationPlan(
      fixture({ missingScheduleVersionGroup: 1 })
    );

    const affected = plan.mappings.filter((mapping) =>
      mapping.sourceId === 'group-1' || mapping.sourceId.startsWith('group-1:')
    );
    expect(affected).toHaveLength(11);
    expect(affected.every((mapping) => mapping.mappingStatus === 'legacy_unknown')).toBe(true);
    expect(plan.mappedQueryRunCount).toBe(290);
    expect(plan.failClosedQueryRunCount).toBe(10);
  });
});
