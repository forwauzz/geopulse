'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import {
  loadAutomationSetting,
  updateAutomationSetting,
  type AutomationFeature,
} from '@/lib/server/automation-settings';
import { runRevenueAgency, type RevenueAgencyMode } from '@/lib/server/revenue-agency-agent';
import {
  runSocialProofAgent,
  type SocialProofAgentMode,
} from '@/lib/server/social-proof-agent';
import { getPaymentApiEnv } from '@/lib/server/cf-env';

const TOGGLEABLE: ReadonlySet<AutomationFeature> = new Set<AutomationFeature>([
  'outreach_sweep',
  'research_agent',
  'report_design_agent',
  'marketing_autopilot',
  'competitor_benchmark',
  'engagement_digest',
  'social_proof_agent',
  'revenue_agency',
]);

export async function setAgentFlag(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const feature = String(formData.get('feature') ?? '') as AutomationFeature;
  const field = String(formData.get('field') ?? '');
  const value = String(formData.get('value') ?? '') === 'true';
  if (!TOGGLEABLE.has(feature)) return;
  if (field !== 'enabled' && field !== 'kill_switch') return;

  await updateAutomationSetting(
    ctx.adminDb,
    feature,
    field === 'enabled' ? { enabled: value } : { killSwitch: value },
    ctx.user.id
  );
  revalidatePath('/admin/agents');
  revalidatePath('/admin/automation');
}

function checked(formData: FormData, name: string): boolean {
  return String(formData.get(name) ?? '') === 'on';
}

function intField(
  formData: FormData,
  name: string,
  fallback: number,
  max: number,
  min = 1
): number {
  const parsed = Number.parseInt(String(formData.get(name) ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
}

export async function saveSocialProofAgent(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const rawMode = String(formData.get('mode') ?? 'off');
  const mode: SocialProofAgentMode =
    rawMode === 'draft' || rawMode === 'approval' || rawMode === 'autonomous'
      ? rawMode
      : 'off';
  const current = await loadAutomationSetting(ctx.adminDb, 'social_proof_agent');
  await updateAutomationSetting(
    ctx.adminDb,
    'social_proof_agent',
    {
      enabled: mode !== 'off',
      config: {
        ...current.config,
        mode,
        daily_cap: intField(formData, 'dailyCap', 2, 5),
        before_after_enabled: checked(formData, 'beforeAfterEnabled'),
        audit_screenshots_enabled: checked(formData, 'auditScreenshotsEnabled'),
        aggregate_data_enabled: checked(formData, 'aggregateDataEnabled'),
        educational_enabled: checked(formData, 'educationalEnabled'),
        client_proof_enabled: checked(formData, 'clientProofEnabled'),
        carousel_enabled: checked(formData, 'carouselEnabled'),
        reels_enabled: checked(formData, 'reelsEnabled'),
        min_aggregate_sample_size: intField(formData, 'minAggregateSampleSize', 20, 500),
      },
    },
    ctx.user.id
  );
  revalidatePath('/admin/agents');
}

export async function saveRevenueAgency(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const rawMode = String(formData.get('mode') ?? 'off');
  const mode: RevenueAgencyMode =
    rawMode === 'observe' || rawMode === 'assist' || rawMode === 'autonomous'
      ? rawMode
      : 'off';
  const current = await loadAutomationSetting(ctx.adminDb, 'revenue_agency');
  await updateAutomationSetting(
    ctx.adminDb,
    'revenue_agency',
    {
      enabled: mode !== 'off',
      config: {
        ...current.config,
        mode,
        run_hour_utc: intField(formData, 'runHourUtc', 14, 23, 0),
        social_proof_enabled: checked(formData, 'socialProofEnabled'),
        nurture_enabled: checked(formData, 'nurtureEnabled'),
        nurture_daily_cap: intField(formData, 'nurtureDailyCap', 5, 20),
        nurture_delay_hours: intField(formData, 'nurtureDelayHours', 24, 168),
      },
    },
    ctx.user.id
  );
  revalidatePath('/admin/agents');
}

export async function runSocialProofNow(): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const appUrl =
    process.env['NEXT_PUBLIC_APP_URL']?.trim() ||
    ctx.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://getgeopulse.com';
  await runSocialProofAgent({ supabase: ctx.adminDb, appUrl, force: true });
  revalidatePath('/admin/agents');
  revalidatePath('/dashboard/distribution');
}

export async function runRevenueAgencyNow(): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const appUrl =
    process.env['NEXT_PUBLIC_APP_URL']?.trim() ||
    ctx.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://getgeopulse.com';
  const env = await getPaymentApiEnv();
  await runRevenueAgency({ supabase: ctx.adminDb, appUrl, env, force: true });
  revalidatePath('/admin/agents');
  revalidatePath('/dashboard/distribution');
}
