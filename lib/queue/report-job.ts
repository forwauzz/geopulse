/**
 * Payload for Cloudflare Queue: deep-audit PDF + email delivery.
 */
export type ReportQueueMessageV1 = {
  v: 1;
  scanId: string;
  customerEmail: string;
  paymentId: string;
  stripeSessionId: string;
};

export type ReportQueueMessageV2 = {
  v: 2;
  scanId: string;
  scanRunId: string;
  customerEmail: string;
  paymentId: string;
  stripeSessionId: string;
};

export type ReportQueueMessage = ReportQueueMessageV1 | ReportQueueMessageV2;

export function parseReportQueueMessage(raw: string): ReportQueueMessage | null {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return null;
    const o = j as Record<string, unknown>;
    const scanId = o['scanId'];
    const customerEmail = o['customerEmail'];
    const paymentId = o['paymentId'];
    const stripeSessionId = o['stripeSessionId'];
    if (
      typeof scanId !== 'string' ||
      typeof customerEmail !== 'string' ||
      typeof paymentId !== 'string' ||
      typeof stripeSessionId !== 'string'
    ) {
      return null;
    }
    if (o['v'] === 2) {
      const scanRunId = o['scanRunId'];
      if (typeof scanRunId !== 'string') return null;
      return { v: 2, scanId, scanRunId, customerEmail, paymentId, stripeSessionId };
    }
    if (o['v'] === 1) {
      return { v: 1, scanId, customerEmail, paymentId, stripeSessionId };
    }
    return null;
  } catch {
    return null;
  }
}
