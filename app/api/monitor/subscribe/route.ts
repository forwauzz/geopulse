/**
 * Anonymous subscription checkout for GEO-Pulse Monitoring ($39/mo · $390/yr).
 *
 * Mirrors the guest deep-audit checkout: no login required. A visitor who just ran the free audit
 * subscribes to monitor that site monthly. Stripe collects the email at checkout; the webhook seeds
 * the monitoring_subscriptions row (email-keyed) and the monthly cron re-audits + emails the report.
 *
 * Gated on the `show_monitor_subscription` UI flag (fail-closed) and configured monitor price ids.
 */
import { z } from 'zod';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkCheckoutRateLimit } from '@/lib/server/rate-limit-kv';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { structuredLog } from '@/lib/server/structured-log';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
import { monitorPriceIdForPlan, normalizeMonitorPlan } from '@/lib/server/monitor-subscription';
import { optionalAttributionFields } from '@services/marketing-attribution/attribution-params';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scanId: z.string().uuid(),
  // Optional: Stripe Checkout collects the email itself. Passing it just prefills the field.
  email: z.string().email().max(320).nullish(),
  plan: z.enum(['monthly', 'annual']).default('monthly'),
  turnstileToken: z.string().min(1),
}).extend(optionalAttributionFields.shape);

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const ip = getClientIp(request);

  // Fail-closed: the whole feature is dark until the operator flips the flag.
  const flags = await loadUiFlags();
  if (!flags.show_monitor_subscription) {
    return Response.json({ error: { code: 'not_available', message: 'Monitoring is not available yet.' } }, { status: 404 });
  }

  const rl = await checkCheckoutRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many attempts. Try again later.' } },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 3600) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json', message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', message: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const ts = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, parsed.data.turnstileToken, ip);
  if (!ts.ok) {
    return Response.json({ error: { code: 'turnstile_failed', message: ts.error } }, { status: 400 });
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured', message: 'Database not configured' } }, { status: 503 });
  }
  const baseUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json({ error: { code: 'server_misconfigured', message: 'App URL not configured' } }, { status: 503 });
  }

  const plan = normalizeMonitorPlan(parsed.data.plan);
  const priceId = monitorPriceIdForPlan(plan, env);
  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return Response.json({ error: { code: 'server_misconfigured', message: 'Monitoring pricing is not configured' } }, { status: 503 });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .select('id,url,status')
    .eq('id', parsed.data.scanId)
    .maybeSingle();
  if (scanErr) {
    return Response.json({ error: { code: 'db_error', message: scanErr.message } }, { status: 500 });
  }
  if (!scan || scan.status !== 'complete' || !scan.url) {
    return Response.json({ error: { code: 'invalid_scan', message: 'Scan is not eligible for monitoring' } }, { status: 400 });
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  const metadata = {
    kind: 'monitor',
    scan_id: scan.id as string,
    monitored_url: scan.url as string,
    plan,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Stripe Checkout collects the email; prefill it only when the caller supplied one.
      ...(parsed.data.email ? { customer_email: parsed.data.email } : {}),
      success_url: `${baseUrl}/results/${scan.id}?checkout=subscribed`,
      cancel_url: `${baseUrl}/results/${scan.id}?checkout=cancel`,
      // Tax intentionally deferred — no GST/QST registration yet. Charge is flat, tax-exclusive.
      // When registered, add `automatic_tax: { enabled: true }` here to collect tax on top.
      metadata,
      subscription_data: { metadata },
    });

    if (!session.url) {
      return Response.json({ error: { code: 'stripe_error', message: 'Checkout URL not returned' } }, { status: 502 });
    }

    structuredLog('monitor_subscribe_session_created', {
      scanId: scan.id,
      plan,
      stripeSessionId: session.id,
    }, 'info');

    await emitMarketingEvent(supabase, 'checkout_started', {
      anonymous_id: parsed.data.anonymous_id,
      scan_id: scan.id as string,
      email: parsed.data.email,
      utm_source: parsed.data.utm_source,
      utm_medium: parsed.data.utm_medium,
      utm_campaign: parsed.data.utm_campaign,
      utm_content: parsed.data.utm_content,
      utm_term: parsed.data.utm_term,
      referrer_url: parsed.data.referrer_url,
      landing_path: parsed.data.landing_path,
      channel: parsed.data.utm_source ?? 'direct_or_unknown',
      idempotency_key: `monitor_checkout:${session.id}`,
      metadata: {
        kind: 'monitor',
        plan,
        stripe_session_id: session.id,
      },
    });

    return Response.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'stripe_error';
    return Response.json({ error: { code: 'stripe_error', message: msg } }, { status: 502 });
  }
}
