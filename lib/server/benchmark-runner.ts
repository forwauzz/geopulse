import { parseBenchmarkCitations } from './benchmark-citations';
import {
  createBenchmarkExecutionAdapter,
  getBenchmarkExecutionAdapterMode,
  type BenchmarkExecutionAdapter,
} from './benchmark-execution';
import { computeBenchmarkMetrics } from './benchmark-metrics';
import { createBenchmarkRepository } from './benchmark-repository';
import {
  parseBenchmarkRunnerInput,
  type BenchmarkRunnerInput,
} from './benchmark-runner-contract';
import { structuredLog } from './structured-log';

type BenchmarkRunnerResult = {
  readonly runGroupId: string;
  readonly queryRunCount: number;
  readonly skippedQueryCount: number;
};

function buildDefaultRunLabel(input: BenchmarkRunnerInput): string {
  return `benchmark-${input.modelId}-${new Date().toISOString()}`;
}

export async function runBenchmarkGroupSkeleton(
  supabase: any,
  rawInput: unknown,
  adapter: BenchmarkExecutionAdapter = createBenchmarkExecutionAdapter()
): Promise<BenchmarkRunnerResult> {
  const input = parseBenchmarkRunnerInput(rawInput);
  const repo = createBenchmarkRepository(supabase);

  const domain = await repo.getDomainById(input.domainId);
  if (!domain) {
    throw new Error(`Benchmark domain not found: ${input.domainId}`);
  }

  const querySet = await repo.getQuerySetById(input.querySetId);
  if (!querySet) {
    throw new Error(`Benchmark query set not found: ${input.querySetId}`);
  }

  const queries = await repo.getQueriesForQuerySet(querySet.id);
  if (queries.length === 0) {
    throw new Error(`Benchmark query set has no queries: ${querySet.id}`);
  }

  if (queries.length > 20) {
    throw new Error(`Benchmark query set exceeds v1 limit of 20 queries: ${queries.length}`);
  }

  const startedAt = new Date().toISOString();
  const runLabel = input.runLabel?.trim() || buildDefaultRunLabel(input);
  const executionMode = getBenchmarkExecutionAdapterMode(adapter);

  structuredLog('benchmark_run_group_started', {
    domain_id: input.domainId,
    query_set_id: input.querySetId,
    query_count: queries.length,
    model_id: input.modelId,
  });

  const runGroup = await repo.createRunGroup({
    querySetId: querySet.id,
    label: runLabel,
    modelSetVersion: input.modelId,
    runScope: 'internal_benchmark',
    notes: input.notes ?? null,
    status: 'running',
    startedAt,
    metadata: {
      execution_mode: executionMode,
      model_id: input.modelId,
      auditor_model_id: input.auditorModelId ?? null,
      domain_id: input.domainId,
    },
  });

  const executionContext = {
    domainId: domain.id,
    canonicalDomain: domain.canonical_domain,
    siteUrl: domain.site_url,
    modelId: input.modelId,
    auditorModelId: input.auditorModelId ?? null,
    runGroupId: runGroup.id,
  };

  const executionResults = await Promise.all(
    queries.map(async (query) => ({
      query,
      execution: await adapter.executeQuery(query, executionContext),
    }))
  );

  const queryRuns = await repo.insertQueryRuns(
    executionResults.map(({ query, execution }) => ({
      runGroupId: runGroup.id,
      domainId: domain.id,
      queryId: query.id,
      modelId: input.modelId,
      auditorModelId: input.auditorModelId ?? null,
      status:
        execution.status === 'not_implemented' ? ('skipped' as const) : execution.status,
      responseText: execution.responseText,
      responseMetadata: execution.responseMetadata,
      errorMessage: execution.errorMessage,
      executedAt: execution.executedAt,
    }))
  );

  const skippedQueryCount = executionResults.filter(
    ({ execution }) => execution.status === 'not_implemented' || execution.status === 'skipped'
  ).length;
  const completedQueryCount = executionResults.filter(
    ({ execution }) => execution.status === 'completed'
  ).length;
  const failedQueryCount = executionResults.filter(
    ({ execution }) => execution.status === 'failed'
  ).length;

  const queryRunIdByQueryId = new Map(queryRuns.map((row) => [row.query_id, row.id] as const));
  const citationRows = executionResults.flatMap(({ query, execution }) => {
    if (execution.status !== 'completed' || !execution.responseText) return [];
    const queryRunId = queryRunIdByQueryId.get(query.id);
    if (!queryRunId) return [];

    return parseBenchmarkCitations(execution.responseText, domain).map((citation) => ({
      queryRunId,
      citedDomain: citation.citedDomain,
      citedUrl: citation.citedUrl,
      rankPosition: citation.rankPosition,
      citationType: citation.citationType,
      confidence: citation.confidence,
      metadata: citation.metadata,
    }));
  });

  const storedCitations = await repo.insertQueryCitations(citationRows);
  const computedMetrics = computeBenchmarkMetrics({
    scheduledRuns: queries.length,
    queryRuns,
    citations: storedCitations,
    measuredCanonicalDomain: domain.canonical_domain,
  });

  await repo.insertDomainMetric({
    runGroupId: runGroup.id,
    domainId: domain.id,
    modelId: input.modelId,
    citationRate: computedMetrics.citationRate,
    shareOfVoice: computedMetrics.shareOfVoice,
    queryCoverage: computedMetrics.queryCoverage,
    driftScore: null,
    inferenceProbability: null,
    metrics: {
      execution_mode: executionMode,
      total_queries: queries.length,
      ...computedMetrics.metrics,
    },
    computedAt: new Date().toISOString(),
  });

  const finalRunStatus =
    completedQueryCount === 0 && failedQueryCount > 0 && skippedQueryCount === 0
      ? 'failed'
      : 'completed';

  await repo.updateRunGroup(runGroup.id, {
    status: finalRunStatus,
    completedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    metadata: {
      ...(runGroup.metadata ?? {}),
      execution_mode: executionMode,
      query_run_count: queryRuns.length,
      completed_query_count: completedQueryCount,
      failed_query_count: failedQueryCount,
      skipped_query_count: skippedQueryCount,
      citation_count: storedCitations.length,
    },
  });

  structuredLog('benchmark_run_group_completed', {
    run_group_id: runGroup.id,
    query_run_count: queryRuns.length,
    failed_query_count: failedQueryCount,
    skipped_query_count: skippedQueryCount,
    citation_count: storedCitations.length,
    model_id: input.modelId,
  });

  return {
    runGroupId: runGroup.id,
    queryRunCount: queryRuns.length,
    skippedQueryCount: skippedQueryCount,
  };
}
