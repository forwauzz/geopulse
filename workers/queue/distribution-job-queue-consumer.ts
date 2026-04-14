import { parseDistributionQueueMessage } from '../../lib/queue/distribution-job';
import {
  dispatchDistributionJobById,
  isRetryableDistributionDispatchError,
} from '../../lib/server/distribution-job-dispatcher';
import { createDistributionEngineRepository } from '../../lib/server/distribution-engine-repository';
import { structuredLog } from '../../lib/server/structured-log';
import { createServiceRoleClient } from '../../lib/supabase/service-role';

type QueueMessage = {
  readonly body: string | ArrayBuffer | Uint8Array;
  ack(): void;
  retry(): void;
};

export type DistributionQueueBatch = {
  readonly queue: string;
  readonly messages: readonly QueueMessage[];
};

const DISTRIBUTION_DLQ_NAME = 'geo-pulse-distribution-dlq';

function bodyToString(body: string | ArrayBuffer | Uint8Array): string {
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  return new TextDecoder().decode(body);
}

async function processDistributionQueueMessage(rawBody: string, env: CloudflareEnv): Promise<void> {
  const job = parseDistributionQueueMessage(rawBody);
  if (!job) {
    structuredLog('distribution_queue_invalid_payload', { rawLen: String(rawBody.length) });
    return;
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('distribution_queue_supabase_not_configured');
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await dispatchDistributionJobById(supabase as any, env as any, job.distributionJobId);
}

async function handleDistributionDlqMessage(rawBody: string, env: CloudflareEnv): Promise<void> {
  const job = parseDistributionQueueMessage(rawBody);
  if (!job) {
    structuredLog('distribution_queue_dlq_invalid_payload', { rawLen: String(rawBody.length) });
    return;
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('distribution_queue_supabase_not_configured');
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const repo = createDistributionEngineRepository(supabase as any);
  const distributionJob = await repo.getJobById(job.distributionJobId);

  if (!distributionJob) {
    structuredLog('distribution_queue_dlq_job_not_found', {
      distribution_job_id: job.distributionJobId,
    });
    return;
  }

  const attempts = await repo.listJobAttempts(distributionJob.id);
  const message = 'Distribution job moved to DLQ after queue retries were exhausted.';

  await repo.createJobAttempt({
    distributionJobId: distributionJob.id,
    attemptNumber: attempts.length + 1,
    requestSummary: {
      job_id: distributionJob.job_id,
      publish_mode: distributionJob.publish_mode,
      source: 'distribution_dlq',
    },
    responseSummary: {},
    providerStatusCode: null,
    errorMessage: message,
  });

  await repo.updateJob(distributionJob.id, {
    status: 'failed',
    lastError: message,
    completedAt: new Date().toISOString(),
  });

  structuredLog('distribution_queue_dlq_marked_failed', {
    distribution_job_id: distributionJob.id,
    job_id: distributionJob.job_id,
  });
}

export async function dispatchDistributionQueueBatch(
  batch: DistributionQueueBatch,
  env: CloudflareEnv
): Promise<void> {
  if (batch.queue === DISTRIBUTION_DLQ_NAME) {
    for (const message of batch.messages) {
      try {
        await handleDistributionDlqMessage(bodyToString(message.body), env);
        message.ack();
      } catch (error) {
        structuredLog('distribution_queue_dlq_handler_failed', {
          message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        });
        message.retry();
      }
    }
    return;
  }

  for (const message of batch.messages) {
    try {
      await processDistributionQueueMessage(bodyToString(message.body), env);
      message.ack();
    } catch (error) {
      structuredLog(
        isRetryableDistributionDispatchError(error)
          ? 'distribution_queue_job_deferred'
          : 'distribution_queue_job_failed_permanently',
        {
          message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        }
      );
      if (isRetryableDistributionDispatchError(error)) {
        message.ack();
      } else {
        message.ack();
      }
    }
  }
}
