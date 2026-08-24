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

export type ScheduleEnvLike = {
  readonly BENCHMARK_SCHEDULE_ENABLED?: string;
  readonly BENCHMARK_SCHEDULE_QUERY_SET_ID?: string;
  readonly BENCHMARK_SCHEDULE_MODEL_ID?: string;
  readonly BENCHMARK_SCHEDULE_RUN_MODES?: string;
  readonly BENCHMARK_SCHEDULE_VERTICAL?: string;
  readonly BENCHMARK_SCHEDULE_SEED_PRIORITIES?: string;
  readonly BENCHMARK_SCHEDULE_DOMAINS?: string;
  readonly BENCHMARK_SCHEDULE_DOMAIN_LIMIT?: string;
  readonly BENCHMARK_SCHEDULE_MAX_RUNS?: string;
  readonly BENCHMARK_SCHEDULE_MAX_FAILURES?: string;
  readonly BENCHMARK_SCHEDULE_WINDOW_HOURS?: string;
  readonly BENCHMARK_SCHEDULE_VERSION?: string;
  readonly BENCHMARK_SCHEDULE_QUERY_DELAY_MS?: string;
  readonly BENCHMARK_SCHEDULE_INCLUDE_USER_PROMPTS?: string;
};

export type ChallengerScheduleEnvLike = {
  readonly BENCHMARK_CHALLENGER_ENABLED?: string;
  readonly BENCHMARK_CHALLENGER_QUERY_SET_ID?: string;
  readonly BENCHMARK_CHALLENGER_MODEL_ID?: string;
  readonly BENCHMARK_CHALLENGER_RUN_MODES?: string;
  readonly BENCHMARK_CHALLENGER_VERTICAL?: string;
  readonly BENCHMARK_CHALLENGER_SEED_PRIORITIES?: string;
  readonly BENCHMARK_CHALLENGER_DOMAINS?: string;
  readonly BENCHMARK_CHALLENGER_DOMAIN_LIMIT?: string;
  readonly BENCHMARK_CHALLENGER_MAX_RUNS?: string;
  readonly BENCHMARK_CHALLENGER_MAX_FAILURES?: string;
  readonly BENCHMARK_CHALLENGER_WINDOW_HOURS?: string;
  readonly BENCHMARK_CHALLENGER_VERSION?: string;
  readonly BENCHMARK_CHALLENGER_QUERY_DELAY_MS?: string;
  readonly BENCHMARK_CHALLENGER_INCLUDE_USER_PROMPTS?: string;
};

/** Maps exactly one explicit challenger lane onto the existing scheduler contract. */
export function toBenchmarkChallengerScheduleEnv(
  env: ChallengerScheduleEnvLike | null | undefined,
): ScheduleEnvLike {
  const domains = normalizeText(env?.BENCHMARK_CHALLENGER_DOMAINS);
  const enabled = normalizeText(env?.BENCHMARK_CHALLENGER_ENABLED)?.toLowerCase() === 'true';
  // A challenger must name its domains. Failing closed prevents an accidental second
  // all-domain sweep from competing with the primary vertical or exceeding caps.
  const safeEnabled = enabled && Boolean(domains);
  return {
    BENCHMARK_SCHEDULE_ENABLED: safeEnabled ? 'true' : 'false',
    BENCHMARK_SCHEDULE_QUERY_SET_ID: env?.BENCHMARK_CHALLENGER_QUERY_SET_ID,
    BENCHMARK_SCHEDULE_MODEL_ID: env?.BENCHMARK_CHALLENGER_MODEL_ID,
    BENCHMARK_SCHEDULE_RUN_MODES: env?.BENCHMARK_CHALLENGER_RUN_MODES,
    BENCHMARK_SCHEDULE_VERTICAL: env?.BENCHMARK_CHALLENGER_VERTICAL,
    BENCHMARK_SCHEDULE_SEED_PRIORITIES: env?.BENCHMARK_CHALLENGER_SEED_PRIORITIES,
    BENCHMARK_SCHEDULE_DOMAINS: domains ?? undefined,
    BENCHMARK_SCHEDULE_DOMAIN_LIMIT: env?.BENCHMARK_CHALLENGER_DOMAIN_LIMIT,
    BENCHMARK_SCHEDULE_MAX_RUNS: env?.BENCHMARK_CHALLENGER_MAX_RUNS,
    BENCHMARK_SCHEDULE_MAX_FAILURES: env?.BENCHMARK_CHALLENGER_MAX_FAILURES,
    BENCHMARK_SCHEDULE_WINDOW_HOURS: env?.BENCHMARK_CHALLENGER_WINDOW_HOURS,
    BENCHMARK_SCHEDULE_VERSION: env?.BENCHMARK_CHALLENGER_VERSION,
    BENCHMARK_SCHEDULE_QUERY_DELAY_MS: env?.BENCHMARK_CHALLENGER_QUERY_DELAY_MS,
    BENCHMARK_SCHEDULE_INCLUDE_USER_PROMPTS: env?.BENCHMARK_CHALLENGER_INCLUDE_USER_PROMPTS,
  };
}

