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
} from './measurement-lane';

export type BenchmarkMeasurementRow = Record<string, unknown>;

export type BenchmarkMeasurementReconciliationInput = {
  readonly runGroups: readonly BenchmarkMeasurementRow[];
  readonly querySets: readonly BenchmarkMeasurementRow[];
  readonly queries: readonly BenchmarkMeasurementRow[];
  readonly queryRuns: readonly BenchmarkMeasurementRow[];
  readonly cohorts?: readonly BenchmarkMeasurementRow[];
};

export type BenchmarkMeasurementLanePlan = {
  readonly fingerprint: string;
  readonly protocol: MeasurementLaneProtocol;
};

export type BenchmarkMeasurementWindowPlan = {
  readonly fingerprint: string;
  readonly windowKey: string;
  readonly scheduledFor: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expected: number;
  readonly observed: number;
  readonly qualityState: string;
  readonly sourceScheduleKey: string | null;
  readonly sourceRunGroupCount: number;
};

export type BenchmarkMeasurementMappingPlan = {
  readonly sourceKind: 'benchmark_run_group' | 'benchmark_query_run' | 'benchmark_cohort';
  readonly sourceId: string;
  readonly fingerprint: string;
  readonly windowKey: string | null;
  readonly mappingStatus: 'mapped' | 'legacy_unknown';
  readonly mappingReason: string | null;
};

export type BenchmarkMeasurementReconciliationPlan = {
  readonly protocolVersion: typeof MEASUREMENT_LANE_PROTOCOL_VERSION;
  readonly lanes: readonly BenchmarkMeasurementLanePlan[];
  readonly windows: readonly BenchmarkMeasurementWindowPlan[];
  readonly mappings: readonly BenchmarkMeasurementMappingPlan[];
  readonly runGroupCount: number;
  readonly queryRunCount: number;
  readonly cohortCount: number;
  readonly mappedQueryRunCount: number;
  readonly failClosedQueryRunCount: number;
  readonly qualityStates: Readonly<Record<string, number>>;
};

