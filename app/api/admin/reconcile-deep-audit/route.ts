import type Stripe from 'stripe';
import { z } from 'zod';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { ensureDeepAuditJobQueued } from '@/lib/server/stripe/ensure-deep-audit-job-queued';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  stripeSessionId: z.string().min(3),
});

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

/**
 * Backfill `payments` + enqueue PDF job for a paid Checkout session that never hit the webhook (or failed before insert).
 * Protect with `RECONCILE_SECRET` + header `x-reconcile-secret` (404 when unset or wrong).
 */
export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  if (!env.RECONCILE_SECRET) {
    return new Response('Not found', { status: 404 });
  }
  if (request.headers.get('x-reconcile-secret') !== env.RECONCILE_SECRET) {
    return new Response('Not found', { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }

  if (!env.STRIPE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'misconfigured' }, { status: 503 });
  }

  if (!env.SCAN_QUEUE) {
    return Response.json({ error: 'queue_not_configured' }, { status: 503 });
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(parsed.data.stripeSessionId);
  } catch {
    return Response.json({ error: 'stripe_retrieve_failed' }, { status: 502 });
  }

  if (session.payment_status !== 'paid') {
    return Response.json(
      { error: 'session_not_paid', payment_status: session.payment_status },
      { status: 400 }
    );
  }

  const scanId = session.metadata?.['scan_id'];
  if (!scanId || typeof scanId !== 'string') {
    return Response.json({ error: 'missing_scan_metadata' }, { status: 400 });
  }

  const emailRaw = session.customer_details?.email ?? session.customer_email;
  const email = typeof emailRaw === 'string' && emailRaw.length > 0 ? emailRaw : null;
  if (!email) {
    return Response.json({ error: 'missing_customer_email' }, { status: 400 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing } = await supabase
    .from('payments')
    .select('id, scan_id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (existing?.id) {
    const r = await ensureDeepAuditJobQueued(supabase, env, session, email, existing, true);
    if (!r.ok) {
      return Response.json({ ok: false, createdPayment: false, reason: r.reason }, { status: r.status });
    }
    return Response.json({ ok: true, createdPayment: false, queued: true });
  }

  const reconcileEventId = `evt_reconcile_${session.id}`;
  const { data: inserted, error: insErr } = await supabase
    .from('payments')
    .insert({
      user_id: null,
      guest_email: email.trim().toLowerCase(),
      stripe_session_id: session.id,
      stripe_event_id: reconcileEventId,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      type: 'one_time_audit',
      status: 'complete',
      scan_id: scanId,
    })
    .select('id, scan_id')
    .single();

  if (insErr) {
    if (isUniqueViolation(insErr)) {
      const { data: row } = await supabase
        .from('payments')
        .select('id, scan_id')
        .eq('stripe_session_id', session.id)
        .maybeSingle();
      if (!row?.id) {
        return Response.json({ error: 'reconcile_race_failed' }, { status: 500 });
      }
      const r = await ensureDeepAuditJobQueued(supabase, env, session, email, row, true);
      if (!r.ok) {
        return Response.json({ ok: false, createdPayment: false, reason: r.reason }, { status: r.status });
      }
      return Response.json({ ok: true, createdPayment: false, queued: true });
    }
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  if (!inserted?.id) {
    return Response.json({ error: 'insert_failed' }, { status: 500 });
  }

  const r = await ensureDeepAuditJobQueued(supabase, env, session, email, inserted, false);
  if (!r.ok) {
    return Response.json(
      { ok: false, createdPayment: true, paymentId: inserted.id, reason: r.reason },
      { status: r.status }
    );
  }

  return Response.json({ ok: true, createdPayment: true, paymentId: inserted.id, queued: true });
}
