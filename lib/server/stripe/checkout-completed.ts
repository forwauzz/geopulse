import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { PaymentApiEnv } from '@/lib/server/cf-env';
import {
  ensureDeepAuditJobQueued,
  type EnsureDeepAuditJobResult,
} from '@/lib/server/stripe/ensure-deep-audit-job-queued';

export type CheckoutCompletedResult = EnsureDeepAuditJobResult;

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

function paymentLookupOrFilter(stripeEventId: string, stripeSessionId: string): string {
  return `stripe_event_id.eq.${stripeEventId},stripe_session_id.eq.${stripeSessionId}`;
}

function normalizeGuestEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Idempotent handler for Stripe `checkout.session.completed`.
 * Inserts `payments`, enqueues PDF job. Replays enqueue on webhook retry when payment exists but report does not.
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
    .select('id, scan_id')
    .or(paymentLookupOrFilter(stripeEventId, stripeSessionId))
    .maybeSingle();

  if (existing?.id) {
    return ensureDeepAuditJobQueued(supabase, env, session, email, existing, true);
  }

  const { data: paymentRow, error: insertErr } = await supabase
    .from('payments')
    .insert({
      user_id: null,
      guest_email: normalizeGuestEmail(email),
      stripe_session_id: stripeSessionId,
      stripe_event_id: stripeEventId,
      amount_cents: amountCents,
      currency: session.currency ?? 'usd',
      type: 'one_time_audit',
      status: 'complete',
      scan_id: scanId,
    })
    .select('id, scan_id')
    .single();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      const { data: byEvent } = await supabase
        .from('payments')
        .select('id, scan_id')
        .eq('stripe_event_id', stripeEventId)
        .maybeSingle();
      const row =
        byEvent?.id != null
          ? byEvent
          : (
              await supabase
                .from('payments')
                .select('id, scan_id')
                .eq('stripe_session_id', stripeSessionId)
                .maybeSingle()
            ).data;
      if (!row?.id) {
        return { ok: false, reason: 'payment_reconcile_failed', status: 500 };
      }
      return ensureDeepAuditJobQueued(supabase, env, session, email, row, true);
    }
    return { ok: false, reason: insertErr.message, status: 500 };
  }

  if (!paymentRow?.id) {
    return { ok: false, reason: 'payment_insert_failed', status: 500 };
  }

  return ensureDeepAuditJobQueued(supabase, env, session, email, paymentRow, false);
}
