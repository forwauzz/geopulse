import { z } from 'zod';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkSessionEventRateLimit } from '@/lib/server/rate-limit-kv';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { optionalAttributionFields } from '@services/marketing-attribution/attribution-params';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scan_id: z.string().uuid(),
}).extend(optionalAttributionFields.shape);

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const rl = await checkSessionEventRateLimit(env.SCAN_CACHE, getClientIp(request));
  if (!rl.ok || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ ok: true });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: true });

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  await emitMarketingEvent(supabase, 'report_viewed', {
    anonymous_id: parsed.data.anonymous_id,
    scan_id: parsed.data.scan_id,
    utm_source: parsed.data.utm_source,
    utm_medium: parsed.data.utm_medium,
    utm_campaign: parsed.data.utm_campaign,
    utm_content: parsed.data.utm_content,
    utm_term: parsed.data.utm_term,
    referrer_url: parsed.data.referrer_url,
    landing_path: parsed.data.landing_path,
    channel: parsed.data.utm_source ?? 'direct_or_unknown',
    metadata: { surface: 'web_report' },
  });

  return Response.json({ ok: true });
}
