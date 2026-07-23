import { z } from 'zod';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkEmailLeadRateLimit, emailRateKey } from '@/lib/server/rate-limit-kv';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { buildSavedPreviewEmail, sendLeadEmail } from '@/lib/server/lead-email';
import { structuredLogWithClientAndWait } from '@/lib/server/structured-log';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  score: z.number().int().min(0).max(100),
  scanId: z.string().uuid(),
  turnstileToken: z.string().min(1),
  anonymous_id: z.string().max(128).nullish(),
  marketingConsent: z.boolean().optional().default(false),
});

async function hashEmail(email: string): Promise<string> {
  const enc = new TextEncoder().encode(emailRateKey(email));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const ts = await verifyTurnstileToken(
    env.TURNSTILE_SECRET_KEY,
    parsed.data.turnstileToken,
    ip
  );
  if (!ts.ok) {
    return Response.json({ error: { code: 'turnstile_failed', message: ts.error } }, { status: 400 });
  }

  const emailKey = await hashEmail(parsed.data.email);
  const erl = await checkEmailLeadRateLimit(env.SCAN_CACHE, emailKey);
  if (!erl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Daily email limit reached.' } },
      { status: 429, headers: { 'Retry-After': String(erl.retryAfterSec ?? 86400) } }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      email: parsed.data.email,
      url: parsed.data.url,
      score: parsed.data.score,
      scan_id: parsed.data.scanId,
      source: 'organic',
    })
    .select('id')
    .single();

  if (error) {
    return Response.json({ error: { code: 'db_error', message: error.message } }, { status: 500 });
  }

  await emitMarketingEvent(supabase, 'lead_submitted', {
    anonymous_id: parsed.data.anonymous_id,
    scan_id: parsed.data.scanId,
    lead_id: lead.id as string,
    email: parsed.data.email,
    metadata: {
      url: parsed.data.url,
      score: parsed.data.score,
      marketing_consent: parsed.data.marketingConsent,
    },
  });

  const preview = buildSavedPreviewEmail({
    appUrl: env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com',
    scanId: parsed.data.scanId,
    url: parsed.data.url,
    score: parsed.data.score,
  });
  const delivery = await sendLeadEmail({
    env,
    to: parsed.data.email,
    subject: preview.subject,
    html: preview.html,
  });
  await structuredLogWithClientAndWait(
    supabase,
    'lead_preview_delivery',
    {
      lead_id: lead.id as string,
      scan_id: parsed.data.scanId,
      delivered: delivery.ok,
      reason: delivery.reason ?? null,
    },
    delivery.ok ? 'info' : 'warning'
  );

  return Response.json({ ok: true, emailDelivered: delivery.ok });
}
