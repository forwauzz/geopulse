/**
 * The Agents console registry (issue #93) — every agent in the product, in one place,
 * with its audience (internal vs client-facing), its switch, and a plain-English
 * blocker line when it is dormant. The console DESCRIBES and TOGGLES; it never runs
 * agents itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAgentEnabled, type AgentFlagFeature } from './agent-flags';
import { loadAutomationSetting } from './automation-settings';
import { loadSelfImprovementSettings } from './self-improvement';

export type AgentAudience = 'internal' | 'client';

export interface AgentStatus {
  key: string;
  name: string;
  audience: AgentAudience;
  description: string;
  /** How this agent is switched. */
  control: 'flag' | 'settings' | 'env' | 'grants';
  /** automation_settings feature when control='flag'. */
  flagFeature?: AgentFlagFeature | 'marketing_autopilot';
  /** Effective on/off right now. */
  enabled: boolean;
  killSwitch: boolean;
  /** Plain-English reasons the agent cannot fully work even when enabled. */
  blockers: string[];
  /** Where to manage it when not toggleable here. */
  manageHint?: string;
}

type EnvLike = Record<string, string | undefined>;

async function tableExists(supabase: SupabaseClient, table: string): Promise<boolean> {
  try {
    const { error } = await supabase.from(table).select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function hasConnectedChannel(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await supabase.from('distribution_accounts').select('id').eq('status', 'connected').limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function loadAgentStatuses(supabase: SupabaseClient, env: EnvLike): Promise<AgentStatus[]> {
  const [
    outreachEnabled,
    researchEnabled,
    designEnabled,
    outreachSetting,
    researchSetting,
    designSetting,
    marketingSetting,
    selfImprove,
    templatesTable,
    researchTable,
    channelConnected,
  ] = await Promise.all([
    isAgentEnabled(supabase, 'outreach_sweep', { failOpen: true }),
    isAgentEnabled(supabase, 'research_agent', { failOpen: true }),
    isAgentEnabled(supabase, 'report_design_agent', { failOpen: true }),
    loadAutomationSetting(supabase, 'outreach_sweep'),
    loadAutomationSetting(supabase, 'research_agent'),
    loadAutomationSetting(supabase, 'report_design_agent'),
    loadAutomationSetting(supabase, 'marketing_autopilot'),
    loadSelfImprovementSettings(supabase),
    tableExists(supabase, 'outreach_templates'),
    tableExists(supabase, 'research_watchlist'),
    hasConnectedChannel(supabase),
  ]);

  const resendReady = Boolean(env['RESEND_API_KEY']?.trim() && env['RESEND_FROM_EMAIL']?.trim());
  const browserRenderReady = Boolean(
    (env['CLOUDFLARE_ACCOUNT_ID']?.trim() || env['CF_BROWSER_RENDERING_ACCOUNT_ID']?.trim()) &&
      (env['BROWSER_RENDERING_API_TOKEN']?.trim() || env['CF_BROWSER_RENDERING_API_TOKEN']?.trim()) &&
      (env['DEEP_AUDIT_BROWSER_RENDER_MODE']?.trim().toLowerCase() === 'auto' ||
        env['DEEP_AUDIT_BROWSER_RENDER_MODE']?.trim().toLowerCase() === 'force')
  );
  const discoveryLive = env['COMPETITOR_DISCOVERY_MODE']?.trim().toLowerCase() === 'live';
  const gpmEnabled = env['GPM_SCHEDULE_ENABLED']?.trim().toLowerCase() === 'true';

  return [
    {
      key: 'outreach',
      name: 'Outreach agent',
      audience: 'internal',
      description: 'Audits admin-added prospects on a cadence and emails their scorecard. The lead-gen engine.',
      control: 'flag',
      flagFeature: 'outreach_sweep',
      enabled: outreachEnabled,
      killSwitch: outreachSetting.killSwitch,
      blockers: [
        ...(resendReady ? [] : ['Resend email credentials missing — sends will fail']),
        ...(templatesTable ? [] : ['Custom templates dormant until migration 054 is applied (built-in email still sends)']),
      ],
      manageHint: 'Prospects, templates and tracking live in /admin/outreach.',
    },
    {
      key: 'research',
      name: 'Research agent',
      audience: 'internal',
      description: 'Weekly Monday sweep of vendor crawler docs; drafts spec-change proposals for human review.',
      control: 'flag',
      flagFeature: 'research_agent',
      enabled: researchEnabled,
      killSwitch: researchSetting.killSwitch,
      blockers: researchTable ? [] : ['Dormant until migration 055 is applied'],
      manageHint: 'Review queue and watchlist live in /admin/research.',
    },
    {
      key: 'design',
      name: 'Report design agent',
      audience: 'client',
      description: 'Personalizes every deep-audit PDF cover (Prepared for/by, credibility strip, homepage screenshot).',
      control: 'flag',
      flagFeature: 'report_design_agent',
      enabled: designEnabled,
      killSwitch: designSetting.killSwitch,
      blockers: browserRenderReady ? [] : ['Browser Rendering credentials/mode not set — covers render without the screenshot'],
    },
    {
      key: 'marketing_autopilot',
      name: 'Marketing autopilot',
      audience: 'internal',
      description: 'Proposes review-gated content briefs for weak topics (Loop 5b). Never auto-publishes.',
      control: 'flag',
      flagFeature: 'marketing_autopilot',
      enabled: marketingSetting.enabled && !marketingSetting.killSwitch,
      killSwitch: marketingSetting.killSwitch,
      blockers: channelConnected ? [] : ['No distribution channel connected (X/LinkedIn/Ghost) — briefs only, no posting'],
      manageHint: 'Daily cap and run-now live in /admin/automation.',
    },
    {
      key: 'self_improvement',
      name: 'Self-improvement loop',
      audience: 'internal',
      description: 'getgeopulse.com audits itself and emails an improvement plan (Loop 5a).',
      control: 'settings',
      enabled: selfImprove.enabled && !selfImprove.killSwitch,
      killSwitch: selfImprove.killSwitch,
      blockers: [],
      manageHint: 'Toggles, recipient and run-now live in /admin/automation.',
    },
    {
      key: 'recurring_audits',
      name: 'Recurring audits',
      audience: 'client',
      description: 'Clients with the automation grant schedule their own weekly/daily re-audits from their dashboard.',
      control: 'grants',
      enabled: true,
      killSwitch: false,
      blockers: [],
      manageHint: 'Grant per user in /admin/settings; each client turns their schedule on/off in /dashboard/automation.',
    },
    {
      key: 'gpm',
      name: 'Geo-performance monitor',
      audience: 'client',
      description: 'Scheduled per-client citation monitoring across ChatGPT/Gemini/Perplexity with emailed reports.',
      control: 'env',
      enabled: gpmEnabled,
      killSwitch: false,
      blockers: gpmEnabled ? [] : ['GPM_SCHEDULE_ENABLED is not "true" in wrangler.jsonc (redeploy to change)'],
    },
    {
      key: 'competitor_discovery',
      name: 'Competitor discovery',
      audience: 'client',
      description: 'Auto-detects local competitors on the results scorecard.',
      control: 'env',
      enabled: true,
      killSwitch: false,
      blockers: discoveryLive ? [] : ['Running in MOCK mode — live Google-grounded discovery needs COMPETITOR_DISCOVERY_MODE=live + Gemini billing'],
    },
    {
      key: 'benchmark',
      name: 'Citation benchmark engine',
      audience: 'internal',
      description: 'Hourly benchmark sweeps measuring which domains AI engines cite. Runs LAST in the cron so it can never starve the agents above (issue #92).',
      control: 'env',
      enabled: env['BENCHMARK_SCHEDULE_ENABLED']?.trim().toLowerCase() === 'true',
      killSwitch: false,
      blockers: [],
      manageHint: 'Schedules and recaps are env-driven; results feed /admin/geo-performance.',
    },
  ];
}
