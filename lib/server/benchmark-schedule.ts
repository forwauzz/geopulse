import { createBenchmarkExecutionAdapter, type BenchmarkExecutionAdapter } from './benchmark-execution';
import {
  DEFAULT_BENCHMARK_RUN_MODE,
  benchmarkRunModeSchema,
  type BenchmarkRunMode,
} from './benchmark-grounding';
import {
  createBenchmarkRepository,
  type BenchmarkDomainRow,
  type BenchmarkQuerySetRow,
} from './benchmark-repository';
import { runBenchmarkGroupSkeleton } from './benchmark-runner';
import { structuredError, structuredLog } from './structured-log';

type ScheduleEnvLike = {
  readonly BENCHMARK_SCHEDULE_ENABLED?: string;
  readonly BENCHMARK_SCHEDULE_QUERY_SET_ID?: string;
  readonly BENCHMARK_SCHEDULE_MODEL_ID?: string;
  readonly BENCHMARK_SCHEDULE_RUN_MODES?: string;
  readonly BENCHMARK_SCHEDULE_DOMAIN_LIMIT?: string;
  readonly BENCHMARK_SCHEDULE_VERSION?: string;
};

type ScheduledRunConfig = {
  readonly enabled: true;
  readonly querySetId: string;
  readonly modelId: string;
  readonly runModes: readonly BenchmarkRunMode[];
  readonly domainLimit: number;
  readonly scheduleVersion: string;
};

type BenchmarkScheduleRepo = ReturnType<typeof createBenchmarkRepository>;

export type BenchmarkScheduleSummary = {
  readonly enabled: boolean;
  readonly querySetId: string | null;
  readonly modelId: string | null;
  readonly scheduleVersion: string | null;
  readonly windowDate: string;
  readonly domainCount: number;
  readonly launchedRuns: number;
  readonly skippedExistingRuns: number;
};

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function slugifyLabelPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'na';
}

export function toBenchmarkScheduleWindowDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function parseBenchmarkScheduleConfig(
  env: ScheduleEnvLike | null | undefined
): ScheduledRunConfig | null {
  const enabled = normalizeText(env?.BENCHMARK_SCHEDULE_ENABLED)?.toLowerCase() === 'true';
  if (!enabled) return null;

  const querySetId = normalizeText(env?.BENCHMARK_SCHEDULE_QUERY_SET_ID);
  const modelId = normalizeText(env?.BENCHMARK_SCHEDULE_MODEL_ID);
  if (!querySetId || !modelId) return null;

  const rawRunModes =
    normalizeText(env?.BENCHMARK_SCHEDULE_RUN_MODES) ?? DEFAULT_BENCHMARK_RUN_MODE;
  const parsedRunModes = rawRunModes
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => benchmarkRunModeSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);

  const uniqueRunModes = Array.from(new Set(parsedRunModes));
  if (uniqueRunModes.length === 0) {
    uniqueRunModes.push(DEFAULT_BENCHMARK_RUN_MODE);
  }

  return {
    enabled: true,
    querySetId,
    modelId,
    runModes: uniqueRunModes,
    domainLimit: parsePositiveInt(normalizeText(env?.BENCHMARK_SCHEDULE_DOMAIN_LIMIT), 20),
    scheduleVersion: normalizeText(env?.BENCHMARK_SCHEDULE_VERSION) ?? 'v1',
  };
}

export function buildBenchmarkScheduleRunKey(args: {
  readonly windowDate: string;
  readonly scheduleVersion: string;
  readonly domainId: string;
  readonly querySetId: string;
  readonly modelId: string;
  readonly runMode: BenchmarkRunMode;
}): string {
  return [
    'benchmark-schedule',
    args.scheduleVersion,
    args.windowDate,
    args.domainId,
    args.querySetId,
    args.modelId,
    args.runMode,
  ].join(':');
}

export function buildScheduledBenchmarkRunLabel(args: {
  readonly windowDate: string;
  readonly domain: BenchmarkDomainRow;
  readonly querySet: BenchmarkQuerySetRow;
  readonly modelId: string;
  readonly runMode: BenchmarkRunMode;
}): string {
  const parts = [
    'scheduled',
    args.windowDate,
    slugifyLabelPart(args.domain.canonical_domain),
    slugifyLabelPart(args.querySet.name),
    slugifyLabelPart(args.querySet.version),
    slugifyLabelPart(args.runMode),
    slugifyLabelPart(args.modelId),
  ];
  const label = parts.join('-');
  return label.slice(0, 160);
}

