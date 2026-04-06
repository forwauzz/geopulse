import type Stripe from 'stripe';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { structuredError, structuredLog } from '@/lib/server/structured-log';
import { createStripeClient } from '@/lib/server/stripe-client';
import { handleCheckoutSessionCompleted } from '@/lib/server/stripe/checkout-completed';
import {
  handleSubscriptionUpserted,
  handleSubscriptionCancelled,
  handleInvoicePaid,
  handleInvoiceFailed,
} from '@/lib/server/stripe/subscription-handlers';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Misconfigured', { status: 503 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  // ── Subscription lifecycle events (BILL-003) ───────────────────────────────
  // These run before the checkout.session.completed early-exit below so they
  // are never accidentally swallowed by the "unknown event → 200" fallback.
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted' ||
    event.type === 'invoice.payment_succeeded' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'customer.subscription.trial_will_end'
  ) {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response('Misconfigured', { status: 503 });
    }
    const adminDb = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpserted(adminDb, event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionCancelled(adminDb, event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await handleInvoicePaid(adminDb, event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await handleInvoiceFailed(adminDb, event.data.object as Stripe.Invoice);
          break;

        case 'customer.subscription.trial_will_end':
          // 3-day warning before trial ends. Log only — email reminders are future work.
          structuredLog('subscription_trial_will_end', {
            stripeEventId: event.id,
            subscriptionId: (event.data.object as Stripe.Subscription).id,
          }, 'info');
          break;
      }
    } catch (err) {
      structuredError('subscription_event_handler_threw', {
        stripeEventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
      // Return 500 so Stripe retries — handler errors are unexpected
      return new Response('Handler error', { status: 500 });
    }

    return new Response(null, { status: 200 });
  }

  // ── checkout.session.completed (existing — DO NOT modify) ──────────────────
  if (event.type !== 'checkout.session.completed') {
    return new Response(null, { status: 200 });
  }

  const sessionObj = event.data.object as Stripe.Checkout.Session;
  const session =
    sessionObj.customer_details?.email || sessionObj.customer_email
      ? sessionObj
      : await stripe.checkout.sessions.retrieve(sessionObj.id);

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Misconfigured', { status: 503 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await handleCheckoutSessionCompleted(supabase, session, event.id, env);

  if (!result.ok) {
    structuredError('stripe_checkout_completed_failed', {
      stripeEventId: event.id,
      stripeSessionId: session.id,
      scanId: session.metadata?.['scan_id'] ?? null,
      reason: result.reason,
      status: result.status,
    });
    return Response.json(
      { error: { code: result.reason, message: result.reason } },
      { status: result.status }
    );
  }

  structuredLog('stripe_checkout_completed_processed', {
    stripeEventId: event.id,
    stripeSessionId: session.id,
    scanId: session.metadata?.['scan_id'] ?? null,
    duplicate: result.duplicate,
  }, 'info');

  const email = session.customer_details?.email ?? session.customer_email ?? undefined;
  await emitMarketingEvent(supabase, 'payment_completed', {
    scan_id: session.metadata?.['scan_id'],
    payment_id: 'payment_id' in result ? (result as { payment_id?: string }).payment_id : undefined,
    email: email ?? null,
    metadata: {
      stripe_event_id: event.id,
      stripe_session_id: session.id,
      amount_cents: session.amount_total ?? 0,
    },
  });

  return new Response(null, { status: 200 });
}
