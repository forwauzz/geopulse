import type { PaymentApiEnv } from '@/lib/server/cf-env';
import { buildDistributionQueueMessage } from '@/lib/queue/distribution-job';
import { createDistributionEngineRepository } from '@/lib/server/distribution-engine-repository';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

type SupabaseLike = {
  from(table: string): any;
};

type DistributionScheduleEnvLike = Pick<
  PaymentApiEnv,
  | 'DISTRIBUTION_ENGINE_UI_ENABLED'
  | 'DISTRIBUTION_ENGINE_WRITE_ENABLED'
  | 'DISTRIBUTION_ENGINE_BACKGROUND_ENABLED'
  | 'DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT'
>;

type DistributionScheduleConfig = {
  readonly enabled: true;
  readonly batchLimit: number;
};

type DistributionScheduleDependencies = {
  readonly createRepository?: typeof createDistributionEngineRepository;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
};

export type DistributionScheduleStatus =
  | 'disabled'
  | 'skipped_ui_flag'
  | 'skipped_write_flag'
  | 'completed';

export type DistributionScheduleSummary = DispatchSummary & {
  readonly status: DistributionScheduleStatus;
  readonly batchLimit: number | null;
};

type DispatchSummary = {
  readonly scanned: number;
  readonly dispatched: number;
  readonly succeeded: number;
  readonly failed: number;
};

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseBatchLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
}

export function parseDistributionScheduleConfig(
  env: DistributionScheduleEnvLike | null | undefined
): DistributionScheduleConfig | null {
  if (!parseBoolean(env?.DISTRIBUTION_ENGINE_BACKGROUND_ENABLED)) {
    return null;
  }

  return {
    enabled: true,
    batchLimit: parseBatchLimit(env?.DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT),
  };
}

export async function runScheduledDistributionDispatch(
  supabase: SupabaseLike,
  env: PaymentApiEnv,
  deps: DistributionScheduleDependencies = {}
): Promise<DistributionScheduleSummary> {
  const config = parseDistributionScheduleConfig(env);
  if (!config) {
    return {
      status: 'disabled',
      batchLimit: null,
      scanned: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  const log = deps.structuredLog ?? structuredLog;
  const logError = deps.structuredError ?? structuredError;
  const flags = resolveDistributionEngineFlags(env);

  if (!flags.uiEnabled) {
    log(
      'distribution_job_schedule_skipped',
      {
        reason: 'ui_flag_off',
        batch_limit: config.batchLimit,
      },
      'info'
    );
    return {
      status: 'skipped_ui_flag',
      batchLimit: config.batchLimit,
      scanned: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  if (!flags.writeEnabled) {
    log(
      'distribution_job_schedule_skipped',
      {
        reason: 'write_flag_off',
        batch_limit: config.batchLimit,
      },
      'info'
    );
    return {
      status: 'skipped_write_flag',
      batchLimit: config.batchLimit,
      scanned: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  if (!env.DISTRIBUTION_QUEUE) {
    log(
      'distribution_job_schedule_skipped',
      {
        reason: 'distribution_queue_missing',
        batch_limit: config.batchLimit,
      },
      'info'
    );
    return {
      status: 'disabled',
      batchLimit: config.batchLimit,
      scanned: 0,
      dispatched: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  try {
    const repo = (deps.createRepository ?? createDistributionEngineRepository)(supabase as any);
    const jobs = await repo.listDispatchableJobs({
      limit: config.batchLimit,
    });

    log(
      'distribution_job_schedule_started',
      {
        batch_limit: config.batchLimit,
        queued_jobs: jobs.length,
      },
      'info'
    );

    for (const job of jobs) {
      await env.DISTRIBUTION_QUEUE.send(JSON.stringify(buildDistributionQueueMessage(job.id)));
    }

    log(
      'distribution_job_schedule_completed',
      {
        batch_limit: config.batchLimit,
        scanned: jobs.length,
        enqueued: jobs.length,
      },
      'info'
    );

    return {
      status: 'completed',
      batchLimit: config.batchLimit,
      scanned: jobs.length,
      dispatched: jobs.length,
      succeeded: 0,
      failed: 0,
    };
  } catch (error) {
    logError('distribution_job_schedule_failed', {
      batch_limit: config.batchLimit,
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
