import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createStripeClient } from '@/lib/server/stripe-client';
import { structuredError } from '@/lib/server/structured-log';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

function databaseUnavailable(stage: string, error: unknown): Response {
  const errorCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'unavailable';
  structuredError('billing_portal_database_unavailable', { stage, errorCode });
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message:
          'Billing management is temporarily unavailable. Please try again shortly.',
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

export async function POST(): Promise<Response> {
  const env = await getPaymentApiEnv();

  // ── Auth ────────────────────────────────────────────────────────────────────
  let authResult;
  try {
    const userSupabase = await createSupabaseServerClient();
    authResult = await userSupabase.auth.getUser();
  } catch (error) {
    return databaseUnavailable('auth_lookup', error);
  }
  const {
    data: { user },
    error: authErr,
  } = authResult;
  if (authErr) {
    return databaseUnavailable('auth_lookup', authErr);
  }
  if (!user) {
    return Response.json(
      { error: { code: 'unauthenticated' } },
      { status: 401 }
    );
  }

  // ── Config guards ───────────────────────────────────────────────────────────
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured' } },
      { status: 503 }
    );
  }
  if (!env.STRIPE_SECRET_KEY?.trim()) {
    return Response.json(
      { error: { code: 'server_misconfigured' } },
      { status: 503 }
    );
  }
  const baseUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json(
      { error: { code: 'server_misconfigured' } },
      { status: 503 }
    );
  }

  // ── Look up Stripe customer ─────────────────────────────────────────────────
  const adminDb = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  let userResult;
  try {
    userResult = await adminDb
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

  let stripeCustomerId = userRow?.stripe_customer_id ?? '';

  if (!stripeCustomerId) {
    let subscriptionResult;
    try {
      subscriptionResult = await adminDb
        .from('user_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    } catch (error) {
      return databaseUnavailable('subscription_customer_lookup', error);
    }
    const { data: subRow, error: subscriptionError } = subscriptionResult;
    if (subscriptionError) {
      return databaseUnavailable(
        'subscription_customer_lookup',
        subscriptionError
      );
    }
    stripeCustomerId = subRow?.stripe_customer_id ?? '';
  }

  if (!stripeCustomerId && user.email) {
    let monitorResult;
    try {
      monitorResult = await adminDb
        .from('monitoring_subscriptions')
        .select('stripe_customer_id')
        .eq('email', user.email.trim().toLowerCase())
        .not('stripe_customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    } catch (error) {
      return databaseUnavailable('monitor_customer_lookup', error);
    }
    const { data: monitorRow, error: monitorError } = monitorResult;
    if (monitorError) {
      return databaseUnavailable('monitor_customer_lookup', monitorError);
    }
    stripeCustomerId = monitorRow?.stripe_customer_id ?? '';
  }

  if (!stripeCustomerId) {
    return Response.json(
      {
        error: {
          code: 'no_customer',
          message: 'No billing account found for your user.',
        },
      },
      { status: 404 }
    );
  }

  // ── Create Stripe billing portal session ────────────────────────────────────
  try {
    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl}/dashboard/billing`,
    });
    return Response.json({ url: session.url });
  } catch {
    return Response.json(
      {
        error: {
          code: 'portal_unavailable',
          message: 'Billing portal is not yet configured. Contact support.',
        },
      },
      { status: 503 }
    );
  }
}
