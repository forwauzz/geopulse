import { parseCompetitorCitations } from './benchmark-citations';
import {
  createBenchmarkExecutionAdapter,
  type BenchmarkExecutionAdapter,
} from './benchmark-execution';
import {
  enforceGeoPerformanceLimits,
  type ResolvedGeoPerformanceEntitlement,
} from './geo-performance-entitlements';
import { createBenchmarkRepository, type ClientBenchmarkConfigRow } from './benchmark-repository';
import { runBenchmarkGroupSkeleton } from './benchmark-runner';
import { storeGpmReport, type GpmReportStoreEnvLike, type GpmR2BucketLike } from './geo-performance-report-store';
import { structuredError, structuredLog } from './structured-log';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GpmPlatformModelMap = {
  readonly chatgpt: string;
  readonly gemini: string;
  readonly perplexity: string;
};

export type GpmRunSummary = {
  readonly configId: string;
  readonly windowDate: string;
  readonly entitlementBlocked: boolean;
  readonly skippedMissingConfig: boolean;
  readonly platformResults: readonly {
    readonly platform: string;
    readonly status: 'launched' | 'skipped_existing' | 'failed';
    readonly runGroupId: string | null;
  }[];
};

export type GpmSweepSummary = {
  readonly windowDate: string;
  readonly configCount: number;
  readonly launchedRuns: number;
  readonly skippedRuns: number;
  readonly failedRuns: number;
  readonly blockedConfigs: number;
};

// ── Window date helpers ───────────────────────────────────────────────────────

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function padWeek(n: number): string {
  return String(n).padStart(2, '0');
}

