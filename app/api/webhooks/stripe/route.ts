import type Stripe from 'stripe';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createStripeClient } from '@/lib/server/stripe-client';
import { handleCheckoutSessionCompleted } from '@/lib/server/stripe/checkout-completed';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

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
    return new Response(result.reason, { status: result.status });
  }

  return new Response(null, { status: 200 });
}
