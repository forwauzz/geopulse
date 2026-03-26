import type Stripe from 'stripe';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createStripeClient } from '@/lib/server/stripe-client';
import { handleCheckoutSessionCompleted } from '@/lib/server/stripe/checkout-completed';
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
    return Response.json(
      { error: { code: result.reason, message: result.reason } },
      { status: result.status }
    );
  }

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