export async function executeBenchmarkScheduleSweep(args: {
  readonly repo: Pick<
    BenchmarkScheduleRepo,
    'getQuerySetById' | 'listCustomerDomainsForBenchmarkScheduling' | 'getRunGroupByScheduleKey'
  >;
  readonly runBenchmarkGroup: typeof runBenchmarkGroupSkeleton;
  readonly supabase: unknown;
  readonly adapter: BenchmarkExecutionAdapter;
  readonly config: ScheduledRunConfig;
  readonly now?: Date;
}): Promise<BenchmarkScheduleSummary> {
  const windowDate = toBenchmarkScheduleWindowDate(args.now ?? new Date());
  const querySet = await args.repo.getQuerySetById(args.config.querySetId);
  if (!querySet) {
    throw new Error(`Scheduled benchmark query set not found: ${args.config.querySetId}`);
  }

  const domains = await args.repo.listCustomerDomainsForBenchmarkScheduling(args.config.domainLimit);
  let launchedRuns = 0;
  let skippedExistingRuns = 0;

  structuredLog('benchmark_schedule_started', {
    query_set_id: args.config.querySetId,
    model_id: args.config.modelId,
    run_mode_count: args.config.runModes.length,
    domain_count: domains.length,
    schedule_version: args.config.scheduleVersion,
  });

  for (const domain of domains) {
    for (const runMode of args.config.runModes) {
      const scheduleRunKey = buildBenchmarkScheduleRunKey({
        windowDate,
        scheduleVersion: args.config.scheduleVersion,
        domainId: domain.id,
        querySetId: querySet.id,
        modelId: args.config.modelId,
        runMode,
      });
      const existing = await args.repo.getRunGroupByScheduleKey(scheduleRunKey);
      if (existing) {
        skippedExistingRuns += 1;
        continue;
      }

      const runLabel = buildScheduledBenchmarkRunLabel({
        windowDate,
        domain,
        querySet,
        modelId: args.config.modelId,
        runMode,
      });

      await args.runBenchmarkGroup(
        args.supabase,
        {
          domainId: domain.id,
          querySetId: querySet.id,
          modelId: args.config.modelId,
          runMode,
          runLabel,
          runScope: 'scheduled_internal_benchmark',
          notes: `Scheduled benchmark sweep (${windowDate})`,
          runMetadata: {
            trigger_source: 'worker_cron',
            schedule_version: args.config.scheduleVersion,
            schedule_window_utc: windowDate,
            schedule_run_key: scheduleRunKey,
            schedule_query_set_name: querySet.name,
            schedule_query_set_version: querySet.version,
          },
        },
        args.adapter
      );
      launchedRuns += 1;
    }
  }

  const summary = {
    enabled: true,
    querySetId: args.config.querySetId,
    modelId: args.config.modelId,
    scheduleVersion: args.config.scheduleVersion,
    windowDate,
    domainCount: domains.length,
    launchedRuns,
    skippedExistingRuns,
  } as const;

  structuredLog('benchmark_schedule_completed', {
    query_set_id: summary.querySetId,
    model_id: summary.modelId,
    domain_count: summary.domainCount,
    launched_runs: summary.launchedRuns,
    skipped_existing_runs: summary.skippedExistingRuns,
    schedule_version: summary.scheduleVersion,
  });

  return summary;
}

export async function runScheduledBenchmarkSweep(args: {
  readonly supabase: unknown;
  readonly env: ScheduleEnvLike;
  readonly adapter?: BenchmarkExecutionAdapter;
  readonly now?: Date;
}): Promise<BenchmarkScheduleSummary> {
  const config = parseBenchmarkScheduleConfig(args.env);
  const windowDate = toBenchmarkScheduleWindowDate(args.now ?? new Date());
  if (!config) {
    return {
      enabled: false,
      querySetId: null,
      modelId: null,
      scheduleVersion: null,
      windowDate,
      domainCount: 0,
      launchedRuns: 0,
      skippedExistingRuns: 0,
    };
  }

  try {
    return await executeBenchmarkScheduleSweep({
      repo: createBenchmarkRepository(args.supabase as any),
      runBenchmarkGroup: runBenchmarkGroupSkeleton,
      supabase: args.supabase,
      adapter: args.adapter ?? createBenchmarkExecutionAdapter(args.env as any),
      config,
      now: args.now,
    });
  } catch (error) {
    structuredError('benchmark_schedule_failed', {
      query_set_id: config.querySetId,
      model_id: config.modelId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
