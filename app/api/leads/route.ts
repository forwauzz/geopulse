import { z } from 'zod';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkEmailLeadRateLimit, emailRateKey } from '@/lib/server/rate-limit-kv';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  score: z.number().int().min(0).max(100),
  scanId: z.string().uuid(),
  turnstileToken: z.string().min(1),
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
  const env = await getScanApiEnv();

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

  const { error } = await supabase.from('leads').insert({
    email: parsed.data.email,
    url: parsed.data.url,
    score: parsed.data.score,
    source: 'organic',
  });

  if (error) {
    return Response.json({ error: { code: 'db_error', message: error.message } }, { status: 500 });
  }

  return Response.json({ ok: true });
}
