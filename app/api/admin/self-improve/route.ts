/**
 * Admin control surface for the autonomous self-improvement loop (Loop 5a).
 *
 *   GET  → recent runs + current settings.
 *   POST { action: 'run' }              → trigger a self-audit now (force; kill switch still wins).
 *   POST { action: 'update_settings' }  → toggle enabled / kill switch / autonomous ship / recipient.
 *
 * Auth: a platform-admin SESSION, OR the `x-self-improve-secret` header matching
 * SELF_IMPROVEMENT_TRIGGER_SECRET (headless cron/CI). Settings changes require a session admin.
 */
import { z } from 'zod';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { runSelfImprovementAudit, loadSelfImprovementSettings } from '@/lib/server/self-improvement';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Auth = { ok: true; via: 'session' | 'secret'; userId: string | null } | { ok: false };

async function authorize(request: Request, triggerSecret: string | undefined): Promise<Auth> {
  const provided = request.headers.get('x-self-improve-secret');
  if (triggerSecret && provided && provided === triggerSecret) {
    return { ok: true, via: 'secret', userId: null };
  }
  const ctx = await loadAdminActionContext();
  if (ctx.ok) return { ok: true, via: 'session', userId: ctx.user.id };
  return { ok: false };
}

export async function GET(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const auth = await authorize(request, env.SELF_IMPROVEMENT_TRIGGER_SECRET);
  if (!auth.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'misconfigured' }, { status: 503 });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const settings = await loadSelfImprovementSettings(supabase);
  const { data: runs } = await supabase
    .from('self_improvement_runs')
    .select('id, created_at, trigger_source, status, score, letter_grade, pr_url, emailed_to, error')
    .order('created_at', { ascending: false })
    .limit(20);

  return Response.json({ settings, runs: runs ?? [] });
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run') }),
  z.object({
    action: z.literal('update_settings'),
    enabled: z.boolean().optional(),
    killSwitch: z.boolean().optional(),
    autonomousShipEnabled: z.boolean().optional(),
    reportRecipient: z.string().email().nullish(),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  const auth = await authorize(request, env.SELF_IMPROVEMENT_TRIGGER_SECRET);
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }

  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (parsed.data.action === 'update_settings') {
    // Config changes are a human-admin action, never headless.
    if (auth.via !== 'session') return Response.json({ error: 'forbidden' }, { status: 403 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.userId };
    if (parsed.data.enabled !== undefined) patch['enabled'] = parsed.data.enabled;
    if (parsed.data.killSwitch !== undefined) patch['kill_switch'] = parsed.data.killSwitch;
    if (parsed.data.autonomousShipEnabled !== undefined) patch['autonomous_ship_enabled'] = parsed.data.autonomousShipEnabled;
    if (parsed.data.reportRecipient !== undefined) patch['report_recipient'] = parsed.data.reportRecipient;
    const { error } = await supabase.from('self_improvement_settings').update(patch).eq('id', 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    structuredLog('self_improvement_settings_updated', { via: auth.via, keys: Object.keys(patch).join(',') }, 'info');
    const settings = await loadSelfImprovementSettings(supabase);
    return Response.json({ ok: true, settings });
  }

  // action === 'run'
  const result = await runSelfImprovementAudit({
    supabase,
    env,
    triggerSource: auth.via === 'secret' ? 'ci' : 'admin_manual',
    force: true,
  });
  structuredLog('self_improvement_manual_run', { via: auth.via, status: result.status, score: result.score ?? null }, 'info');
  return Response.json(result, { status: result.ok ? 200 : 200 });
}