type ScheduledRunConfig = {
  readonly enabled: true;
  readonly querySetId: string;
  /** Primary model lane — kept for logs/health reports that track one lane. */
  readonly modelId: string;
  /** All model lanes the sweep iterates (BENCHMARK_SCHEDULE_MODEL_ID is comma-separable). */
  readonly modelIds: readonly string[];
  readonly runModes: readonly BenchmarkRunMode[];
  readonly vertical: string | null;
  readonly seedPriorities: readonly number[];
  readonly canonicalDomains: readonly string[];
  readonly domainLimit: number;
  readonly maxRuns: number;
  readonly maxFailures: number;
  readonly windowHours: number;
  readonly scheduleVersion: string;
  readonly queryExecutionDelayMs?: number;
  readonly includeUserPrompts?: boolean;
};

type BenchmarkScheduleRepo = ReturnType<typeof createBenchmarkRepository>;
export type BenchmarkScheduleTriggerSource = 'worker_cron' | 'manual_run_now';

export const BENCHMARK_PROMPT_VERSION = 'benchmark-prompt-v1';
export const BENCHMARK_CITATION_PARSER_VERSION = 'benchmark-citation-parser-v1';
export const BENCHMARK_METRIC_DEFINITION_VERSION = 'benchmark-metrics-v2';

export type BenchmarkScheduleSummary = {
  readonly enabled: boolean;
  readonly querySetId: string | null;
  readonly modelId: string | null;
  readonly scheduleVersion: string | null;
  readonly windowDate: string;
  readonly domainCount: number;
  readonly launchedRuns: number;
  readonly skippedExistingRuns: number;
  readonly failedRuns: number;
  readonly stoppedEarly: boolean;
};

export type BenchmarkSchedulePreview = {
  readonly enabled: true;
  readonly querySetId: string;
  readonly querySetName: string;
  readonly querySetVersion: string;
  readonly modelId: string;
  readonly modelIds: readonly string[];
  readonly scheduleVersion: string;
  readonly windowDate: string;
  readonly vertical: string | null;
  readonly seedPriorities: readonly number[];
  readonly canonicalDomains: readonly string[];
  readonly runModes: readonly BenchmarkRunMode[];
  readonly domainLimit: number;
  readonly maxRuns: number;
  readonly maxFailures: number;
  readonly windowHours: number;
  readonly domains: readonly Pick<BenchmarkDomainRow, 'id' | 'canonical_domain' | 'site_url' | 'vertical'>[];
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

function parseNonNegativeInt(raw: string | null, fallback = 0): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 5_000);
}

function parsePositiveIntList(raw: string | null): number[] {
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
}

function parseTextList(raw: string | null): string[] {
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    )
  );
}

function parseWindowHours(raw: string | null): number {
  const parsed = parsePositiveInt(raw, 24);
  if (24 % parsed !== 0) return 24;
  return Math.min(parsed, 24);
}

function slugifyLabelPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'na';
}

export function toBenchmarkScheduleWindowDate(now: Date, windowHours = 24): string {
  const date = now.toISOString().slice(0, 10);
  if (windowHours >= 24) {
    return date;
  }

  const slotHour = Math.floor(now.getUTCHours() / windowHours) * windowHours;
  return `${date}T${String(slotHour).padStart(2, '0')}`;
}

