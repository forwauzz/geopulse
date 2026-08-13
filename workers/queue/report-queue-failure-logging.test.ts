import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  structuredLog: vi.fn(),
  structuredLogAndWait: vi.fn(),
  structuredLogWithClientAndWait: vi.fn(),
}));

vi.mock('../../lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock('../../lib/server/structured-log', () => ({
  structuredLog: mocks.structuredLog,
  structuredLogAndWait: mocks.structuredLogAndWait,
  structuredLogWithClientAndWait: mocks.structuredLogWithClientAndWait,
}));

import { dispatchQueueBatch } from './report-queue-consumer';

const job = JSON.stringify({
  v: 2,
  scanId: 'scan-96737074',
  scanRunId: 'run-1',
  customerEmail: 'buyer@example.com',
  paymentId: 'pay-1',
  stripeSessionId: 'cs-1',
});

describe('report queue terminal failure logging', () => {
  it('awaits a durable, identified terminal log before retrying the final replay attempt', async () => {
    let releaseLog!: () => void;
    const durableLog = new Promise<void>((resolve) => { releaseLog = resolve; });
    mocks.structuredLogWithClientAndWait.mockReturnValueOnce(durableLog);
    const db = { from: vi.fn() };
    mocks.createServiceRoleClient.mockReturnValue(db);
    const ack = vi.fn();
    const retry = vi.fn();
    const cacheGet = vi.fn(async () => '1');

    const dispatch = dispatchQueueBatch({
      queue: 'geo-pulse-scan-queue',
      messages: [{ body: job, attempts: 3, ack, retry }],
    }, {
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SCAN_CACHE: { get: cacheGet } as unknown as KVNamespace,
    } as CloudflareEnv);

    await vi.waitFor(() => expect(mocks.structuredLogWithClientAndWait).toHaveBeenCalledOnce());
    expect(retry).not.toHaveBeenCalled();
    expect(mocks.structuredLogWithClientAndWait).toHaveBeenCalledWith(
      db,
      'report_job_terminal_failure',
      expect.objectContaining({
        scanId: 'scan-96737074',
        paymentId: 'pay-1',
        errorName: 'Error',
        message: 'resend_not_configured',
        attempts: 3,
        replayedFromDlq: true,
        terminal: true,
      }),
      'error',
    );

    releaseLog();
    await dispatch;
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('classifies a first-cycle failure as retryable while retaining scan identity', async () => {
    mocks.structuredLogWithClientAndWait.mockResolvedValueOnce(undefined);
    mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn() });
    const retry = vi.fn();

    await dispatchQueueBatch({
      queue: 'geo-pulse-scan-queue',
      messages: [{ body: job, attempts: 1, ack: vi.fn(), retry }],
    }, {
      NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SCAN_CACHE: { get: vi.fn(async () => null) } as unknown as KVNamespace,
    } as CloudflareEnv);

    expect(mocks.structuredLogWithClientAndWait).toHaveBeenCalledWith(
      expect.anything(),
      'report_job_failed',
      expect.objectContaining({ scanId: 'scan-96737074', attempts: 1, terminal: false }),
      'error',
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
