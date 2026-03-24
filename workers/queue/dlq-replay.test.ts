import { describe, expect, it, vi } from 'vitest';
import type { ReportQueueMessageV1 } from '../../lib/queue/report-job';
import { replayReportJobFromDlq } from './dlq-replay';

const job: ReportQueueMessageV1 = {
  v: 1,
  scanId: 'scan-1',
  customerEmail: 'a@b.co',
  paymentId: 'pay-1',
  stripeSessionId: 'cs_1',
};

describe('replayReportJobFromDlq', () => {
  it('sends to main queue and sets KV when not yet replayed', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(null);
    const put = vi.fn().mockResolvedValue(undefined);
    await replayReportJobFromDlq(job, {
      SCAN_QUEUE: { send } as unknown as Queue,
      SCAN_CACHE: { get, put } as unknown as KVNamespace,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(JSON.stringify(job));
    expect(put).toHaveBeenCalledWith(
      'report:dlq-replay:pay-1',
      '1',
      expect.objectContaining({ expirationTtl: expect.any(Number) })
    );
  });

  it('does not send when KV already marks replay', async () => {
    const send = vi.fn();
    const get = vi.fn().mockResolvedValue('1');
    const put = vi.fn();
    await replayReportJobFromDlq(job, {
      SCAN_QUEUE: { send } as unknown as Queue,
      SCAN_CACHE: { get, put } as unknown as KVNamespace,
    });
    expect(send).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
