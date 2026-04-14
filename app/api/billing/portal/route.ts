import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const env = await getPaymentApiEnv();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const userSupabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await userSupabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  }

  // ── Config guards ───────────────────────────────────────────────────────────
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }
  if (!env.STRIPE_SECRET_KEY?.trim()) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }
  const baseUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  // ── Look up Stripe customer ─────────────────────────────────────────────────
  const adminDb = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: userRow } = await adminDb
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  let stripeCustomerId = userRow?.stripe_customer_id ?? '';

  if (!stripeCustomerId) {
    const { data: subRow } = await adminDb
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    stripeCustomerId = subRow?.stripe_customer_id ?? '';
  }

  if (!stripeCustomerId) {
    return Response.json(
      { error: { code: 'no_customer', message: 'No billing account found for your user.' } },
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
