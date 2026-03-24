import { z } from 'zod';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkCheckoutRateLimit } from '@/lib/server/rate-limit-kv';
import { createStripeClient } from '@/lib/server/stripe-client';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scanId: z.string().uuid(),
  turnstileToken: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const ip = getClientIp(request);

  const rl = await checkCheckoutRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many checkout attempts. Try again later.' } },
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
    return Response.json(
      { error: { code: 'turnstile_failed', message: ts.error } },
      { status: 400 }
    );
  }

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID_DEEP_AUDIT) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Stripe is not configured' } },
      { status: 503 }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Database not configured' } },
      { status: 503 }
    );
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'App URL not configured' } },
      { status: 503 }
    );
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .select('id,user_id,status')
    .eq('id', parsed.data.scanId)
    .maybeSingle();

  if (scanErr) {
    return Response.json(
      { error: { code: 'db_error', message: scanErr.message } },
      { status: 500 }
    );
  }
  if (!scan || scan.user_id !== null || scan.status !== 'complete') {
    return Response.json(
      { error: { code: 'invalid_scan', message: 'Scan is not eligible for checkout' } },
      { status: 400 }
    );
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  const scanId = parsed.data.scanId;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: env.STRIPE_PRICE_ID_DEEP_AUDIT, quantity: 1 }],
      success_url: `${baseUrl}/results/${scanId}?checkout=success`,
      cancel_url: `${baseUrl}/results/${scanId}?checkout=cancel`,
      metadata: { scan_id: scanId },
    });

    if (!session.url) {
      return Response.json(
        { error: { code: 'stripe_error', message: 'Checkout URL not returned' } },
        { status: 502 }
      );
    }

    return Response.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'stripe_error';
    return Response.json({ error: { code: 'stripe_error', message: msg } }, { status: 502 });
  }
}
