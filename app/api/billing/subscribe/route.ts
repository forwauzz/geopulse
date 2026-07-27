import { z } from 'zod';
import type Stripe from 'stripe';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkCheckoutRateLimit } from '@/lib/server/rate-limit-kv';
import { buildBillingSubscribeSuccessUrl } from '@/lib/server/billing-onboarding-flow';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { structuredError, structuredLog } from '@/lib/server/structured-log';
import {
  completeQaBuyerJourney,
  validateQaBuyerJourney,
} from '@/lib/server/qa-buyer-journey';
import { handleSubscriptionUpserted } from '@/lib/server/stripe/subscription-handlers';

export const runtime = 'nodejs';

const PAID_BUNDLE_KEYS = ['startup_dev', 'agency_core', 'agency_pro'] as const;
type PaidBundleKey = (typeof PAID_BUNDLE_KEYS)[number];

function isPaidBundleKey(v: string): v is PaidBundleKey {
  return (PAID_BUNDLE_KEYS as readonly string[]).includes(v);
}

function checkoutFailure(
  code: string,
  message: string,
  status: number,
  context: Record<string, string | number | boolean | null | undefined>
): Response {
  structuredError('billing_subscribe_failed', { code, message, ...context });
  return Response.json({ error: { code, message } }, { status });
}

