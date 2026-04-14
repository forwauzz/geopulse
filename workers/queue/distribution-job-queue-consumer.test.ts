import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDistributionQueueBatch } from './distribution-job-queue-consumer';

vi.mock('../../lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('../../lib/server/distribution-job-dispatcher', () => ({
  dispatchDistributionJobById: vi.fn(),
  isRetryableDistributionDispatchError: vi.fn((error: unknown) => {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'retryable' in error &&
        (error as { retryable?: boolean }).retryable
    );
  }),
}));

vi.mock('../../lib/server/distribution-engine-repository', () => ({
  createDistributionEngineRepository: vi.fn(),
}));

describe('dispatchDistributionQueueBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acks valid messages after dispatch', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const { dispatchDistributionJobById } = await import('../../lib/server/distribution-job-dispatcher');

    await dispatchDistributionQueueBatch(
      {
        queue: 'geo-pulse-distribution-queue',
        messages: [
          {
            body: JSON.stringify({ v: 1, distributionJobId: 'job-row-1' }),
            ack,
            retry,
          },
        ],
      },
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      } as any
    );

    expect(dispatchDistributionJobById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
      'job-row-1'
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('acks invalid payloads without retrying', async () => {
    const ack = vi.fn();
    const retry = vi.fn();

    await dispatchDistributionQueueBatch(
      {
        queue: 'geo-pulse-distribution-queue',
        messages: [
          {
            body: '{"nope":true}',
            ack,
            retry,
          },
        ],
      },
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      } as any
    );

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('acks retryable provider failures (deferred by scheduler) and acks permanent failures', async () => {
    const retryableAck = vi.fn();
    const retryableRetry = vi.fn();
    const permanentAck = vi.fn();
    const permanentRetry = vi.fn();
    const { dispatchDistributionJobById } = await import('../../lib/server/distribution-job-dispatcher');
    const { ContentDestinationPublishError } = await import('../../lib/server/content-destination-adapters');

    vi.mocked(dispatchDistributionJobById)
      .mockRejectedValueOnce(
        new ContentDestinationPublishError({
          message: 'Kit publish failed (429): rate limited',
          providerName: 'kit',
          statusCode: 429,
          retryable: true,
        })
      )
      .mockRejectedValueOnce(
        new ContentDestinationPublishError({
          message: 'KIT_API_KEY is missing.',
          providerName: 'kit',
          retryable: false,
        })
      );

    await dispatchDistributionQueueBatch(
      {
        queue: 'geo-pulse-distribution-queue',
        messages: [
          {
            body: JSON.stringify({ v: 1, distributionJobId: 'job-row-retry' }),
            ack: retryableAck,
            retry: retryableRetry,
          },
          {
            body: JSON.stringify({ v: 1, distributionJobId: 'job-row-permanent' }),
            ack: permanentAck,
            retry: permanentRetry,
          },
        ],
      },
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      } as any
    );

    expect(retryableAck).toHaveBeenCalledOnce();
    expect(retryableRetry).not.toHaveBeenCalled();
    expect(permanentAck).toHaveBeenCalledOnce();
    expect(permanentRetry).not.toHaveBeenCalled();
  });

  it('marks DLQ jobs as failed before acking them', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const { createDistributionEngineRepository } = await import('../../lib/server/distribution-engine-repository');
    const repo = {
      getJobById: vi.fn().mockResolvedValue({
        id: 'job-row-9',
        job_id: 'job_9',
        publish_mode: 'draft',
      }),
      listJobAttempts: vi.fn().mockResolvedValue([{ id: 'attempt-1' }]),
      createJobAttempt: vi.fn().mockResolvedValue({}),
      updateJob: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(createDistributionEngineRepository).mockReturnValue(repo as any);

    await dispatchDistributionQueueBatch(
      {
        queue: 'geo-pulse-distribution-dlq',
        messages: [
          {
            body: JSON.stringify({ v: 1, distributionJobId: 'job-row-9' }),
            ack,
            retry,
          },
        ],
      },
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      } as any
    );

    expect(repo.createJobAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionJobId: 'job-row-9',
        attemptNumber: 2,
        errorMessage: 'Distribution job moved to DLQ after queue retries were exhausted.',
      })
    );
    expect(repo.updateJob).toHaveBeenCalledWith(
      'job-row-9',
      expect.objectContaining({
        status: 'failed',
      })
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
