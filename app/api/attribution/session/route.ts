/**
 * Top-of-funnel pageview beacon. The client fires this once per session (see AttributionInit) so the
 * attribution funnel isn't blind above `scan_started`: it records `session_started` with the visit's
 * UTM / referrer / landing path, keyed to the anonymous id. Best-effort and non-blocking — a failure
 * never affects the page. No PII: only an anonymous id cookie + campaign metadata.
 */
import { z } from 'zod';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkSessionEventRateLimit } from '@/lib/server/rate-limit-kv';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';

const nullableShort = z.string().max(500).nullish();

const bodySchema = z.object({
  anonymous_id: z.string().max(128).nullish(),
  utm_source: nullableShort,
  utm_medium: nullableShort,
  utm_campaign: nullableShort,
  utm_content: nullableShort,
  utm_term: nullableShort,
  referrer_url: z.string().max(2048).nullish(),
  landing_path: z.string().max(2048).nullish(),
});

const ANON_COOKIE = 'gp_anon_id';

function anonFromCookie(request: Request): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  const m = raw.match(new RegExp(`(?:^|; )${ANON_COOKIE}=([^;]*)`));
  return m?.[1] ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const ip = getClientIp(request);

  const rl = await checkSessionEventRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    // Silently accept — a rate-limited beacon must never surface an error to the page.
    return Response.json({ ok: true, throttled: true });
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ ok: true });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: true });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // Prefer the server-visible cookie for the anonymous id; fall back to the client-reported value.
  const anonymousId = anonFromCookie(request) ?? parsed.data.anonymous_id ?? null;

  await emitMarketingEvent(supabase, 'session_started', {
    anonymous_id: anonymousId,
    utm_source: parsed.data.utm_source ?? null,
    utm_medium: parsed.data.utm_medium ?? null,
    utm_campaign: parsed.data.utm_campaign ?? null,
    utm_content: parsed.data.utm_content ?? null,
    utm_term: parsed.data.utm_term ?? null,
    referrer_url: parsed.data.referrer_url ?? null,
    landing_path: parsed.data.landing_path ?? null,
  });

  return Response.json({ ok: true });
}