const bodySchema = z.object({
  bundleKey: z.string().min(1).max(64),
  turnstileToken: z.string().min(1),
  organizationName: z.string().trim().min(1).max(120).optional(),
  websiteUrl: z.string().trim().max(512).optional(),
  qaToken: z.string().trim().min(32).max(160).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const env = await getPaymentApiEnv();
    const ip = getClientIp(request);

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

    const { bundleKey, turnstileToken, organizationName, websiteUrl, qaToken } = parsed.data;

    if (!isPaidBundleKey(bundleKey)) {
      return Response.json(
        { error: { code: 'invalid_bundle', message: 'Unknown or free bundle.' } },
        { status: 400 }
      );
    }

    const turnstile = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!turnstile.ok) {
      return Response.json(
        { error: { code: 'turnstile_failed', message: turnstile.error } },
        { status: 400 }
      );
    }

    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: { code: 'server_misconfigured', message: 'Database not configured.' } },
        { status: 503 }
      );
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    if (!baseUrl) {
      return Response.json(
        { error: { code: 'server_misconfigured', message: 'App URL not configured.' } },
        { status: 503 }
      );
    }

    const userSupabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();

    if (authErr || !user) {
      return Response.json(
        { error: { code: 'unauthenticated', message: 'You must be signed in to subscribe.' } },
        { status: 401 }
      );
    }

    // Bundle checkout is authenticated, so rate-limit by user as well as network.
    // A shared office, agency, or QA network must not exhaust checkout for every
    // buyer behind the same IP address.
    const rateLimit = await checkCheckoutRateLimit(env.SCAN_CACHE, `${ip}:user:${user.id}`);
    if (!rateLimit.ok) {
      return Response.json(
        { error: { code: 'rate_limited', message: 'Too many requests. Try again later.' } },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec ?? 3600) } }
      );
    }

    const adminDb = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: bundle, error: bundleErr } = await adminDb
      .from('service_bundles')
      .select('bundle_key, billing_mode, stripe_price_id, trial_period_days, monthly_price_cents')
      .eq('bundle_key', bundleKey)
      .maybeSingle();

    if (bundleErr || !bundle) {
      structuredLog('billing_subscribe_bundle_not_found', { bundleKey, userId: user.id }, 'warning');
      return Response.json(
        { error: { code: 'bundle_not_found', message: 'Bundle not found.' } },
        { status: 400 }
      );
    }

    if (bundle.billing_mode === 'free' || !bundle.stripe_price_id?.trim()) {
      structuredLog('billing_subscribe_bundle_not_paid', { bundleKey, userId: user.id }, 'warning');
      return Response.json(
        {
          error: {
            code: 'bundle_not_paid',
            message: 'This bundle is free or has no Stripe price configured.',
          },
        },
        { status: 400 }
      );
    }

    const { data: existing } = await adminDb
      .from('user_subscriptions')
      .select('id, status, stripe_subscription_id')
      .eq('user_id', user.id)
      .eq('bundle_key', bundleKey)
      .in('status', ['active', 'trialing', 'incomplete'])
      .maybeSingle();

    if (existing) {
      structuredLog(
        'billing_subscribe_already_subscribed',
        { bundleKey, userId: user.id, status: existing.status },
        'info'
      );
      return Response.json(
        {
          error: {
            code: 'already_subscribed',
            message: 'You already have an active subscription for this bundle.',
          },
        },
        { status: 409 }
      );
    }

    if (qaToken) {
      if (!env.SCAN_CACHE || !user.email) {
        return Response.json(
          { error: { code: 'qa_unavailable', message: 'QA simulation is not available.' } },
          { status: 503 },
        );
      }
      const qaValidation = await validateQaBuyerJourney({
        kv: env.SCAN_CACHE,
        token: qaToken,
        email: user.email,
        bundleKey,
      });
      if (!qaValidation.ok) {
        structuredLog(
          'qa_buyer_journey_rejected',
          { userId: user.id, bundleKey, reason: qaValidation.reason },
          'warning',
        );
        return Response.json(
          { error: { code: 'qa_token_invalid', message: 'This QA journey is invalid or expired.' } },
          { status: 403 },
        );
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptionId = `sub_qa_${qaToken.slice(0, 32)}`;
      const customerId = `cus_qa_${qaToken.slice(0, 24)}`;
      const simulatedSubscription = {
        id: subscriptionId,
        customer: customerId,
        status: 'trialing',
        current_period_start: nowSeconds,
        current_period_end: nowSeconds + 7 * 24 * 60 * 60,
        metadata: {
          user_id: user.id,
          bundle_key: bundleKey,
          organization_name: organizationName ?? qaValidation.claim.organizationName,
          ...(websiteUrl ?? qaValidation.claim.websiteUrl
            ? { website_url: websiteUrl ?? qaValidation.claim.websiteUrl ?? '' }
            : {}),
          qa_simulation: 'true',
          qa_token: qaToken,
        },
        items: {
          data: [{ price: { id: bundle.stripe_price_id } }],
        },
      } as unknown as Stripe.Subscription;

      await handleSubscriptionUpserted(adminDb, simulatedSubscription);
      const { data: simulatedRow } = await adminDb
        .from('user_subscriptions')
        .select('startup_workspace_id, agency_account_id, metadata')
        .eq('user_id', user.id)
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      const provisioned =
        bundleKey === 'startup_dev'
          ? Boolean(simulatedRow?.startup_workspace_id)
          : Boolean(simulatedRow?.agency_account_id);
      if (!simulatedRow || !provisioned) {
        return checkoutFailure(
          'qa_provisioning_failed',
          'QA subscription was created but workspace provisioning did not complete.',
          500,
          { userId: user.id, bundleKey, subscriptionId },
        );
      }

      await completeQaBuyerJourney({
        kv: env.SCAN_CACHE,
        result: {
          token: qaToken,
          userId: user.id,
          email: user.email,
          bundleKey,
          subscriptionId,
          completedAt: new Date().toISOString(),
        },
      });
      structuredLog(
        'qa_buyer_journey_completed',
        { userId: user.id, bundleKey, subscriptionId },
        'info',
      );
      const qaSuccessUrl = new URL(
        buildBillingSubscribeSuccessUrl({ baseUrl, bundleKey }),
      );
      qaSuccessUrl.searchParams.set('qa_simulation', 'complete');
      qaSuccessUrl.searchParams.set('qa_token', qaToken);
      return Response.json({ url: qaSuccessUrl.toString(), qaSimulation: true });
    }

    if (!env.STRIPE_SECRET_KEY?.trim()) {
      return Response.json(
        { error: { code: 'server_misconfigured', message: 'Payment provider not configured.' } },
        { status: 503 }
      );
    }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);

    const { data: userRow } = await adminDb
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    let stripeCustomerId: string = userRow?.stripe_customer_id ?? '';

    if (!stripeCustomerId.trim()) {
      try {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: { user_id: user.id },
        });
        stripeCustomerId = customer.id;
      } catch (error) {
        return checkoutFailure('stripe_customer_create_failed', 'Unable to create Stripe customer.', 502, {
          userId: user.id,
          bundleKey,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }

      await adminDb
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);

      structuredLog('billing_stripe_customer_created', { userId: user.id, customerId: stripeCustomerId }, 'info');
    }

    try {
      await stripe.prices.retrieve(bundle.stripe_price_id);
    } catch (error) {
      return checkoutFailure('bundle_price_invalid', 'This bundle is not linked to a valid Stripe price.', 400, {
        userId: user.id,
        bundleKey,
        priceId: bundle.stripe_price_id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    if (stripeCustomerId.trim() && bundle.stripe_price_id?.trim()) {
      let existingStripeSubs: { data: Array<{ id?: string; status?: string }> };
      try {
        existingStripeSubs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          price: bundle.stripe_price_id,
          status: 'all',
          limit: 5,
        });
      } catch (error) {
        structuredLog(
          'billing_subscribe_stripe_duplicate_check_failed',
          {
            userId: user.id,
            bundleKey,
            error: error instanceof Error ? error.message : 'unknown',
          },
          'warning'
        );
        existingStripeSubs = { data: [] };
      }

      const liveStripeSub = existingStripeSubs.data.find(
        (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'incomplete'
      );
      if (liveStripeSub) {
        structuredLog(
          'billing_subscribe_stripe_duplicate_detected',
          { userId: user.id, bundleKey, stripeSubId: liveStripeSub.id, status: liveStripeSub.status },
          'warning'
        );
        return Response.json(
          {
            error: {
              code: 'already_subscribed',
              message: 'You already have an active subscription for this bundle.',
            },
          },
          { status: 409 }
        );
      }
    }

    const trialDays =
      typeof bundle.trial_period_days === 'number' && bundle.trial_period_days > 0
        ? bundle.trial_period_days
        : 0;

    const successUrl = buildBillingSubscribeSuccessUrl({ baseUrl, bundleKey });
    const cancelUrl = `${baseUrl}/pricing?subscription=cancel`;

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: bundle.stripe_price_id, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user.id,
          bundle_key: bundleKey,
          ...(organizationName ? { organization_name: organizationName } : {}),
          ...(websiteUrl ? { website_url: websiteUrl } : {}),
        },
        subscription_data: {
          ...(trialDays > 0
            ? {
                trial_period_days: trialDays,
                trial_settings: {
                  end_behavior: {
                    missing_payment_method: 'cancel',
                  },
                },
              }
            : {}),
          metadata: {
            user_id: user.id,
            bundle_key: bundleKey,
            ...(organizationName ? { organization_name: organizationName } : {}),
            ...(websiteUrl ? { website_url: websiteUrl } : {}),
          },
        },
      });
    } catch (error) {
      return checkoutFailure('stripe_checkout_failed', 'Unable to start Stripe checkout.', 502, {
        userId: user.id,
        bundleKey,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    if (!session.url) {
      return checkoutFailure('stripe_checkout_missing_url', 'Checkout URL not returned.', 502, {
        userId: user.id,
        bundleKey,
        sessionId: session.id,
      });
    }

    structuredLog(
      'billing_subscribe_session_created',
      {
        userId: user.id,
        bundleKey,
        sessionId: session.id,
        trialDays,
        customerId: stripeCustomerId,
      },
      'info'
    );

    return Response.json({ url: session.url });
  } catch (error) {
    return checkoutFailure('unexpected_checkout_error', 'Unable to start subscription checkout.', 500, {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
