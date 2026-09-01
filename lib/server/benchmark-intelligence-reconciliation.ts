import {
  MEASUREMENT_LANE_PROTOCOL_VERSION,
  UNKNOWN_PROTOCOL_VALUE,
  batchMeasurementLaneFingerprints,
} from '../intelligence/measurement-lane';
import {
  buildBenchmarkMeasurementReconciliationPlan,
  type BenchmarkMeasurementRow,
} from '../intelligence/benchmark-measurement-reconciliation';
import { runIntelligenceLearningLoop } from './intelligence-learning-loop';

const READ_BATCH_SIZE = 25;
const WRITE_BATCH_SIZE = 25;
const RUN_GROUP_COLUMNS = 'id,query_set_id,run_scope,model_set_version,status,metadata,startup_workspace_id,agency_account_id,started_at,completed_at,created_at';
const QUERY_SET_COLUMNS = 'id,name,vertical,version,metadata';
const QUERY_COLUMNS = 'id,query_set_id';
const QUERY_RUN_COLUMNS = 'id,run_group_id,status';

type SupabaseLike = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): any;
};

export type RecentBenchmarkMeasurementReconciliationResult = {
  readonly protocolVersion: string;
  readonly recentHours: number;
  readonly runGroups: number;
  readonly queryRuns: number;
  readonly lanes: number;
  readonly windows: number;
  readonly mappingsWritten: number;
  readonly mappedQueryRuns: number;
  readonly failClosedQueryRuns: number;
  readonly indexedQueryRunsUpdated: number;
};

export type BenchmarkIntelligenceAfterSweepResult = {
  readonly measurementReconciliation: RecentBenchmarkMeasurementReconciliationResult;
  readonly qualityRefresh: unknown;
  readonly learning: Awaited<ReturnType<typeof runIntelligenceLearningLoop>>;
};

export type BenchmarkIntelligenceReconciliationOptions = {
  readonly recentHours?: number;
  readonly now?: Date;
  readonly querySetId?: string | null;
  readonly windowKey?: string | null;
};

function chunks<T>(values: readonly T[], size = READ_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function fetchByValues(
  client: SupabaseLike,
  table: string,
  columns: string,
  field: string,
  values: readonly string[]
): Promise<BenchmarkMeasurementRow[]> {
  const rows: BenchmarkMeasurementRow[] = [];
  for (const batch of chunks([...new Set(values)])) {
    if (batch.length === 0) continue;
    const result = await client.from(table).select(columns).in(field, batch);
    if (result.error) throw new Error(`${table} lookup failed: ${result.error.message}`);
    rows.push(...((result.data ?? []) as BenchmarkMeasurementRow[]));
  }
  return rows;
}

async function upsertBatches(
  client: SupabaseLike,
  table: string,
  rows: readonly Record<string, unknown>[],
  onConflict: string,
  label: string
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    const result = await client.from(table).upsert(
      rows.slice(offset, offset + WRITE_BATCH_SIZE),
      { onConflict }
    );
    if (result.error) throw new Error(`${label} failed at row ${offset}: ${result.error.message}`);
  }
}

async function updateIndexedRuns(
  client: SupabaseLike,
  sourceKind: 'benchmark_run_group' | 'benchmark_query_run',
  rows: readonly { sourceId: string; laneId: string; windowId: string }[]
): Promise<number> {
  const grouped = new Map<string, { laneId: string; windowId: string; sourceIds: string[] }>();
  for (const row of rows) {
    const key = `${row.laneId}:${row.windowId}`;
    const current = grouped.get(key) ?? { laneId: row.laneId, windowId: row.windowId, sourceIds: [] };
    current.sourceIds.push(row.sourceId);
    grouped.set(key, current);
  }

  let updated = 0;
  for (const group of grouped.values()) {
    for (const sourceIds of chunks(group.sourceIds)) {
      const result = await client
        .from('intelligence_runs')
        .update({ lane_id: group.laneId, window_id: group.windowId })
        .eq('source_kind', sourceKind)
        .in('source_id', sourceIds)
        .select('source_id');
      if (result.error) {
        throw new Error(`Canonical ${sourceKind} lane update failed: ${result.error.message}`);
      }
      updated += (result.data ?? []).length;
    }
  }
  return updated;
}