function text(row: BenchmarkMeasurementRow, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadata(row: BenchmarkMeasurementRow): Record<string, unknown> {
  const value = row['metadata'];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function metadataText(row: BenchmarkMeasurementRow, field: string): string | null {
  const value = metadata(row)[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function inferFrame(
  run: BenchmarkMeasurementRow,
  querySet: BenchmarkMeasurementRow | undefined
): MeasurementFrameKind {
  const name = text(querySet ?? {}, 'name')?.toLowerCase() ?? '';
  const vertical = text(querySet ?? {}, 'vertical')?.toLowerCase() ?? '';
  if (text(run, 'startup_workspace_id')) return 'startup_pilot';
  if (name.includes('business counsel') || name.includes('business_counsel')) return 'business_counsel';
  if (metadataText(querySet ?? {}, 'frame_kind') === 'user_prompt') return 'user_prompt';
  if (vertical || name.includes('law')) return 'broad_vertical';
  if (metadataText(run, 'domain_id')) return 'domain_specific';
  return 'legacy_unknown';
}

export function benchmarkMeasurementProtocolForRun(
  run: BenchmarkMeasurementRow,
  querySet: BenchmarkMeasurementRow | undefined
): MeasurementLaneProtocol {
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
    subvertical:
      metadataText(querySet ?? {}, 'subvertical') ??
      metadataText(querySet ?? {}, 'target_subcohort') ??
      metadataText(run, 'schedule_subvertical') ??
      (frameKind === 'business_counsel' ? 'business_counsel' : NOT_APPLICABLE_PROTOCOL_VALUE),
    cohortDefinitionVersion:
      metadataText(run, 'cohort_definition_version') ??
      metadataText(querySet ?? {}, 'methodology_version') ??
      UNKNOWN_PROTOCOL_VALUE,
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

function runQualityState(run: BenchmarkMeasurementRow, observed: number, expected: number): string {
  const status = text(run, 'status');
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'running' || status === 'queued') return 'running';
  if (expected > 0 && observed >= expected) return 'complete';
  if (observed > 0) return 'partial';
  return 'unknown';
}

function mappingState(protocol: MeasurementLaneProtocol): {
  mappingStatus: 'mapped' | 'legacy_unknown';
  mappingReason: string | null;
} {
  const unknown = Object.values(protocol).includes(UNKNOWN_PROTOCOL_VALUE);
  return {
    mappingStatus: unknown ? 'legacy_unknown' : 'mapped',
    mappingReason: unknown ? 'one_or_more_protocol_versions_unknown' : null,
  };
}

export function buildBenchmarkMeasurementReconciliationPlan(
  input: BenchmarkMeasurementReconciliationInput
): BenchmarkMeasurementReconciliationPlan {
  const querySetsById = new Map(input.querySets.map((row) => [String(row['id']), row]));
  const expectedBySet = new Map<string, number>();
  for (const query of input.queries) {
    const querySetId = String(query['query_set_id']);
    expectedBySet.set(querySetId, (expectedBySet.get(querySetId) ?? 0) + 1);
  }
  const queryRunsByGroup = new Map<string, BenchmarkMeasurementRow[]>();
  for (const run of input.queryRuns) {
    const groupId = String(run['run_group_id']);
    queryRunsByGroup.set(groupId, [...(queryRunsByGroup.get(groupId) ?? []), run]);
  }

  const groupPlans = input.runGroups.map((run) => {
    const querySet = querySetsById.get(String(run['query_set_id']));
    const protocol = benchmarkMeasurementProtocolForRun(run, querySet);
    const fingerprint = measurementLaneFingerprint(protocol);
    const expected = expectedBySet.get(String(run['query_set_id'])) ?? 0;
    const queryRuns = queryRunsByGroup.get(String(run['id'])) ?? [];
    const observed = queryRuns.length;
    const windowKey =
      metadataText(run, 'schedule_window_utc') ??
      text(run, 'created_at')?.slice(0, 13) ??
      `legacy:${String(run['id'])}`;
    return {
      sourceId: String(run['id']),
      fingerprint,
      protocol,
      windowKey,
      scheduledFor: normalizeMeasurementWindowTimestamp(metadataText(run, 'schedule_window_utc')),
      startedAt: text(run, 'started_at'),
      completedAt: text(run, 'completed_at'),
      expected,
      observed,
      qualityState: runQualityState(run, observed, expected),
      sourceScheduleKey: metadataText(run, 'schedule_run_key'),
      queryRuns,
    };
  });

  const cohortPlans = (input.cohorts ?? []).map((cohort) => {
    const querySet = querySetsById.get(String(cohort['query_set_id']));
    const syntheticRun: BenchmarkMeasurementRow = {
      query_set_id: cohort['query_set_id'],
      model_set_version: cohort['model_id'],
      run_scope: 'cohort_definition',
      metadata: {
        ...metadata(cohort),
        run_mode: cohort['run_mode'],
        cohort_definition_version: metadataText(cohort, 'cohort_definition_version') ?? UNKNOWN_PROTOCOL_VALUE,
      },
    };
    const protocol = benchmarkMeasurementProtocolForRun(syntheticRun, querySet);
    return {
      sourceId: String(cohort['id']),
      fingerprint: measurementLaneFingerprint(protocol),
      protocol,
    };
  });

  const laneMap = new Map<string, MeasurementLaneProtocol>();
  for (const plan of groupPlans) laneMap.set(plan.fingerprint, plan.protocol);
  for (const plan of cohortPlans) laneMap.set(plan.fingerprint, plan.protocol);

  const plansByWindow = new Map<string, typeof groupPlans>();
  for (const plan of groupPlans) {
    const key = `${plan.fingerprint}:${plan.windowKey}`;
    plansByWindow.set(key, [...(plansByWindow.get(key) ?? []), plan]);
  }
  const windows = [...plansByWindow.values()].map((groupedPlans) => {
    const first = groupedPlans[0]!;
    const coverage = aggregateMeasurementWindowCoverage(groupedPlans);
    const started = groupedPlans.flatMap((plan) => plan.startedAt ? [plan.startedAt] : []).sort();
    const completed = groupedPlans.flatMap((plan) => plan.completedAt ? [plan.completedAt] : []).sort();
    return {
      fingerprint: first.fingerprint,
      windowKey: first.windowKey,
      scheduledFor: groupedPlans.find((plan) => plan.scheduledFor)?.scheduledFor ?? null,
      startedAt: started[0] ?? null,
      completedAt: completed.at(-1) ?? null,
      expected: coverage.expected,
      observed: coverage.observed,
      qualityState: coverage.qualityState,
      sourceScheduleKey: groupedPlans.find((plan) => plan.sourceScheduleKey)?.sourceScheduleKey ?? null,
      sourceRunGroupCount: groupedPlans.length,
    };
  });

  const mappings: BenchmarkMeasurementMappingPlan[] = [];
  for (const plan of groupPlans) {
    const state = mappingState(plan.protocol);
    mappings.push({
      sourceKind: 'benchmark_run_group',
      sourceId: plan.sourceId,
      fingerprint: plan.fingerprint,
      windowKey: plan.windowKey,
      ...state,
    });
    for (const queryRun of plan.queryRuns) {
      mappings.push({
        sourceKind: 'benchmark_query_run',
        sourceId: String(queryRun['id']),
        fingerprint: plan.fingerprint,
        windowKey: plan.windowKey,
        ...state,
      });
    }
  }
  for (const plan of cohortPlans) {
    mappings.push({
      sourceKind: 'benchmark_cohort',
      sourceId: plan.sourceId,
      fingerprint: plan.fingerprint,
      windowKey: null,
      ...mappingState(plan.protocol),
    });
  }

  const queryRunMappings = mappings.filter((mapping) => mapping.sourceKind === 'benchmark_query_run');
  return {
    protocolVersion: MEASUREMENT_LANE_PROTOCOL_VERSION,
    lanes: [...laneMap.entries()].map(([fingerprint, protocol]) => ({ fingerprint, protocol })),
    windows,
    mappings,
    runGroupCount: groupPlans.length,
    queryRunCount: input.queryRuns.length,
    cohortCount: cohortPlans.length,
    mappedQueryRunCount: queryRunMappings.filter((mapping) => mapping.mappingStatus === 'mapped').length,
    failClosedQueryRunCount: queryRunMappings.filter((mapping) => mapping.mappingStatus !== 'mapped').length,
    qualityStates: groupPlans.reduce<Record<string, number>>((result, plan) => {
      result[plan.qualityState] = (result[plan.qualityState] ?? 0) + 1;
      return result;
    }, {}),
  };
}
