import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  MEASUREMENT_LANE_PROTOCOL_VERSION,
  NOT_APPLICABLE_PROTOCOL_VALUE,
  UNKNOWN_PROTOCOL_VALUE,
  aggregateMeasurementWindowCoverage,
  inferProvider,
  measurementLaneFingerprint,
  normalizeMeasurementWindowTimestamp,
  type MeasurementFrameKind,
  type MeasurementLaneProtocol,
} from '../lib/intelligence/measurement-lane';

const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 25;
const APPLY_CONFIRMATION = '--confirm=INT-003';
type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function fetchAll(client: Client, table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function text(row: Row, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadata(row: Row): Record<string, unknown> {
  const value = row['metadata'];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function metadataText(row: Row, field: string): string | null {
  const value = metadata(row)[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function inferFrame(run: Row, querySet: Row | undefined): MeasurementFrameKind {
  const name = text(querySet ?? {}, 'name')?.toLowerCase() ?? '';
  const vertical = text(querySet ?? {}, 'vertical')?.toLowerCase() ?? '';
  if (text(run, 'startup_workspace_id')) return 'startup_pilot';
  if (name.includes('business counsel') || name.includes('business_counsel')) return 'business_counsel';
  if (metadataText(querySet ?? {}, 'frame_kind') === 'user_prompt') return 'user_prompt';
  if (vertical || name.includes('law')) return 'broad_vertical';
  if (metadataText(run, 'domain_id')) return 'domain_specific';
  return 'legacy_unknown';
}

function protocolForRun(run: Row, querySet: Row | undefined): MeasurementLaneProtocol {
  const modelId = text(run, 'model_set_version') ?? metadataText(run, 'model_id') ?? UNKNOWN_PROTOCOL_VALUE;
  const runMode = metadataText(run, 'run_mode') ?? UNKNOWN_PROTOCOL_VALUE;
  const groundingMethod =
    runMode === 'grounded_site'
      ? metadataText(run, 'grounding_context_source') ?? UNKNOWN_PROTOCOL_VALUE
      : runMode === UNKNOWN_PROTOCOL_VALUE
        ? UNKNOWN_PROTOCOL_VALUE
        : NOT_APPLICABLE_PROTOCOL_VALUE;
  const frameKind = inferFrame(run, querySet);
  const cadenceHours = metadata(run)['schedule_window_hours'];
  return {
    frameKind,
    vertical: text(querySet ?? {}, 'vertical') ?? metadataText(run, 'schedule_vertical') ?? UNKNOWN_PROTOCOL_VALUE,
    subvertical: metadataText(querySet ?? {}, 'subvertical') ?? (
      frameKind === 'business_counsel' ? 'business_counsel' : UNKNOWN_PROTOCOL_VALUE
    ),
    cohortDefinitionVersion: metadataText(run, 'cohort_definition_version') ?? UNKNOWN_PROTOCOL_VALUE,
    querySetId: text(run, 'query_set_id') ?? UNKNOWN_PROTOCOL_VALUE,
    querySetVersion: text(querySet ?? {}, 'version') ?? metadataText(run, 'schedule_query_set_version') ?? UNKNOWN_PROTOCOL_VALUE,
    provider: inferProvider(modelId),
    modelId,
    modelSnapshot: metadataText(run, 'model_snapshot') ?? modelId,
    runMode,
    groundingMethod,
    scannerVersion: NOT_APPLICABLE_PROTOCOL_VALUE,
    checkCatalogVersion: NOT_APPLICABLE_PROTOCOL_VALUE,
    promptVersion: metadataText(run, 'prompt_version') ?? UNKNOWN_PROTOCOL_VALUE,
    citationParserVersion: metadataText(run, 'citation_parser_version') ?? UNKNOWN_PROTOCOL_VALUE,
    scheduleVersion: metadataText(run, 'schedule_version') ?? (
      text(run, 'run_scope') === 'scheduled_internal_benchmark'
        ? UNKNOWN_PROTOCOL_VALUE
        : NOT_APPLICABLE_PROTOCOL_VALUE
    ),
    cadence: typeof cadenceHours === 'number' || typeof cadenceHours === 'string'
      ? `${String(cadenceHours)}h`
      : text(run, 'run_scope') === 'scheduled_internal_benchmark'
        ? UNKNOWN_PROTOCOL_VALUE
        : NOT_APPLICABLE_PROTOCOL_VALUE,
    metricDefinitionVersion: metadataText(run, 'metric_definition_version') ?? UNKNOWN_PROTOCOL_VALUE,
  };
}

function qualityState(run: Row, observed: number, expected: number): string {
  const status = text(run, 'status');
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'running' || status === 'queued') return 'running';
  if (expected > 0 && observed >= expected) return 'complete';
  if (observed > 0) return 'partial';
  return 'unknown';
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) {
    throw new Error(`Apply requires ${APPLY_CONFIRMATION}.`);
  }

  const client = createServiceRoleClient(url, key);
  const [runGroups, querySets, queries, queryRuns, cohorts] = await Promise.all([
    fetchAll(client, 'benchmark_run_groups', 'id,query_set_id,run_scope,model_set_version,status,metadata,startup_workspace_id,agency_account_id,started_at,completed_at,created_at'),
    fetchAll(client, 'benchmark_query_sets', 'id,name,vertical,version,metadata'),
    fetchAll(client, 'benchmark_queries', 'id,query_set_id'),
    fetchAll(client, 'query_runs', 'id,run_group_id,status'),
    fetchAll(client, 'benchmark_cohorts', 'id,name,query_set_id,model_id,run_mode,vertical,benchmark_window_label,metadata'),
  ]);
  const querySetsById = new Map(querySets.map((row) => [String(row['id']), row]));
  const expectedBySet = new Map<string, number>();
  for (const query of queries) {
    const querySetId = String(query['query_set_id']);
    expectedBySet.set(querySetId, (expectedBySet.get(querySetId) ?? 0) + 1);
  }
  const observedByGroup = new Map<string, number>();
  for (const run of queryRuns) {
    const groupId = String(run['run_group_id']);
    observedByGroup.set(groupId, (observedByGroup.get(groupId) ?? 0) + 1);
  }

  const plans = runGroups.map((run) => {
    const querySet = querySetsById.get(String(run['query_set_id']));
    const protocol = protocolForRun(run, querySet);
    const fingerprint = measurementLaneFingerprint(protocol);
    const expected = expectedBySet.get(String(run['query_set_id'])) ?? 0;
    const observed = observedByGroup.get(String(run['id'])) ?? 0;
    const windowKey =
      metadataText(run, 'schedule_window_utc') ??
      text(run, 'created_at')?.slice(0, 13) ??
      `legacy:${String(run['id'])}`;
    return {
      sourceKind: 'benchmark_run_group',
      sourceId: String(run['id']),
      fingerprint,
      protocol,
      windowKey,
      scheduledFor: normalizeMeasurementWindowTimestamp(
        metadataText(run, 'schedule_window_utc')
      ),
      startedAt: text(run, 'started_at'),
      completedAt: text(run, 'completed_at'),
      expected,
      observed,
      qualityState: qualityState(run, observed, expected),
      sourceScheduleKey: metadataText(run, 'schedule_run_key'),
    };
  });

  const cohortPlans = cohorts.map((cohort) => {
    const querySet = querySetsById.get(String(cohort['query_set_id']));
    const syntheticRun: Row = {
      query_set_id: cohort['query_set_id'],
      model_set_version: cohort['model_id'],
      run_scope: 'cohort_definition',
      metadata: {
        ...metadata(cohort),
        run_mode: cohort['run_mode'],
        cohort_definition_version: metadataText(cohort, 'cohort_definition_version') ?? UNKNOWN_PROTOCOL_VALUE,
      },
    };
    const protocol = protocolForRun(syntheticRun, querySet);
    return {
      sourceKind: 'benchmark_cohort',
      sourceId: String(cohort['id']),
      fingerprint: measurementLaneFingerprint(protocol),
      protocol,
    };
  });

  const laneMap = new Map(plans.map((plan) => [plan.fingerprint, plan.protocol]));
  for (const plan of cohortPlans) laneMap.set(plan.fingerprint, plan.protocol);
  const unknownLaneCount = [...laneMap.values()].filter((protocol) =>
    Object.values(protocol).includes(UNKNOWN_PROTOCOL_VALUE)
  ).length;
  const comparableRunCount = plans.filter((plan) =>
    !Object.values(plan.protocol).includes(UNKNOWN_PROTOCOL_VALUE) &&
    plan.qualityState === 'complete'
  ).length;
  const summary = {
    mode: apply ? 'apply' : 'preview',
    protocolVersion: MEASUREMENT_LANE_PROTOCOL_VERSION,
    runGroups: plans.length,
    cohorts: cohortPlans.length,
    lanes: laneMap.size,
    legacyOrUnknownLanes: unknownLaneCount,
    comparableCompleteRuns: comparableRunCount,
    qualityStates: plans.reduce<Record<string, number>>((result, plan) => {
      result[plan.qualityState] = (result[plan.qualityState] ?? 0) + 1;
      return result;
    }, {}),
    frames: plans.reduce<Record<string, number>>((result, plan) => {
      result[plan.protocol.frameKind] = (result[plan.protocol.frameKind] ?? 0) + 1;
      return result;
    }, {}),
    providers: plans.reduce<Record<string, number>>((result, plan) => {
      result[plan.protocol.provider] = (result[plan.protocol.provider] ?? 0) + 1;
      return result;
    }, {}),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;

  const laneRows = [...laneMap.entries()].map(([fingerprint, protocol]) => ({
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
  for (let offset = 0; offset < laneRows.length; offset += WRITE_BATCH_SIZE) {
    const laneUpsert = await client.from('intelligence_measurement_lanes').upsert(
      laneRows.slice(offset, offset + WRITE_BATCH_SIZE),
      { onConflict: 'fingerprint' }
    );
    if (laneUpsert.error) {
      throw new Error(`Lane upsert failed at row ${offset}: ${laneUpsert.error.message}`);
    }
  }
  const laneResult = await client
    .from('intelligence_measurement_lanes')
    .select('id,fingerprint')
    .in('fingerprint', laneRows.map((row) => row.fingerprint));
  if (laneResult.error) throw new Error(`Lane lookup failed: ${laneResult.error.message}`);
  const laneIds = new Map(
    ((laneResult.data ?? []) as unknown as Row[]).map((row) => [String(row['fingerprint']), String(row['id'])])
  );

  const plansByWindow = new Map<string, typeof plans>();
  for (const plan of plans) {
    const key = `${laneIds.get(plan.fingerprint)!}:${plan.windowKey}`;
    plansByWindow.set(key, [...(plansByWindow.get(key) ?? []), plan]);
  }
  const windowRows = [...plansByWindow.entries()].map(([key, groupedPlans]) => {
    const first = groupedPlans[0]!;
    const coverage = aggregateMeasurementWindowCoverage(groupedPlans);
    const started = groupedPlans.flatMap((plan) => plan.startedAt ? [plan.startedAt] : []).sort();
    const completed = groupedPlans.flatMap((plan) => plan.completedAt ? [plan.completedAt] : []).sort();
    return {
      lane_id: laneIds.get(first.fingerprint)!,
      window_key: first.windowKey,
      scheduled_for: groupedPlans.find((plan) => plan.scheduledFor)?.scheduledFor ?? null,
      started_at: started[0] ?? null,
      completed_at: completed.at(-1) ?? null,
      expected_coverage: { query_runs: coverage.expected },
      observed_coverage: { query_runs: coverage.observed },
      quality_state: coverage.qualityState,
      source_schedule_key: groupedPlans.find((plan) => plan.sourceScheduleKey)?.sourceScheduleKey ?? null,
      metadata: { source_run_group_count: groupedPlans.length, aggregate_key: key },
    };
  });
  for (let offset = 0; offset < windowRows.length; offset += WRITE_BATCH_SIZE) {
    const result = await client.from('intelligence_measurement_windows').upsert(
      windowRows.slice(offset, offset + WRITE_BATCH_SIZE),
      { onConflict: 'lane_id,window_key' }
    );
    if (result.error) {
      throw new Error(`Window upsert failed at row ${offset}: ${result.error.message}`);
    }
  }
  const windowResult = await fetchAll(
    client,
    'intelligence_measurement_windows',
    'id,lane_id,window_key'
  );
  const windowIds = new Map(
    windowResult.map((row) => [`${String(row['lane_id'])}:${String(row['window_key'])}`, String(row['id'])])
  );
  const mappingRows = [
    ...plans.map((plan) => ({
      source_kind: plan.sourceKind,
      source_id: plan.sourceId,
      lane_id: laneIds.get(plan.fingerprint)!,
      window_id: windowIds.get(`${laneIds.get(plan.fingerprint)!}:${plan.windowKey}`) ?? null,
      mapping_status: Object.values(plan.protocol).includes(UNKNOWN_PROTOCOL_VALUE)
        ? 'legacy_unknown'
        : 'mapped',
      mapping_reason: Object.values(plan.protocol).includes(UNKNOWN_PROTOCOL_VALUE)
        ? 'one_or_more_protocol_versions_unknown'
        : null,
    })),
    ...cohortPlans.map((plan) => ({
      source_kind: plan.sourceKind,
      source_id: plan.sourceId,
      lane_id: laneIds.get(plan.fingerprint)!,
      window_id: null,
      mapping_status: Object.values(plan.protocol).includes(UNKNOWN_PROTOCOL_VALUE)
        ? 'legacy_unknown'
        : 'mapped',
      mapping_reason: Object.values(plan.protocol).includes(UNKNOWN_PROTOCOL_VALUE)
        ? 'one_or_more_protocol_versions_unknown'
        : null,
    })),
  ];
  for (let offset = 0; offset < mappingRows.length; offset += WRITE_BATCH_SIZE) {
    const result = await client.from('intelligence_measurement_run_mappings').upsert(
      mappingRows.slice(offset, offset + WRITE_BATCH_SIZE),
      { onConflict: 'source_kind,source_id' }
    );
    if (result.error) {
      throw new Error(`Lane mapping upsert failed at row ${offset}: ${result.error.message}`);
    }
  }
  console.log('Measurement lane/window backfill applied idempotently.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