export async function reconcileRecentBenchmarkMeasurementMappings(
  client: SupabaseLike,
  options?: BenchmarkIntelligenceReconciliationOptions
): Promise<RecentBenchmarkMeasurementReconciliationResult> {
  const recentHours = Math.max(1, Math.floor(options?.recentHours ?? 72));
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - recentHours * 60 * 60 * 1_000).toISOString();
  let groupsQuery = client
    .from('benchmark_run_groups')
    .select(RUN_GROUP_COLUMNS)
    .gte('created_at', cutoff);
  if (options?.querySetId) groupsQuery = groupsQuery.eq('query_set_id', options.querySetId);
  if (options?.windowKey) {
    groupsQuery = groupsQuery.contains('metadata', { schedule_window_utc: options.windowKey });
  }
  const groupsResult = await groupsQuery.order('created_at', { ascending: true });
  if (groupsResult.error) {
    throw new Error(`Recent benchmark run lookup failed: ${groupsResult.error.message}`);
  }
  const runGroups = (groupsResult.data ?? []) as BenchmarkMeasurementRow[];
  if (runGroups.length === 0) {
    return {
      protocolVersion: MEASUREMENT_LANE_PROTOCOL_VERSION,
      recentHours,
      runGroups: 0,
      queryRuns: 0,
      lanes: 0,
      windows: 0,
      mappingsWritten: 0,
      mappedQueryRuns: 0,
      failClosedQueryRuns: 0,
      indexedQueryRunsUpdated: 0,
    };
  }

  const runGroupIds = runGroups.map((row) => String(row['id']));
  const querySetIds = [...new Set(runGroups.map((row) => String(row['query_set_id'])))];
  const [querySets, queries, queryRuns] = await Promise.all([
    fetchByValues(client, 'benchmark_query_sets', QUERY_SET_COLUMNS, 'id', querySetIds),
    fetchByValues(client, 'benchmark_queries', QUERY_COLUMNS, 'query_set_id', querySetIds),
    fetchByValues(client, 'query_runs', QUERY_RUN_COLUMNS, 'run_group_id', runGroupIds),
  ]);
  const plan = buildBenchmarkMeasurementReconciliationPlan({
    runGroups,
    querySets,
    queries,
    queryRuns,
  });

  const laneRows = plan.lanes.map(({ fingerprint, protocol }) => ({
    fingerprint,
    protocol_version: MEASUREMENT_LANE_PROTOCOL_VERSION,
    frame_kind: protocol.frameKind,
    vertical: protocol.vertical,
    subvertical: protocol.subvertical,
    provider: protocol.provider,
    model_id: protocol.modelId,
    run_mode: protocol.runMode,
    protocol,
    review_state: Object.values(protocol).includes(UNKNOWN_PROTOCOL_VALUE)
      ? 'legacy_unknown'
      : 'verified',
  }));
  await upsertBatches(
    client,
    'intelligence_measurement_lanes',
    laneRows,
    'fingerprint',
    'Measurement lane upsert'
  );

  const laneLookupRows: BenchmarkMeasurementRow[] = [];
  for (const fingerprintBatch of batchMeasurementLaneFingerprints(
    laneRows.map((row) => row.fingerprint)
  )) {
    const result = await client
      .from('intelligence_measurement_lanes')
      .select('id,fingerprint')
      .in('fingerprint', fingerprintBatch);
    if (result.error) throw new Error(`Measurement lane lookup failed: ${result.error.message}`);
    laneLookupRows.push(...((result.data ?? []) as BenchmarkMeasurementRow[]));
  }
  const laneIds = new Map(
    laneLookupRows.map((row) => [String(row['fingerprint']), String(row['id'])])
  );
  if (laneIds.size !== plan.lanes.length) {
    throw new Error(`measurement_lane_lookup_incomplete:${laneIds.size}/${plan.lanes.length}`);
  }

  const windowRows = plan.windows.map((window) => ({
    lane_id: laneIds.get(window.fingerprint)!,
    window_key: window.windowKey,
    scheduled_for: window.scheduledFor,
    started_at: window.startedAt,
    completed_at: window.completedAt,
    expected_coverage: { query_runs: window.expected },
    observed_coverage: { query_runs: window.observed },
    quality_state: window.qualityState,
    source_schedule_key: window.sourceScheduleKey,
    metadata: {
      source_run_group_count: window.sourceRunGroupCount,
      reconciliation: 'scheduled_benchmark_post_run',
    },
  }));
  await upsertBatches(
    client,
    'intelligence_measurement_windows',
    windowRows,
    'lane_id,window_key',
    'Measurement window upsert'
  );
  const windowLookupRows = await fetchByValues(
    client,
    'intelligence_measurement_windows',
    'id,lane_id,window_key',
    'lane_id',
    [...new Set(windowRows.map((row) => row.lane_id))]
  );
  const windowIds = new Map(
    windowLookupRows.map((row) => [
      `${String(row['lane_id'])}:${String(row['window_key'])}`,
      String(row['id']),
    ])
  );

  const resolvedMappings = plan.mappings.map((mapping) => {
    const laneId = laneIds.get(mapping.fingerprint);
    const windowId = mapping.windowKey
      ? windowIds.get(`${laneId}:${mapping.windowKey}`)
      : null;
    if (!laneId || (mapping.windowKey && !windowId)) {
      throw new Error(`measurement_mapping_target_missing:${mapping.sourceKind}:${mapping.sourceId}`);
    }
    return {
      sourceKind: mapping.sourceKind,
      sourceId: mapping.sourceId,
      laneId,
      windowId,
      row: {
        source_kind: mapping.sourceKind,
        source_id: mapping.sourceId,
        lane_id: laneId,
        window_id: windowId,
        mapping_status: mapping.mappingStatus,
        mapping_reason: mapping.mappingReason,
      },
    };
  });
  await upsertBatches(
    client,
    'intelligence_measurement_run_mappings',
    resolvedMappings.map((mapping) => mapping.row),
    'source_kind,source_id',
    'Measurement run mapping upsert'
  );

  const mappedRunGroups = resolvedMappings.flatMap((mapping) =>
    mapping.sourceKind === 'benchmark_run_group' && mapping.windowId
      ? [{ sourceId: mapping.sourceId, laneId: mapping.laneId, windowId: mapping.windowId }]
      : []
  );
  const mappedQueryRuns = resolvedMappings.flatMap((mapping) =>
    mapping.sourceKind === 'benchmark_query_run' && mapping.windowId
      ? [{ sourceId: mapping.sourceId, laneId: mapping.laneId, windowId: mapping.windowId }]
      : []
  );
  await updateIndexedRuns(client, 'benchmark_run_group', mappedRunGroups);
  const indexedQueryRunsUpdated = await updateIndexedRuns(
    client,
    'benchmark_query_run',
    mappedQueryRuns
  );
  if (indexedQueryRunsUpdated !== queryRuns.length) {
    throw new Error(`benchmark_query_run_index_reconciliation_incomplete:${indexedQueryRunsUpdated}/${queryRuns.length}`);
  }

  return {
    protocolVersion: plan.protocolVersion,
    recentHours,
    runGroups: plan.runGroupCount,
    queryRuns: plan.queryRunCount,
    lanes: plan.lanes.length,
    windows: plan.windows.length,
    mappingsWritten: resolvedMappings.length,
    mappedQueryRuns: plan.mappedQueryRunCount,
    failClosedQueryRuns: plan.failClosedQueryRunCount,
    indexedQueryRunsUpdated,
  };
}

export async function reconcileBenchmarkIntelligenceAfterSweep(
  client: SupabaseLike,
  options?: BenchmarkIntelligenceReconciliationOptions
): Promise<BenchmarkIntelligenceAfterSweepResult> {
  const measurementReconciliation = await reconcileRecentBenchmarkMeasurementMappings(client, options);
  if (measurementReconciliation.failClosedQueryRuns > 0) {
    throw new Error(
      `benchmark_measurement_mapping_failed_closed:${measurementReconciliation.failClosedQueryRuns}`
    );
  }
  const quality = await client.rpc('refresh_recent_benchmark_intelligence_quality', {
    p_recent_hours: measurementReconciliation.recentHours,
  });
  if (quality.error) throw new Error(`Benchmark quality refresh failed: ${quality.error.message}`);
  const learning = await runIntelligenceLearningLoop(client as any);
  return {
    measurementReconciliation,
    qualityRefresh: quality.data,
    learning,
  };
}
