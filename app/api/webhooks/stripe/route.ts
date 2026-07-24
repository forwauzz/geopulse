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
import {
  handleMonitorCheckoutCompleted,
  handleMonitorSubscriptionEvent,
  handleMonitorInvoiceEvent,
} from '@/lib/server/monitor-subscription';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { markMonitorLeadConverted } from '@/lib/server/monitor-lead-conversion';
import { sendTrialEndingReminder } from '@/lib/server/subscription-lifecycle-email';

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

    const nowMs = Date.now();
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          // Monitor subscriptions ($39/mo product) are email-keyed and must NOT provision a
          // workspace — route them to their own handler and skip the workspace path.
          const monitor = await handleMonitorSubscriptionEvent({ supabase: adminDb, subscription: sub, env, deleted: false, nowMs });
          if (!monitor.handled) await handleSubscriptionUpserted(adminDb, sub, env);
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const monitor = await handleMonitorSubscriptionEvent({ supabase: adminDb, subscription: sub, env, deleted: true, nowMs });
          if (!monitor.handled) await handleSubscriptionCancelled(adminDb, sub);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const monitor = await handleMonitorInvoiceEvent({ supabase: adminDb, invoice, paid: true, nowMs });
          if (!monitor.handled) await handleInvoicePaid(adminDb, invoice);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const monitor = await handleMonitorInvoiceEvent({ supabase: adminDb, invoice, paid: false, nowMs });
          if (!monitor.handled) await handleInvoiceFailed(adminDb, invoice);
          break;
        }

        case 'customer.subscription.trial_will_end': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.['user_id'];
          const bundleKey = sub.metadata?.['bundle_key'];
          const emailed = userId && bundleKey
            ? await sendTrialEndingReminder({
                supabase: adminDb,
                env,
                userId,
                subscriptionId: sub.id,
                bundleKey,
              })
            : false;
          // 3-day warning before trial ends. Log only — email reminders are future work.
          structuredLog('subscription_trial_will_end', {
            stripeEventId: event.id,
            subscriptionId: sub.id,
            emailed,
          }, 'info');
          break;
        }
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

  // ── checkout.session.completed ─────────────────────────────────────────────
  if (event.type !== 'checkout.session.completed') {
    return new Response(null, { status: 200 });
  }

  const sessionObj = event.data.object as Stripe.Checkout.Session;

  // Monitor subscription ($39/mo) — the authoritative seed of the email-keyed row. Handled here
  // (not in the subscription lifecycle events) because the session carries the customer email.
  if (sessionObj.mode === 'subscription' && sessionObj.metadata?.['kind'] === 'monitor') {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response('Misconfigured', { status: 503 });
    }
    const adminDb = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const monitor = await handleMonitorCheckoutCompleted({
      supabase: adminDb,
      stripe,
      session: sessionObj,
      env,
      nowMs: Date.now(),
    });
    if (!monitor.ok) {
      structuredError('monitor_checkout_seed_failed', {
        stripeEventId: event.id,
        sessionId: sessionObj.id,
        error: monitor.error ?? 'unknown',
      });
      // 500 so Stripe retries — a dropped seed would lose the subscriber.
      return new Response('Monitor seed failed', { status: 500 });
    }
    const email = sessionObj.customer_details?.email ?? sessionObj.customer_email ?? null;
    const scanId = sessionObj.metadata?.['scan_id'] ?? null;
    const convertedLeads = await markMonitorLeadConverted({
      supabase: adminDb,
      scanId,
      email,
      stripeEventId: event.id,
      stripeSessionId: sessionObj.id,
    });
    const userId = sessionObj.metadata?.['user_id'] ?? null;
    const customerId = typeof sessionObj.customer === 'string'
      ? sessionObj.customer
      : sessionObj.customer?.id ?? null;
    if (userId) {
      if (customerId) {
        await adminDb.from('users').update({ stripe_customer_id: customerId }).eq('id', userId);
      }
      if (scanId) {
        await adminDb.from('scans').update({ user_id: userId }).eq('id', scanId).is('user_id', null);
      }
    }
    await emitMarketingEvent(adminDb, 'payment_completed', {
      idempotency_key: `monitor_payment:${event.id}`,
      scan_id: scanId,
      user_id: userId,
      email,
      metadata: {
        kind: 'monitor',
        stripe_event_id: event.id,
        stripe_session_id: sessionObj.id,
        stripe_subscription_id:
          typeof sessionObj.subscription === 'string'
            ? sessionObj.subscription
            : sessionObj.subscription?.id ?? null,
        amount_cents: sessionObj.amount_total ?? 0,
      },
    });
    structuredLog('monitor_checkout_seeded', {
      stripeEventId: event.id,
      sessionId: sessionObj.id,
      convertedLeads,
    }, 'info');
    return new Response(null, { status: 200 });
  }

  // Subscription-mode checkouts (BILL stream) only have bundle_key + user_id in metadata.
  // Workspace provisioning is handled by customer.subscription.created — skip here.
  if (sessionObj.mode === 'subscription') {
    structuredLog('stripe_subscription_checkout_completed_skipped', {
      stripeEventId: event.id,
      sessionId: sessionObj.id,
      bundleKey: sessionObj.metadata?.['bundle_key'] ?? '',
      userId: sessionObj.metadata?.['user_id'] ?? '',
    }, 'info');
    return new Response(null, { status: 200 });
  }

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
