import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { ReportQueueMessageV1 } from '@/lib/queue/report-job';
import type { PaymentApiEnv } from '@/lib/server/cf-env';

export type CheckoutCompletedResult =
  | { ok: true; duplicate: true; paymentId: string | null }
  | { ok: true; duplicate: false; paymentId: string }
  | { ok: false; reason: string; status: number };

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

/**
 * Idempotent handler for Stripe `checkout.session.completed`.
 * Inserts `payments`, enqueues PDF job. Duplicate `stripe_event_id` → success no-op.
 */
export async function handleCheckoutSessionCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  env: PaymentApiEnv
): Promise<CheckoutCompletedResult> {
  if (!env.SCAN_QUEUE) {
    return { ok: false, reason: 'queue_not_configured', status: 503 };
  }

  const scanId = session.metadata?.['scan_id'];
  if (!scanId || typeof scanId !== 'string') {
    return { ok: false, reason: 'missing_scan_metadata', status: 400 };
  }

  const emailRaw = session.customer_details?.email ?? session.customer_email;
  const email = typeof emailRaw === 'string' && emailRaw.length > 0 ? emailRaw : null;
  if (!email) {
    return { ok: false, reason: 'missing_customer_email', status: 400 };
  }

  const amountCents = session.amount_total ?? 0;
  const stripeSessionId = session.id;

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, duplicate: true, paymentId: existing.id };
  }

  const { data: paymentRow, error: insertErr } = await supabase
    .from('payments')
    .insert({
      user_id: null,
      stripe_session_id: stripeSessionId,
      stripe_event_id: stripeEventId,
      amount_cents: amountCents,
      currency: session.currency ?? 'usd',
      type: 'one_time_audit',
      status: 'complete',
      scan_id: scanId,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      return { ok: true, duplicate: true, paymentId: null };
    }
    return { ok: false, reason: insertErr.message, status: 500 };
  }

  if (!paymentRow?.id) {
    return { ok: false, reason: 'payment_insert_failed', status: 500 };
  }

  const payload: ReportQueueMessageV1 = {
    v: 1,
    scanId,
    customerEmail: email,
    paymentId: paymentRow.id,
    stripeSessionId,
  };

  try {
    await env.SCAN_QUEUE.send(JSON.stringify(payload));
  } catch {
    return { ok: false, reason: 'queue_send_failed', status: 500 };
  }

  return { ok: true, duplicate: false, paymentId: paymentRow.id };
}
