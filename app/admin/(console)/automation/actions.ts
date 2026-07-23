'use server';

import { revalidatePath } from 'next/cache';
import { getAutonomousEditorialEnv, getPaymentApiEnv } from '@/lib/server/cf-env';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { loadAutomationSetting, updateAutomationSetting, configInt } from '@/lib/server/automation-settings';
import { runSelfImprovementAudit } from '@/lib/server/self-improvement';
import { runMarketingAutopilot } from '@/lib/server/marketing-autopilot';
import { runAutonomousEditorialEngine } from '@/lib/server/autonomous-editorial-engine';
import { createAutonomousEditorialProvider } from '@/lib/server/autonomous-editorial-providers';

const AUTOMATION_PATH = '/admin/automation';

type Ctx = { userId: string; env: Awaited<ReturnType<typeof getPaymentApiEnv>>; supabase: ReturnType<typeof createServiceRoleClient> };

async function requireConsole(): Promise<Ctx | { error: string }> {
  const env = await getPaymentApiEnv();
  if (env.AUTOMATION_CONSOLE_ENABLED?.trim().toLowerCase() !== 'true') return { error: 'console_disabled' };
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return { error: 'unauthorized' };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'misconfigured' };
  return { userId: ctx.user.id, env, supabase: createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) };
}

const SELF_BOOL_FIELDS = new Set(['enabled', 'kill_switch', 'autonomous_ship_enabled']);

export async function setSelfImprovementFlag(formData: FormData): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  const field = String(formData.get('field') ?? '');
  const value = String(formData.get('value') ?? '') === 'true';
  if (!SELF_BOOL_FIELDS.has(field)) return;
  await ctx.supabase
    .from('self_improvement_settings')
    .update({ [field]: value, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', 1);
  revalidatePath(AUTOMATION_PATH);
}

export async function setSelfImprovementRecipient(formData: FormData): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  const recipient = String(formData.get('recipient') ?? '').trim() || null;
  await ctx.supabase
    .from('self_improvement_settings')
    .update({ report_recipient: recipient, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', 1);
  revalidatePath(AUTOMATION_PATH);
}

export async function setMarketingFlag(formData: FormData): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  const field = String(formData.get('field') ?? '');
  const value = String(formData.get('value') ?? '') === 'true';
  if (field !== 'enabled' && field !== 'kill_switch') return;
  await updateAutomationSetting(
    ctx.supabase,
    'marketing_autopilot',
    field === 'enabled' ? { enabled: value } : { killSwitch: value },
    ctx.userId
  );
  revalidatePath(AUTOMATION_PATH);
}

export async function setDesignAgentFlag(formData: FormData): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  const field = String(formData.get('field') ?? '');
  const value = String(formData.get('value') ?? '') === 'true';
  if (field !== 'enabled' && field !== 'kill_switch') return;
  await updateAutomationSetting(
    ctx.supabase,
    'report_design_agent',
    field === 'enabled' ? { enabled: value } : { killSwitch: value },
    ctx.userId
  );
  revalidatePath(AUTOMATION_PATH);
}

export async function setMarketingCap(formData: FormData): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  const cap = Number.parseInt(String(formData.get('cap') ?? ''), 10);
  const setting = await loadAutomationSetting(ctx.supabase, 'marketing_autopilot');
  const dailyCap = Number.isFinite(cap) && cap > 0 ? Math.min(cap, 10) : configInt(setting.config, 'daily_cap', 2);
  await updateAutomationSetting(ctx.supabase, 'marketing_autopilot', { config: { ...setting.config, daily_cap: dailyCap } }, ctx.userId);
  revalidatePath(AUTOMATION_PATH);
}

export async function runSelfImprovementNow(): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  await runSelfImprovementAudit({ supabase: ctx.supabase, env: ctx.env, triggerSource: 'admin_manual', force: true });
  revalidatePath(AUTOMATION_PATH);
}

export async function runMarketingNow(): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  await runMarketingAutopilot({ supabase: ctx.supabase, env: ctx.env, triggerSource: 'admin_manual', force: true });
  revalidatePath(AUTOMATION_PATH);
}

/** Runs planner + writer + hero + reviewer + publish gates in the same authenticated control plane. */
export async function runEditorialPipelineNow(): Promise<void> {
  const ctx = await requireConsole();
  if ('error' in ctx) return;
  await runMarketingAutopilot({ supabase: ctx.supabase, env: ctx.env, triggerSource: 'admin_manual', force: true });
  const editorialEnv = await getAutonomousEditorialEnv();
  await runAutonomousEditorialEngine({
    supabase: ctx.supabase,
    provider: createAutonomousEditorialProvider(editorialEnv),
  });
  revalidatePath(AUTOMATION_PATH);
}
