/**
 * Account-managed subscription checkout for GEO-Pulse Monitoring ($39/mo · $390/yr).
 *
 * A visitor runs the free audit, creates/signs into a free account, and subscribes to monitor that
 * site monthly. Checkout reuses one Stripe customer per account; the webhook seeds the
 * email-keyed monitoring row and the monthly cron re-audits + emails each versioned scorecard.
 *
 * Gated on the `show_monitor_subscription` UI flag (fail-closed) and configured monitor price ids.
 */
import { z } from 'zod';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkCheckoutRateLimit } from '@/lib/server/rate-limit-kv';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { structuredLog } from '@/lib/server/structured-log';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
import { monitorPriceIdForPlan, normalizeMonitorPlan } from '@/lib/server/monitor-subscription';
import { optionalAttributionFields } from '@services/marketing-attribution/attribution-params';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { isExcludedRevenueIdentity } from '@/lib/server/revenue-identity';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scanId: z.string().uuid(),
  plan: z.enum(['monthly', 'annual']).default('monthly'),
  turnstileToken: z.string().min(1),
}).extend(optionalAttributionFields.shape);

function databaseUnavailable(stage: string, error: unknown): Response {
  const errorCode =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'unavailable';
  structuredLog('monitor_subscribe_database_unavailable', { stage, errorCode }, 'error');
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'Monitoring checkout is temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    }
  );
}

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
  const userSupabase = await createSupabaseServerClient();
  let authResult;
  try {
    authResult = await userSupabase.auth.getUser();
  } catch (error) {
    return databaseUnavailable('auth_lookup', error);
  }
  const {
    data: { user },
    error: authError,
  } = authResult;
  const email = user?.email?.trim().toLowerCase() ?? '';
  if (authError) {
    return databaseUnavailable('auth_lookup', authError);
  }
  if (!user || !email) {
    return Response.json(
      { error: { code: 'unauthenticated', message: 'Create or sign in to your free account first.' } },
      { status: 401 }
    );
  }

  let scanResult;
  try {
    scanResult = await supabase
      .from('scans')
      .select('id,url,status')
      .eq('id', parsed.data.scanId)
      .maybeSingle();
  } catch (error) {
    return databaseUnavailable('scan_lookup', error);
  }
  const { data: scan, error: scanErr } = scanResult;
  if (scanErr) {
    return databaseUnavailable('scan_lookup', scanErr);
  }
  if (!scan || scan.status !== 'complete' || !scan.url) {
    return Response.json({ error: { code: 'invalid_scan', message: 'Scan is not eligible for monitoring' } }, { status: 400 });
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  let domain: string;
  try {
    domain = new URL(scan.url as string).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return Response.json({ error: { code: 'invalid_scan', message: 'Scan URL is invalid' } }, { status: 400 });
  }

  let existingMonitorResult;
  try {
    existingMonitorResult = await supabase
      .from('monitoring_subscriptions')
      .select('id,status')
      .eq('email', email)
      .eq('domain', domain)
      .in('status', ['active', 'trialing', 'past_due', 'incomplete'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  } catch (error) {
    return databaseUnavailable('monitor_lookup', error);
  }
  const { data: existingMonitor, error: existingMonitorError } = existingMonitorResult;
  if (existingMonitorError) {
    return databaseUnavailable('monitor_lookup', existingMonitorError);
  }
  if (existingMonitor) {
    return Response.json(
      {
        error: {
          code: 'already_subscribed',
          message: existingMonitor.status === 'past_due'
            ? 'This site is already monitored, but its payment needs attention. Open Billing to update it.'
            : 'This site is already being monitored. Open Billing to manage it.',
        },
      },
      { status: 409 }
    );
  }

  let userResult;
  try {
    userResult = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
  } catch (error) {
    return databaseUnavailable('billing_customer_lookup', error);
  }
  const { data: userRow, error: userError } = userResult;
  if (userError) {
    return databaseUnavailable('billing_customer_lookup', userError);
  }
  let stripeCustomerId = userRow?.stripe_customer_id?.trim() ?? '';
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
    } catch (error) {
      structuredLog(
        'monitor_subscribe_stripe_unavailable',
        {
          stage: 'customer_create',
          errorName: error instanceof Error ? error.name : 'unknown',
        },
        'error'
      );
      return Response.json(
        {
          error: {
            code: 'stripe_error',
            message: 'Could not create a billing account. Please try again shortly.',
          },
        },
        { status: 502 }
      );
    }

    let customerLinkResult;
    try {
      customerLinkResult = await supabase
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
    } catch (error) {
      return databaseUnavailable('billing_customer_link', error);
    }
    if (customerLinkResult.error) {
      return databaseUnavailable('billing_customer_link', customerLinkResult.error);
    }
  }

  let stripeSubscriptions;
  try {
    stripeSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
    });
  } catch {
    return Response.json(
      { error: { code: 'stripe_error', message: 'Could not verify your current subscriptions. Please try again.' } },
      { status: 502 }
    );
  }
  const duplicateStripeSubscription = stripeSubscriptions.data.find((subscription) => {
    if (!['active', 'trialing', 'past_due', 'incomplete'].includes(subscription.status)) return false;
    if (subscription.metadata?.['kind'] !== 'monitor') return false;
    try {
      return new URL(subscription.metadata?.['monitored_url'] ?? '').hostname
        .replace(/^www\./i, '')
        .toLowerCase() === domain;
    } catch {
      return false;
    }
  });
  if (duplicateStripeSubscription) {
    return Response.json(
      { error: { code: 'already_subscribed', message: 'This site already has a monitoring subscription. Open Billing to manage it.' } },
      { status: 409 }
    );
  }

  const metadata = {
    kind: 'monitor',
    scan_id: scan.id as string,
    monitored_url: scan.url as string,
    plan,
    user_id: user.id,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: stripeCustomerId,
      client_reference_id: user.id,
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
      user_id: user.id,
      email,
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
        commerce_kind: 'paid_checkout',
        checkout_mode: 'subscription',
        kind: 'monitor',
        plan,
        stripe_session_id: session.id,
        is_internal: isExcludedRevenueIdentity({ email, domain: scan.url as string }),
      },
    });

    return Response.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'stripe_error';
    return Response.json({ error: { code: 'stripe_error', message: msg } }, { status: 502 });
  }
}