export function resolveGpmWindowDate(
  cadence: 'monthly' | 'biweekly' | 'weekly',
  now: Date
): string {
  if (cadence === 'monthly') {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  const { year, week } = getISOWeek(now);

  if (cadence === 'weekly') {
    return `${year}-W${padWeek(week)}`;
  }

  // biweekly: round down to the start of the current 2-week block
  // week 1→1, week 2→1, week 3→3, week 4→3, ...
  const biweekStart = Math.floor((week - 1) / 2) * 2 + 1;
  return `${year}-W${padWeek(biweekStart)}`;
}

export function buildGpmRunKey(
  configId: string,
  platform: string,
  windowDate: string
): string {
  return `gpm:${configId}:${platform}:${windowDate}`;
}

// ── Competitor co-citation post-processing ────────────────────────────────────

async function persistCompetitorCitations(args: {
  readonly supabase: any;
  readonly runGroupId: string;
  readonly config: ClientBenchmarkConfigRow;
  readonly measuredCanonicalDomain: string;
}): Promise<number> {
  if (args.config.competitor_list.length === 0) return 0;

  const { data: queryRuns, error } = await args.supabase
    .from('query_runs')
    .select('id,response_text,status')
    .eq('run_group_id', args.runGroupId)
    .eq('status', 'completed');

  if (error || !queryRuns?.length) return 0;

  const repo = createBenchmarkRepository(args.supabase);
  let insertedCount = 0;

  for (const run of queryRuns as Array<{ id: string; response_text: string | null; status: string }>) {
    if (!run.response_text) continue;

    const competitorCitations = parseCompetitorCitations(
      run.response_text,
      args.config.competitor_list,
      args.measuredCanonicalDomain
    );

    if (competitorCitations.length === 0) continue;

    await repo.insertQueryCitations(
      competitorCitations.map((c) => ({
        queryRunId: run.id,
        citedDomain: c.citedDomain,
        citedUrl: c.citedUrl,
        rankPosition: c.rankPosition,
        citationType: c.citationType,
        confidence: c.confidence,
        metadata: c.metadata ?? {},
      }))
    );
    insertedCount += competitorCitations.length;
  }

  return insertedCount;
}

// ── Single-config run ─────────────────────────────────────────────────────────

export async function executeGpmClientRun(args: {
  readonly supabase: any;
  readonly config: ClientBenchmarkConfigRow;
  readonly entitlement: ResolvedGeoPerformanceEntitlement;
  readonly platformModelMap: GpmPlatformModelMap;
  readonly adapter: BenchmarkExecutionAdapter;
  readonly now?: Date;
  readonly triggerSource?: string;
  readonly reportEnv?: GpmReportStoreEnvLike;
  readonly reportBucket?: GpmR2BucketLike;
}): Promise<GpmRunSummary> {
  const now = args.now ?? new Date();
  const cadence = args.config.cadence;
  const windowDate = resolveGpmWindowDate(cadence, now);
  const repo = createBenchmarkRepository(args.supabase);

  // Guard: require query_set_id before running
  if (!args.config.query_set_id) {
    structuredLog('gpm_client_run_skipped_no_query_set', {
      config_id: args.config.id,
      window_date: windowDate,
    });
    return {
      configId: args.config.id,
      windowDate,
      entitlementBlocked: false,
      skippedMissingConfig: true,
      platformResults: [],
    };
  }

  // Entitlement gate
  const enforcement = enforceGeoPerformanceLimits(args.entitlement, {
    cadence,
    platformsEnabled: args.config.platforms_enabled,
    promptCount: 0, // prompt count gating is admin-controlled at config time
  });

  if (!enforcement.allowed) {
    structuredLog('gpm_client_run_blocked', {
      config_id: args.config.id,
      window_date: windowDate,
      violations: enforcement.violations.join('; '),
    });
    return {
      configId: args.config.id,
      windowDate,
      entitlementBlocked: true,
      skippedMissingConfig: false,
      platformResults: [],
    };
  }

  const domain = await repo.getDomainById(args.config.benchmark_domain_id);
  if (!domain) {
    throw new Error(`GPM domain not found: ${args.config.benchmark_domain_id}`);
  }

  const platformResults: GpmRunSummary['platformResults'][number][] = [];

  for (const platform of args.config.platforms_enabled) {
    const modelId = args.platformModelMap[platform as keyof GpmPlatformModelMap];
    if (!modelId) {
      structuredLog('gpm_platform_skipped_no_model', {
        config_id: args.config.id,
        platform,
        window_date: windowDate,
      });
      continue;
    }

    const runKey = buildGpmRunKey(args.config.id, platform, windowDate);
    const existing = await repo.getRunGroupByScheduleKey(runKey);
    if (existing) {
      platformResults.push({ platform, status: 'skipped_existing', runGroupId: existing.id });
      continue;
    }

    try {
      const result = await runBenchmarkGroupSkeleton(
        args.supabase,
        {
          domainId: args.config.benchmark_domain_id,
          querySetId: args.config.query_set_id,
          modelId,
          runScope: 'gpm_client_run',
          runLabel: `gpm-${windowDate}-${domain.canonical_domain}-${platform}`.slice(0, 160),
          notes: `GEO Performance run (${windowDate}) — ${platform}`,
          startupWorkspaceId: args.config.startup_workspace_id ?? undefined,
          agencyAccountId: args.config.agency_account_id ?? undefined,
          runMetadata: {
            gpm_config_id: args.config.id,
            gpm_platform: platform,
            gpm_cadence: cadence,
            gpm_window_date: windowDate,
            gpm_topic: args.config.topic,
            gpm_location: args.config.location,
            trigger_source: args.triggerSource ?? 'worker_cron',
            schedule_run_key: runKey, // reuses getRunGroupByScheduleKey lookup
          },
        },
        args.adapter
      );

      await persistCompetitorCitations({
        supabase: args.supabase,
        runGroupId: result.runGroupId,
        config: args.config,
        measuredCanonicalDomain: domain.canonical_domain,
      });

      // Generate + store PDF report (non-fatal — run is already recorded)
      if (args.reportEnv) {
        try {
          await storeGpmReport({
            supabase: args.supabase,
            config: args.config,
            runGroupId: result.runGroupId,
            platform,
            windowDate,
            measuredCanonicalDomain: domain.canonical_domain,
            bucket: args.reportBucket,
            env: args.reportEnv,
          });
        } catch (reportErr) {
          structuredError('gpm_report_store_failed', {
            config_id: args.config.id,
            run_group_id: result.runGroupId,
            platform,
            error: reportErr instanceof Error ? reportErr.message : 'unknown',
          });
        }
      }

      structuredLog('gpm_client_run_launched', {
        config_id: args.config.id,
        platform,
        model_id: modelId,
        run_group_id: result.runGroupId,
        window_date: windowDate,
      });

      platformResults.push({ platform, status: 'launched', runGroupId: result.runGroupId });
    } catch (error) {
      structuredError('gpm_client_run_failed', {
        config_id: args.config.id,
        platform,
        model_id: modelId,
        window_date: windowDate,
        error: error instanceof Error ? error.message : 'unknown',
      });
      platformResults.push({ platform, status: 'failed', runGroupId: null });
    }
  }

  return {
    configId: args.config.id,
    windowDate,
    entitlementBlocked: false,
    skippedMissingConfig: false,
    platformResults,
  };
}

// ── Full sweep ────────────────────────────────────────────────────────────────

export type GpmScheduleEnvLike = {
  readonly GPM_SCHEDULE_ENABLED?: string;
  readonly GPM_CHATGPT_MODEL_ID?: string;
  readonly GPM_GEMINI_MODEL_ID?: string;
  readonly GPM_PERPLEXITY_MODEL_ID?: string;
  // Report generation
  readonly ANTHROPIC_API_KEY?: string;
  readonly GPM_NARRATIVE_MODEL?: string;
  readonly GPM_REPORT_R2_PUBLIC_BASE?: string;
};

export function resolveGpmPlatformModelMap(env: GpmScheduleEnvLike): GpmPlatformModelMap {
  return {
    chatgpt: env.GPM_CHATGPT_MODEL_ID?.trim() || 'gpt-4o-mini',
    gemini: env.GPM_GEMINI_MODEL_ID?.trim() || 'gemini-2.0-flash',
    perplexity: env.GPM_PERPLEXITY_MODEL_ID?.trim() || 'llama-3.1-sonar-small-128k-online',
  };
}

export async function runGpmScheduledSweep(args: {
  readonly supabase: any;
  readonly env: GpmScheduleEnvLike;
  readonly entitlementsByConfigId: ReadonlyMap<string, ResolvedGeoPerformanceEntitlement>;
  readonly adapter?: BenchmarkExecutionAdapter;
  readonly now?: Date;
  readonly triggerSource?: string;
  readonly reportBucket?: GpmR2BucketLike;
}): Promise<GpmSweepSummary> {
  const enabled = args.env.GPM_SCHEDULE_ENABLED?.trim().toLowerCase() === 'true';
  const now = args.now ?? new Date();

  // Use first config's cadence for the window date in the summary — actual window is per-config
  const windowDate = resolveGpmWindowDate('monthly', now);

  if (!enabled) {
    structuredLog('gpm_sweep_disabled', { window_date: windowDate });
    return {
      windowDate,
      configCount: 0,
      launchedRuns: 0,
      skippedRuns: 0,
      failedRuns: 0,
      blockedConfigs: 0,
    };
  }

  const { data: configs, error } = await args.supabase
    .from('client_benchmark_configs')
    .select(
      'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
    )
    .order('created_at', { ascending: true });

  if (error) throw error;

  const allConfigs = (configs ?? []) as ClientBenchmarkConfigRow[];
  const platformModelMap = resolveGpmPlatformModelMap(args.env);
  const adapter = args.adapter ?? createBenchmarkExecutionAdapter(args.env as any);

  let launchedRuns = 0;
  let skippedRuns = 0;
  let failedRuns = 0;
  let blockedConfigs = 0;

  structuredLog('gpm_sweep_started', {
    config_count: allConfigs.length,
    window_date: windowDate,
  });

  for (const config of allConfigs) {
    const entitlement = args.entitlementsByConfigId.get(config.id) ?? {
      enabled: false,
      tier: null,
      maxPromptsPerRun: null,
      allowedCadences: [] as const,
      deliverySurfaces: [] as const,
      platformsAllowed: [] as const,
      source: 'service_default',
    };

    try {
      const summary = await executeGpmClientRun({
        supabase: args.supabase,
        config,
        entitlement,
        platformModelMap,
        adapter,
        now,
        triggerSource: args.triggerSource,
        reportEnv: args.env,
        reportBucket: args.reportBucket,
      });

      if (summary.entitlementBlocked) {
        blockedConfigs += 1;
        continue;
      }

      for (const p of summary.platformResults) {
        if (p.status === 'launched') launchedRuns += 1;
        else if (p.status === 'skipped_existing') skippedRuns += 1;
        else if (p.status === 'failed') failedRuns += 1;
      }
    } catch (error) {
      failedRuns += 1;
      structuredError('gpm_sweep_config_failed', {
        config_id: config.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  const summary = {
    windowDate,
    configCount: allConfigs.length,
    launchedRuns,
    skippedRuns,
    failedRuns,
    blockedConfigs,
  };

  structuredLog(
    failedRuns > 0 ? 'gpm_sweep_completed_with_errors' : 'gpm_sweep_completed',
    summary
  );

  return summary;
}