export function parseBenchmarkScheduleConfig(
  env: ScheduleEnvLike | null | undefined
): ScheduledRunConfig | null {
  const enabled = normalizeText(env?.BENCHMARK_SCHEDULE_ENABLED)?.toLowerCase() === 'true';
  if (!enabled) return null;

  const querySetId = normalizeText(env?.BENCHMARK_SCHEDULE_QUERY_SET_ID);
  const rawModelIds = normalizeText(env?.BENCHMARK_SCHEDULE_MODEL_ID);
  const modelIds = Array.from(
    new Set(
      (rawModelIds ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  const modelId = modelIds[0];
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
    modelIds,
    runModes: uniqueRunModes,
    vertical: normalizeText(env?.BENCHMARK_SCHEDULE_VERTICAL),
    seedPriorities: parsePositiveIntList(normalizeText(env?.BENCHMARK_SCHEDULE_SEED_PRIORITIES)),
    canonicalDomains: parseTextList(normalizeText(env?.BENCHMARK_SCHEDULE_DOMAINS)),
    domainLimit: parsePositiveInt(normalizeText(env?.BENCHMARK_SCHEDULE_DOMAIN_LIMIT), 20),
    maxRuns: parsePositiveInt(normalizeText(env?.BENCHMARK_SCHEDULE_MAX_RUNS), 40),
    maxFailures: parsePositiveInt(normalizeText(env?.BENCHMARK_SCHEDULE_MAX_FAILURES), 5),
    windowHours: parseWindowHours(normalizeText(env?.BENCHMARK_SCHEDULE_WINDOW_HOURS)),
    scheduleVersion: normalizeText(env?.BENCHMARK_SCHEDULE_VERSION) ?? 'v1',
    queryExecutionDelayMs: parseNonNegativeInt(
      normalizeText(env?.BENCHMARK_SCHEDULE_QUERY_DELAY_MS)
    ),
    includeUserPrompts:
      normalizeText(env?.BENCHMARK_SCHEDULE_INCLUDE_USER_PROMPTS)?.toLowerCase() !== 'false',
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

export async function previewBenchmarkScheduleSweep(args: {
  readonly repo: Pick<
    BenchmarkScheduleRepo,
    'getQuerySetById' | 'listDomainsForBenchmarkScheduling'
  >;
  readonly config: ScheduledRunConfig;
  readonly now?: Date;
}): Promise<BenchmarkSchedulePreview> {
  const windowDate = toBenchmarkScheduleWindowDate(
    args.now ?? new Date(),
    args.config.windowHours
  );
  const querySet = await args.repo.getQuerySetById(args.config.querySetId);
  if (!querySet) {
    throw new Error(`Scheduled benchmark query set not found: ${args.config.querySetId}`);
  }

  const domains = await args.repo.listDomainsForBenchmarkScheduling({
    limit: args.config.domainLimit,
    vertical: args.config.vertical,
    seedPriorities: args.config.seedPriorities,
    canonicalDomains: args.config.canonicalDomains,
    requireScheduleEnabled:
      args.config.seedPriorities.length > 0 ||
      !!args.config.vertical ||
      args.config.canonicalDomains.length > 0,
  });

  return {
    enabled: true,
    querySetId: querySet.id,
    querySetName: querySet.name,
    querySetVersion: querySet.version,
    modelId: args.config.modelId,
    modelIds: args.config.modelIds,
    scheduleVersion: args.config.scheduleVersion,
    windowDate,
    vertical: args.config.vertical,
    seedPriorities: args.config.seedPriorities,
    canonicalDomains: args.config.canonicalDomains,
    runModes: args.config.runModes,
    domainLimit: args.config.domainLimit,
    maxRuns: args.config.maxRuns,
    maxFailures: args.config.maxFailures,
    windowHours: args.config.windowHours,
    domains: domains.map((domain) => ({
      id: domain.id,
      canonical_domain: domain.canonical_domain,
      site_url: domain.site_url,
      vertical: domain.vertical,
    })),
  };
}

export async function executeBenchmarkScheduleSweep(args: {
  readonly repo: Pick<
    BenchmarkScheduleRepo,
    'getQuerySetById' | 'listDomainsForBenchmarkScheduling' | 'getRunGroupByScheduleKey'
  > &
    Partial<Pick<BenchmarkScheduleRepo, 'getQuerySetByName'>>;
  readonly runBenchmarkGroup: typeof runBenchmarkGroupSkeleton;
  readonly supabase: unknown;
  readonly adapter: BenchmarkExecutionAdapter;
  readonly config: ScheduledRunConfig;
  readonly now?: Date;
  readonly triggerSource?: BenchmarkScheduleTriggerSource;
}): Promise<BenchmarkScheduleSummary> {
  const windowDate = toBenchmarkScheduleWindowDate(
    args.now ?? new Date(),
    args.config.windowHours
  );
  const querySet = await args.repo.getQuerySetById(args.config.querySetId);
  if (!querySet) {
    throw new Error(`Scheduled benchmark query set not found: ${args.config.querySetId}`);
  }

  const domains = await args.repo.listDomainsForBenchmarkScheduling({
    limit: args.config.domainLimit,
    vertical: args.config.vertical,
    seedPriorities: args.config.seedPriorities,
    canonicalDomains: args.config.canonicalDomains,
    requireScheduleEnabled:
      args.config.seedPriorities.length > 0 ||
      !!args.config.vertical ||
      args.config.canonicalDomains.length > 0,
  });
  let launchedRuns = 0;
  let skippedExistingRuns = 0;
  let failedRuns = 0;
  let stoppedEarly = false;

  structuredLog('benchmark_schedule_started', {
    query_set_id: args.config.querySetId,
    model_id: args.config.modelId,
    model_ids: args.config.modelIds.join(','),
    run_mode_count: args.config.runModes.length,
    vertical: args.config.vertical,
    seed_priorities: args.config.seedPriorities.join(','),
    schedule_domains: args.config.canonicalDomains.join(','),
    domain_count: domains.length,
    max_runs: args.config.maxRuns,
    max_failures: args.config.maxFailures,
    window_hours: args.config.windowHours,
    schedule_version: args.config.scheduleVersion,
  });

  const querySetCache = new Map<string, typeof querySet>([[querySet.id, querySet]]);

  outer: for (const domain of domains) {
    // A domain can carry its own question set (metadata.schedule_query_set_id) — e.g. an MSP
    // domain runs MSP buyer questions while the law-firm lane keeps its own. Falls back to the
    // schedule's configured set. On top of that, the domain's user-added prompts ride the same
    // sweep, so "add a prompt" needs no extra scheduling machinery.
    let primarySet = querySet;
    const ownSetId = (domain.metadata as Record<string, unknown> | null)?.['schedule_query_set_id'];
    if (typeof ownSetId === 'string' && ownSetId) {
      try {
        const cached = querySetCache.get(ownSetId) ?? (await args.repo.getQuerySetById(ownSetId));
        if (cached) {
          querySetCache.set(ownSetId, cached);
          primarySet = cached;
        }
      } catch {
        /* fall back to the configured set */
      }
    }
    const domainQuerySets = [primarySet];
    if (args.config.includeUserPrompts !== false && args.repo.getQuerySetByName) {
      try {
        const userSet = await args.repo.getQuerySetByName(
          `user-prompts-${domain.canonical_domain.toLowerCase().replace(/^www\./, '')}`
        );
        if (userSet) domainQuerySets.push(userSet);
      } catch {
        /* user prompts are additive — never fail the sweep over them */
      }
    }

    for (const domainQuerySet of domainQuerySets)
    for (const runMode of args.config.runModes) {
      for (const modelId of args.config.modelIds) {
        if (launchedRuns >= args.config.maxRuns) {
          stoppedEarly = true;
          structuredLog('benchmark_schedule_cap_reached', {
            query_set_id: args.config.querySetId,
            model_id: modelId,
            launched_runs: launchedRuns,
            max_runs: args.config.maxRuns,
            window_hours: args.config.windowHours,
            schedule_version: args.config.scheduleVersion,
            schedule_domains: args.config.canonicalDomains.join(','),
          });
          break outer;
        }

        if (failedRuns >= args.config.maxFailures) {
          stoppedEarly = true;
          structuredError('benchmark_schedule_failure_cap_reached', {
            query_set_id: args.config.querySetId,
            model_id: modelId,
            failed_runs: failedRuns,
            max_failures: args.config.maxFailures,
            window_hours: args.config.windowHours,
            schedule_version: args.config.scheduleVersion,
            schedule_domains: args.config.canonicalDomains.join(','),
          });
          break outer;
        }

        const scheduleRunKey = buildBenchmarkScheduleRunKey({
          windowDate,
          scheduleVersion: args.config.scheduleVersion,
          domainId: domain.id,
          querySetId: domainQuerySet.id,
          modelId,
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
          querySet: domainQuerySet,
          modelId,
          runMode,
        });

        try {
          const querySetMetadata = (domainQuerySet.metadata ?? {}) as Record<string, unknown>;
          const methodologyVersion = typeof querySetMetadata['methodology_version'] === 'string'
            ? querySetMetadata['methodology_version']
            : `query-set-${domainQuerySet.version}`;
          const scheduleSubvertical = typeof querySetMetadata['target_subcohort'] === 'string'
            ? querySetMetadata['target_subcohort']
            : 'not_applicable';
          const result = await args.runBenchmarkGroup(
            args.supabase,
            {
              domainId: domain.id,
              querySetId: domainQuerySet.id,
              modelId,
              runMode,
              runLabel,
              runScope: 'scheduled_internal_benchmark',
              notes: `Scheduled benchmark sweep (${windowDate})`,
              runMetadata: {
                trigger_source: args.triggerSource ?? 'worker_cron',
                schedule_version: args.config.scheduleVersion,
                schedule_window_utc: windowDate,
                schedule_window_hours: args.config.windowHours,
                schedule_vertical: args.config.vertical,
                schedule_seed_priorities: args.config.seedPriorities,
                schedule_domains: args.config.canonicalDomains,
                schedule_run_key: scheduleRunKey,
                schedule_query_set_name: domainQuerySet.name,
                schedule_query_set_version: domainQuerySet.version,
                schedule_subvertical: scheduleSubvertical,
                cohort_definition_version: methodologyVersion,
                model_snapshot: modelId,
                prompt_version: BENCHMARK_PROMPT_VERSION,
                citation_parser_version: BENCHMARK_CITATION_PARSER_VERSION,
                metric_definition_version: BENCHMARK_METRIC_DEFINITION_VERSION,
                query_execution_delay_ms: args.config.queryExecutionDelayMs ?? 0,
              },
            },
            args.adapter
          );
          launchedRuns += 1;
          if (result.completedQueryCount === 0 && result.failedQueryCount > 0) {
            failedRuns += 1;
            structuredError('benchmark_schedule_persisted_group_failed', {
              domain_id: domain.id,
              canonical_domain: domain.canonical_domain,
              query_set_id: domainQuerySet.id,
              model_id: modelId,
              run_mode: runMode,
              failed_query_count: result.failedQueryCount,
              skipped_query_count: result.skippedQueryCount,
              terminal_provider_failure_code: result.terminalProviderFailureCode,
              schedule_version: args.config.scheduleVersion,
              schedule_window_utc: windowDate,
            });
            if (result.terminalProviderFailureCode) {
              stoppedEarly = true;
              structuredError('benchmark_schedule_terminal_provider_failure', {
                domain_id: domain.id,
                canonical_domain: domain.canonical_domain,
                query_set_id: domainQuerySet.id,
                model_id: modelId,
                run_mode: runMode,
                terminal_provider_failure_code: result.terminalProviderFailureCode,
                launched_runs: launchedRuns,
                failed_runs: failedRuns,
                schedule_version: args.config.scheduleVersion,
                schedule_window_utc: windowDate,
              });
              break outer;
            }
          }
        } catch (error) {
          failedRuns += 1;
          structuredError('benchmark_schedule_run_failed', {
            domain_id: domain.id,
            canonical_domain: domain.canonical_domain,
            query_set_id: domainQuerySet.id,
            model_id: modelId,
            run_mode: runMode,
            schedule_version: args.config.scheduleVersion,
            schedule_window_utc: windowDate,
            error: error instanceof Error ? error.message : 'unknown',
            schedule_domains: args.config.canonicalDomains.join(','),
          });
        }
      }
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
    failedRuns,
    stoppedEarly,
  } as const;

  structuredLog(
    summary.failedRuns > 0 || summary.stoppedEarly
      ? 'benchmark_schedule_completed_with_warnings'
      : 'benchmark_schedule_completed',
    {
      query_set_id: summary.querySetId,
      model_id: summary.modelId,
      domain_count: summary.domainCount,
      launched_runs: summary.launchedRuns,
      skipped_existing_runs: summary.skippedExistingRuns,
      failed_runs: summary.failedRuns,
      stopped_early: summary.stoppedEarly,
      window_hours: args.config.windowHours,
      vertical: args.config.vertical,
      seed_priorities: args.config.seedPriorities.join(','),
      schedule_domains: args.config.canonicalDomains.join(','),
      schedule_version: summary.scheduleVersion,
    }
  );

  return summary;
}

export async function runScheduledBenchmarkSweep(args: {
  readonly supabase: unknown;
  readonly env: ScheduleEnvLike;
  readonly adapter?: BenchmarkExecutionAdapter;
  readonly now?: Date;
  readonly triggerSource?: BenchmarkScheduleTriggerSource;
}): Promise<BenchmarkScheduleSummary> {
  const config = parseBenchmarkScheduleConfig(args.env);
  const windowDate = toBenchmarkScheduleWindowDate(
    args.now ?? new Date(),
    config?.windowHours ?? 24
  );
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
      failedRuns: 0,
      stoppedEarly: false,
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
      triggerSource: args.triggerSource,
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
