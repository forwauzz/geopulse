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
import { getPaymentApiEnv, getSocialProductionEnv } from '@/lib/server/cf-env';

const WORKFORCE_IDS = new Set(['maya', 'noah', 'priya', 'elena', 'sofia', 'jordan', 'marcus']);
const AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function textField(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validAvatarUrl(value: string): boolean {
  if (value.startsWith('/team/')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function saveWorkforceProfile(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = textField(formData, 'id', 20);
  const name = textField(formData, 'name', 80);
  const role = textField(formData, 'role', 100);
  const job = textField(formData, 'job', 500);
  let avatarUrl = String(formData.get('avatarUrl') ?? '').trim().slice(0, 1000);
  if (!WORKFORCE_IDS.has(id) || name.length < 2 || role.length < 2 || job.length < 10) return;

  const avatar = formData.get('avatar');
  if (avatar instanceof File && avatar.size > 0) {
    const extension = AVATAR_TYPES.get(avatar.type);
    if (!extension || avatar.size > 3_000_000) return;
    const production = await getSocialProductionEnv();
    const base = production.SOCIAL_MEDIA_PUBLIC_BASE?.replace(/\/$/, '');
    if (!production.REPORT_FILES || !base) return;
    const key = `team/avatars/${id}-${Date.now()}.${extension}`;
    await production.REPORT_FILES.put(key, await avatar.arrayBuffer(), {
      httpMetadata: {
        contentType: avatar.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    avatarUrl = `${base}/${key}`;
  }
  if (!validAvatarUrl(avatarUrl)) return;

  const { error } = await ctx.adminDb.from('workforce_profiles').upsert(
    {
      id,
      name,
      role,
      job,
      avatar_url: avatarUrl,
      updated_by_user_id: ctx.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error('Could not save the employee profile.');
  revalidatePath('/admin/agents');
  revalidatePath('/admin/campaigns');
  revalidatePath('/admin/automation');
}

const TOGGLEABLE: ReadonlySet<AutomationFeature> = new Set<AutomationFeature>([
  'seo_agent',
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

function postingHours(formData: FormData): number[] {
  const values = String(formData.get('postingHoursLocal') ?? '9,12,15,19')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 23);
  const unique = [...new Set(values)].sort((a, b) => a - b).slice(0, 5);
  return unique.length > 0 ? unique : [9, 12, 15, 19];
}

function reelDays(formData: FormData): number[] {
  const values = String(formData.get('reelDaysLocal') ?? '0,2,4,6')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6);
  const unique = [...new Set(values)].slice(0, 7);
  return unique.length > 0 ? unique : [0, 2, 4, 6];
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
        daily_cap: intField(formData, 'dailyCap', 4, 5),
        before_after_enabled: checked(formData, 'beforeAfterEnabled'),
        audit_screenshots_enabled: checked(formData, 'auditScreenshotsEnabled'),
        aggregate_data_enabled: checked(formData, 'aggregateDataEnabled'),
        educational_enabled: checked(formData, 'educationalEnabled'),
        industry_humor_enabled: checked(formData, 'industryHumorEnabled'),
        client_proof_enabled: checked(formData, 'clientProofEnabled'),
        carousel_enabled: checked(formData, 'carouselEnabled'),
        reels_enabled: checked(formData, 'reelsEnabled'),
        reels_per_week: intField(formData, 'reelsPerWeek', 4, 7),
        reel_days_local: reelDays(formData),
        reel_publish_mode:
          String(formData.get('reelPublishMode') ?? 'autonomous') === 'draft'
            ? 'draft'
            : 'autonomous',
        reel_categories: [
          ...(checked(formData, 'reelTimelyEnabled') ? ['timely'] : []),
          ...(checked(formData, 'reelEducationalEnabled') ? ['educational'] : []),
          ...(checked(formData, 'reelHumorEnabled') ? ['humor'] : []),
          ...(checked(formData, 'reelProofEnabled') ? ['proof'] : []),
        ],
        trend_research_enabled: checked(formData, 'trendResearchEnabled'),
        learning_enabled: checked(formData, 'learningEnabled'),
        min_aggregate_sample_size: intField(formData, 'minAggregateSampleSize', 20, 500),
        timezone: String(formData.get('timezone') ?? 'America/Toronto').trim() || 'America/Toronto',
        posting_hours_local: postingHours(formData),
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
        prospecting_enabled: checked(formData, 'prospectingEnabled'),
        prospecting_daily_cap: intField(formData, 'prospectingDailyCap', 5, 10),
        prospecting_markets: String(formData.get('prospectingMarkets') ?? '').trim() || 'Toronto, Canada',
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
  await runSocialProofAgent({
    supabase: ctx.adminDb,
    appUrl,
    env: await getSocialProductionEnv(),
    force: true,
  });
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
  const env = {
    ...(await getPaymentApiEnv()),
    ...(await getSocialProductionEnv()),
  };
  await runRevenueAgency({ supabase: ctx.adminDb, appUrl, env, force: true });
  revalidatePath('/admin/agents');
  revalidatePath('/dashboard/distribution');
}
