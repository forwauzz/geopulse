/**
 * Admin control surface for the autonomous marketing autopilot (Loop 5b).
 *
 *   GET  → config + channel-access status + recent autopilot-proposed content briefs.
 *   POST { action: 'run' } → run the autopilot now (force; kill switch still wins). Proposes
 *          review-gated content briefs for weak topics. Does NOT publish.
 *
 * Auth: platform-admin SESSION, OR `x-marketing-autopilot-secret` matching
 * MARKETING_AUTOPILOT_TRIGGER_SECRET (headless cron/CI).
 */
import { z } from 'zod';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveMarketingAutopilotConfig, runMarketingAutopilot } from '@/lib/server/marketing-autopilot';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Auth = { ok: true; via: 'session' | 'secret' } | { ok: false };

async function authorize(request: Request, triggerSecret: string | undefined): Promise<Auth> {
  const provided = request.headers.get('x-marketing-autopilot-secret');
  if (triggerSecret && provided && provided === triggerSecret) return { ok: true, via: 'secret' };
  const ctx = await loadAdminActionContext();
  if (ctx.ok) return { ok: true, via: 'session' };
  return { ok: false };
}

export async function GET(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const auth = await authorize(request, env.MARKETING_AUTOPILOT_TRIGGER_SECRET);
  if (!auth.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'misconfigured' }, { status: 503 });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const config = resolveMarketingAutopilotConfig(env);
  const { data: connected } = await supabase.from('distribution_accounts').select('id').eq('status', 'connected').limit(1);
  const { data: proposals } = await supabase
    .from('content_items')
    .select('content_id, slug, title, status, topic_cluster, created_at')
    .eq('metadata->>proposed_by', 'marketing_autopilot')
    .order('created_at', { ascending: false })
    .limit(20);

  return Response.json({
    config,
    channelAccess: Array.isArray(connected) && connected.length > 0 ? 'available' : 'required',
    proposals: proposals ?? [],
  });
}

const bodySchema = z.object({ action: z.literal('run') });

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const auth = await authorize(request, env.MARKETING_AUTOPILOT_TRIGGER_SECRET);
  if (!auth.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'misconfigured' }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!bodySchema.safeParse(json).success) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await runMarketingAutopilot({
    supabase,
    env,
    triggerSource: auth.via === 'secret' ? 'ci' : 'admin_manual',
    force: true,
  });
  structuredLog('marketing_autopilot_manual_run', {
    via: auth.via,
    status: result.status,
    batch: result.batch ?? null,
    proposed: result.proposedCount ?? 0,
    channel_access: result.channelAccess ?? null,
  }, 'info');
  return Response.json(result);
}
