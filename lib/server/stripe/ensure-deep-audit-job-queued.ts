import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { ReportQueueMessageV1 } from '@/lib/queue/report-job';
import type { PaymentApiEnv } from '@/lib/server/cf-env';

export type PaymentRow = { id: string; scan_id: string | null };

export type EnsureDeepAuditJobResult =
  | { ok: true; duplicate: true }
  | { ok: true; duplicate: false }
  | { ok: false; reason: string; status: number };

/**
 * Ensure a queue message exists for this payment when no deep_audit report row yet.
 */
export async function ensureDeepAuditJobQueued(
  supabase: SupabaseClient,
  env: PaymentApiEnv,
  session: Stripe.Checkout.Session,
  customerEmail: string,
  payment: PaymentRow,
  duplicateEvent: boolean
): Promise<EnsureDeepAuditJobResult> {
  if (!env.SCAN_QUEUE) {
    return { ok: false, reason: 'queue_not_configured', status: 503 };
  }

  if (!payment.scan_id) {
    return { ok: false, reason: 'payment_missing_scan_id', status: 500 };
  }

  const { data: report } = await supabase
    .from('reports')
    .select('id')
    .eq('scan_id', payment.scan_id)
    .eq('type', 'deep_audit')
    .maybeSingle();

  if (report?.id) {
    return { ok: true, duplicate: true };
  }

  const payload: ReportQueueMessageV1 = {
    v: 1,
    scanId: payment.scan_id,
    customerEmail,
    paymentId: payment.id,
    stripeSessionId: session.id,
  };

  try {
    await env.SCAN_QUEUE.send(JSON.stringify(payload));
  } catch {
    return { ok: false, reason: 'queue_send_failed', status: 500 };
  }

  return { ok: true, duplicate: duplicateEvent };
}
