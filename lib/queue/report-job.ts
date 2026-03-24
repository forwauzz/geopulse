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

export function parseReportQueueMessage(raw: string): ReportQueueMessageV1 | null {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return null;
    const o = j as Record<string, unknown>;
    if (o['v'] !== 1) return null;
    const scanId = o['scanId'];
    const customerEmail = o['customerEmail'];
    const paymentId = o['paymentId'];
    const stripeSessionId = o['stripeSessionId'];
    if (
      typeof scanId === 'string' &&
      typeof customerEmail === 'string' &&
      typeof paymentId === 'string' &&
      typeof stripeSessionId === 'string'
    ) {
      return { v: 1, scanId, customerEmail, paymentId, stripeSessionId };
    }
    return null;
  } catch {
    return null;
  }
}
