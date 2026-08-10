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
import { enqueueLifecycleEmail, setLifecycleEmailSuppression, type LifecycleTemplateKey } from '@/lib/server/lifecycle-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function enqueueBillingEmail(args: { adminDb: ReturnType<typeof createServiceRoleClient>; env: Awaited<ReturnType<typeof getPaymentApiEnv>>; eventId: string; templateKey: LifecycleTemplateKey; subscriptionId: string; userId?: string | null; email?: string | null }): Promise<void> {
  let to = args.email?.trim() ?? '';
  if (!to && args.userId) {
    const { data } = await args.adminDb.from('users').select('email').eq('id', args.userId).maybeSingle();
    to = data?.email ?? '';
  }
  if (!to) return;
  const result = await enqueueLifecycleEmail({ supabase: args.adminDb, to, userId: args.userId ?? null,
    subjectId: args.subscriptionId, idempotencyKey: `stripe/${args.eventId}/${args.templateKey}`,
    eventType: args.templateKey, templateKey: args.templateKey,
    variables: { cta_url: `${(args.env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com').replace(/\/$/, '')}/dashboard/billing` } });
  if (!result.ok) throw new Error(`lifecycle_enqueue_failed:${result.reason ?? 'unknown'}`);
}

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
          const { data: monitorRow } = await adminDb.from('monitoring_subscriptions').select('email').eq('stripe_subscription_id', sub.id).maybeSingle();
          const userId = sub.metadata?.['user_id'] ?? null;
          const { data: userRow } = userId ? await adminDb.from('users').select('email').eq('id', userId).maybeSingle() : { data: null };
          const cancelledEmail = monitorRow?.email ?? userRow?.email ?? null;
          await enqueueBillingEmail({ adminDb, env, eventId: event.id, templateKey: 'subscription_cancelled', subscriptionId: sub.id, userId, email: cancelledEmail });
          if (cancelledEmail) await setLifecycleEmailSuppression({ supabase: adminDb, email: cancelledEmail, scope: 'marketing', reason: 'cancellation', source: 'stripe_webhook' });
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const monitor = await handleMonitorInvoiceEvent({ supabase: adminDb, invoice, paid: true, nowMs });
          if (!monitor.handled) await handleInvoicePaid(adminDb, invoice);
          if ((invoice.attempt_count ?? 1) > 1) {
            const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? '';
            const { data: monitorRow } = await adminDb.from('monitoring_subscriptions').select('email').eq('stripe_subscription_id', subId).maybeSingle();
            const { data: subRow } = await adminDb.from('user_subscriptions').select('user_id').eq('stripe_subscription_id', subId).maybeSingle();
            await enqueueBillingEmail({ adminDb, env, eventId: event.id, templateKey: 'payment_recovered', subscriptionId: subId, userId: subRow?.user_id ?? null, email: monitorRow?.email ?? null });
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const monitor = await handleMonitorInvoiceEvent({ supabase: adminDb, invoice, paid: false, nowMs });
          if (!monitor.handled) await handleInvoiceFailed(adminDb, invoice);
          const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? '';
          const { data: monitorRow } = await adminDb.from('monitoring_subscriptions').select('email').eq('stripe_subscription_id', subId).maybeSingle();
          const { data: subRow } = await adminDb.from('user_subscriptions').select('user_id').eq('stripe_subscription_id', subId).maybeSingle();
          await enqueueBillingEmail({ adminDb, env, eventId: event.id, templateKey: 'payment_failed', subscriptionId: subId, userId: subRow?.user_id ?? null, email: monitorRow?.email ?? null });
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
    if (email) {
      const lifecycle = await enqueueLifecycleEmail({ supabase: adminDb, to: email, userId,
      subjectId: sessionObj.id, idempotencyKey: `monitoring-activated/${sessionObj.id}`,
      eventType: 'monitoring_activated', templateKey: 'monitoring_activated', variables: {
        domain: sessionObj.metadata?.['monitored_url'] ?? 'your business',
        next_report_date: new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-CA'),
        cta_url: `${(env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com').replace(/\/$/, '')}/dashboard`,
      } });
      if (!lifecycle.ok) return new Response('Lifecycle enqueue failed', { status: 500 });
    }
    if (email) await setLifecycleEmailSuppression({ supabase: adminDb, email, scope: 'marketing', reason: 'conversion', source: 'stripe_webhook' });
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
  if (email) {
    const lifecycle = await enqueueLifecycleEmail({ supabase, to: email,
    subjectId: session.id, idempotencyKey: `checkout-received/${session.id}`,
    eventType: 'checkout_received', templateKey: 'checkout_received', variables: {
      domain: session.metadata?.['domain'] ?? session.metadata?.['url'] ?? 'your website',
      cta_url: `${(env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com').replace(/\/$/, '')}/dashboard`,
    } });
    if (!lifecycle.ok) return new Response('Lifecycle enqueue failed', { status: 500 });
  }
  if (email) await setLifecycleEmailSuppression({ supabase, email, scope: 'marketing', reason: 'conversion', source: 'stripe_webhook' });

  return new Response(null, { status: 200 });
}
