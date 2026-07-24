/**
 * Revenue Agency orchestrator.
 *
 * This is intentionally a thin control layer over the agents GEO-Pulse already trusts:
 * outreach acquires, scans/reports diagnose, social proof distributes evidence, Stripe converts,
 * and monitoring retains. The orchestrator measures the hand-offs, identifies the current
 * bottleneck, and (in autonomous mode) asks the proof agent to replenish the distribution queue.
 *
 * No lead is auto-enrolled and no customer proof is exposed here. Outreach remains restricted to
 * admin-added prospects and the Social Proof Agent keeps its own consent/claim gates.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAutomationSetting } from './automation-settings';
import { runSocialProofAgent, type SocialProofAgentResult } from './social-proof-agent';
import { structuredLogWithClientAndWait } from './structured-log';
import { runRevenueNurtureAgent, type RevenueNurtureResult } from './revenue-nurture-agent';
import type { LeadEmailEnv } from './lead-email';
import {
  runAgencyProspectingAgent,
  type AgencyProspectingEnv,
  type AgencyProspectingResult,
} from './agency-prospecting-agent';

export type RevenueAgencyMode = 'off' | 'observe' | 'assist' | 'autonomous';

export type RevenueAgencyConfig = {
  readonly mode: RevenueAgencyMode;
  readonly runHourUtc: number;
  readonly socialProofEnabled: boolean;
  readonly nurtureEnabled: boolean;
  readonly nurtureDailyCap: number;
  readonly nurtureDelayHours: number;
  readonly prospectingEnabled: boolean;
  readonly prospectingDailyCap: number;
  readonly prospectingMarkets: readonly string[];
};

export type RevenueStage = {
  readonly key: 'acquire' | 'diagnose' | 'prove' | 'convert' | 'retain';
  readonly label: string;
  readonly value: number;
  readonly status: 'healthy' | 'attention' | 'waiting';
  readonly detail: string;
};

export type RevenueAgencySnapshot = {
  readonly windowDays: number;
  readonly leads: number;
  readonly convertedLeads: number;
  readonly activeProspects: number;
  readonly outreachSends: number;
  readonly outreachOpens: number;
  readonly completedScans: number;
  readonly deliveredReports: number;
  readonly proofAssets: number;
  readonly publishedProof: number;
  readonly activeMonitoring: number;
  readonly pastDueMonitoring: number;
  readonly activeAgencyAccounts: number;
  readonly stages: RevenueStage[];
  readonly focus: RevenueStage['key'];
  readonly focusReason: string;
};

export type RevenueAgencyRunResult = {
  readonly status: 'completed' | 'skipped' | 'failed';
  readonly mode: RevenueAgencyMode;
  readonly snapshot?: RevenueAgencySnapshot;
  readonly proof?: SocialProofAgentResult;
  readonly nurture?: RevenueNurtureResult;
  readonly prospecting?: AgencyProspectingResult;
  readonly reason?: string;
};

function positiveInt(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), max)
    : fallback;
}

export function resolveRevenueAgencyConfig(
  config: Record<string, unknown>,
  enabled: boolean,
  killed: boolean
): RevenueAgencyConfig {
  const rawMode = typeof config['mode'] === 'string' ? config['mode'] : '';
  const mode: RevenueAgencyMode =
    killed || !enabled
      ? 'off'
      : rawMode === 'observe' || rawMode === 'assist' || rawMode === 'autonomous'
        ? rawMode
        : 'observe';
  return {
    mode,
    runHourUtc: positiveInt(config['run_hour_utc'], 14, 23),
    socialProofEnabled:
      typeof config['social_proof_enabled'] === 'boolean'
        ? config['social_proof_enabled']
        : true,
    nurtureEnabled:
      typeof config['nurture_enabled'] === 'boolean' ? config['nurture_enabled'] : false,
    nurtureDailyCap: positiveInt(config['nurture_daily_cap'], 5, 20),
    nurtureDelayHours: positiveInt(config['nurture_delay_hours'], 24, 168),
    prospectingEnabled:
      typeof config['prospecting_enabled'] === 'boolean' ? config['prospecting_enabled'] : false,
    prospectingDailyCap: positiveInt(config['prospecting_daily_cap'], 5, 10),
    prospectingMarkets:
      typeof config['prospecting_markets'] === 'string'
        ? config['prospecting_markets'].split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12)
        : ['Toronto, Canada'],
  };
}

async function safeCount(
  supabase: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<number> {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export function chooseRevenueAgencyFocus(values: {
  leads: number;
  activeProspects: number;
  completedScans: number;
  proofAssets: number;
  convertedLeads: number;
  activeMonitoring: number;
}): { focus: RevenueStage['key']; reason: string } {
  if (values.leads + values.activeProspects === 0) {
    return { focus: 'acquire', reason: 'The loop needs qualified prospects before any downstream stage can compound.' };
  }
  if (values.completedScans === 0) {
    return { focus: 'diagnose', reason: 'Prospects exist, but there is no recent audit evidence to turn into value.' };
  }
  if (values.proofAssets === 0) {
    return { focus: 'prove', reason: 'Audit evidence exists, but none has been packaged into safe distribution assets yet.' };
  }
  if (values.convertedLeads === 0) {
    return { focus: 'convert', reason: 'The top of funnel is working, but no recent lead has crossed into a paid relationship.' };
  }
  if (values.activeMonitoring === 0) {
    return { focus: 'retain', reason: 'Conversions exist, but recurring monitoring has not become the retention layer yet.' };
  }
  return { focus: 'acquire', reason: 'The full loop is active; the next constraint is adding more qualified demand.' };
}

export async function loadRevenueAgencySnapshot(
  supabase: SupabaseClient,
  now = new Date(),
  windowDays = 30
): Promise<RevenueAgencySnapshot> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [
    leads,
    convertedLeads,
    activeProspects,
    outreachSends,
    outreachOpens,
    completedScans,
    deliveredReports,
    proofAssets,
    publishedProof,
    activeMonitoring,
    pastDueMonitoring,
    activeAgencyAccounts,
  ] = await Promise.all([
    safeCount(supabase, 'leads', (q) => q.gte('created_at', since)),
    safeCount(supabase, 'leads', (q) => q.eq('converted', true).gte('converted_at', since)),
    safeCount(supabase, 'outreach_prospects', (q) => q.eq('enabled', true)),
    safeCount(supabase, 'outreach_sends', (q) => q.gte('sent_at', since)),
    safeCount(supabase, 'outreach_sends', (q) => q.not('opened_at', 'is', null).gte('sent_at', since)),
    safeCount(supabase, 'scans', (q) => q.eq('status', 'complete').gte('created_at', since)),
    safeCount(supabase, 'reports', (q) => q.not('email_delivered_at', 'is', null).gte('created_at', since)),
    safeCount(supabase, 'distribution_assets', (q) =>
      q.eq('metadata->>created_by_agent', 'social_proof_agent').gte('created_at', since)
    ),
    safeCount(supabase, 'distribution_jobs', (q) => q.eq('status', 'published').gte('completed_at', since)),
    safeCount(supabase, 'monitoring_subscriptions', (q) => q.eq('status', 'active')),
    safeCount(supabase, 'monitoring_subscriptions', (q) => q.eq('status', 'past_due')),
    safeCount(supabase, 'agency_accounts', (q) => q.eq('status', 'active')),
  ]);

  const focus = chooseRevenueAgencyFocus({
    leads,
    activeProspects,
    completedScans,
    proofAssets,
    convertedLeads,
    activeMonitoring,
  });

  const stages: RevenueStage[] = [
    {
      key: 'acquire',
      label: 'Acquire',
      value: leads + activeProspects,
      status: leads + activeProspects > 0 ? 'healthy' : 'attention',
      detail: `${leads} new leads · ${activeProspects} active outreach prospects`,
    },
    {
      key: 'diagnose',
      label: 'Diagnose',
      value: completedScans,
      status: completedScans > 0 ? 'healthy' : 'waiting',
      detail: `${completedScans} completed scans · ${deliveredReports} reports delivered`,
    },
    {
      key: 'prove',
      label: 'Prove',
      value: proofAssets,
      status: proofAssets > 0 ? 'healthy' : completedScans > 0 ? 'attention' : 'waiting',
      detail: `${proofAssets} proof assets · ${publishedProof} distribution jobs published`,
    },
    {
      key: 'convert',
      label: 'Convert',
      value: convertedLeads,
      status: convertedLeads > 0 ? 'healthy' : leads + activeProspects > 0 ? 'attention' : 'waiting',
      detail: `${convertedLeads} converted leads · ${outreachOpens}/${outreachSends} tracked email opens`,
    },
    {
      key: 'retain',
      label: 'Retain',
      value: activeMonitoring,
      status: activeMonitoring > 0 && pastDueMonitoring === 0 ? 'healthy' : activeMonitoring > 0 ? 'attention' : 'waiting',
      detail: `${activeMonitoring} active monitoring · ${pastDueMonitoring} past due · ${activeAgencyAccounts} agency accounts`,
    },
  ];

  return {
    windowDays,
    leads,
    convertedLeads,
    activeProspects,
    outreachSends,
    outreachOpens,
    completedScans,
    deliveredReports,
    proofAssets,
    publishedProof,
    activeMonitoring,
    pastDueMonitoring,
    activeAgencyAccounts,
    stages,
    focus: focus.focus,
    focusReason: focus.reason,
  };
}

async function alreadyRanToday(supabase: SupabaseClient, now: Date): Promise<boolean> {
  try {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { count, error } = await supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'revenue_agency_run')
      .eq('data->>status', 'completed')
      .gte('created_at', start.toISOString());
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function runRevenueAgency(args: {
  readonly supabase: SupabaseClient;
  readonly appUrl: string;
  readonly env?: LeadEmailEnv & AgencyProspectingEnv;
  readonly force?: boolean;
  readonly now?: Date;
}): Promise<RevenueAgencyRunResult> {
  const now = args.now ?? new Date();
  const setting = await loadAutomationSetting(args.supabase, 'revenue_agency');
  const config = resolveRevenueAgencyConfig(setting.config, setting.enabled, setting.killSwitch);
  const mode = args.force && config.mode === 'off' && !setting.killSwitch ? 'observe' : config.mode;
  if (mode === 'off') {
    return { status: 'skipped', mode, reason: setting.killSwitch ? 'kill_switch' : 'disabled' };
  }
  if (!args.force && (await alreadyRanToday(args.supabase, now))) {
    return { status: 'skipped', mode, reason: 'already_ran_today' };
  }

  try {
    const snapshot = await loadRevenueAgencySnapshot(args.supabase, now);
    const marketIndex = Math.floor(now.getTime() / 86_400_000) % Math.max(config.prospectingMarkets.length, 1);
    const market = config.prospectingMarkets[marketIndex] ?? 'Toronto, Canada';
    const prospecting =
      config.prospectingEnabled && mode === 'autonomous'
        ? await runAgencyProspectingAgent({
            supabase: args.supabase,
            env: args.env ?? process.env,
            market,
            dailyCap: config.prospectingDailyCap,
          })
        : undefined;
    const proof =
      config.socialProofEnabled && (mode === 'assist' || mode === 'autonomous')
        ? await runSocialProofAgent({
            supabase: args.supabase,
            appUrl: args.appUrl,
            now,
          })
        : undefined;
    const nurture =
      config.nurtureEnabled && mode === 'autonomous'
        ? await runRevenueNurtureAgent({
            supabase: args.supabase,
            appUrl: args.appUrl,
            env: args.env ?? process.env,
            now,
            dailyCap: config.nurtureDailyCap,
            delayHours: config.nurtureDelayHours,
          })
        : undefined;

    await structuredLogWithClientAndWait(
      args.supabase,
      'revenue_agency_run',
      {
        status: 'completed',
        mode,
        focus: snapshot.focus,
        leads: snapshot.leads,
        scans: snapshot.completedScans,
        proof_assets: snapshot.proofAssets,
        converted_leads: snapshot.convertedLeads,
        active_monitoring: snapshot.activeMonitoring,
        social_proof_status: proof?.status ?? null,
        nurture_status: nurture?.status ?? null,
        nurture_sent: nurture?.sent ?? 0,
        prospecting_status: prospecting?.status ?? null,
        prospecting_saved: prospecting?.saved ?? 0,
      },
      'info'
    );
    return { status: 'completed', mode, snapshot, proof, nurture, prospecting };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    await structuredLogWithClientAndWait(
      args.supabase,
      'revenue_agency_run',
      { status: 'failed', mode, reason },
      'error'
    );
    return { status: 'failed', mode, reason };
  }
}
