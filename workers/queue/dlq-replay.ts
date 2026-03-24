import type { ReportQueueMessageV1 } from '../../lib/queue/report-job';
import { structuredLog } from '../../lib/server/structured-log';

const DLQ_REPLAY_KV_PREFIX = 'report:dlq-replay:';
const DLQ_REPLAY_TTL_SEC = 60 * 60 * 24 * 7;

type DlqReplayEnv = {
  SCAN_QUEUE: Queue;
  SCAN_CACHE: KVNamespace;
};

/**
 * After max_retries on the main queue, one guarded replay to the primary queue.
 * KV ensures we do not loop forever if the job is poisoned.
 */
export async function replayReportJobFromDlq(job: ReportQueueMessageV1, env: DlqReplayEnv): Promise<void> {
  const kvKey = `${DLQ_REPLAY_KV_PREFIX}${job.paymentId}`;
  const already = await env.SCAN_CACHE.get(kvKey);
  if (already) {
    structuredLog('dlq_replay_suppressed_already_replayed', {
      scanId: job.scanId,
      paymentId: job.paymentId,
    });
    return;
  }

  await env.SCAN_QUEUE.send(JSON.stringify(job));
  await env.SCAN_CACHE.put(kvKey, '1', { expirationTtl: DLQ_REPLAY_TTL_SEC });
  structuredLog('dlq_replayed_to_main_queue', {
    scanId: job.scanId,
    paymentId: job.paymentId,
  });
}
