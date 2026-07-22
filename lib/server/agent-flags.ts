/**
 * Runtime on/off switches for agents (issue #93) — one row per agent in
 * automation_settings, flippable from /admin/agents with no redeploy.
 *
 * Two default polarities, chosen per agent:
 *   - fail-OPEN  (default ON): presentation / lead-gen agents that are safe by
 *     construction — no row or an unreadable table means the agent runs.
 *   - fail-CLOSED (default OFF): autonomy agents — the existing
 *     loadAutomationSetting() semantics; nothing turns on by accident.
 *
 * kill_switch always wins, in both polarities.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AgentFlagFeature =
  | 'report_design_agent'
  | 'outreach_sweep'
  | 'research_agent'
  | 'competitor_benchmark'
  | 'engagement_digest';

export async function isAgentEnabled(
  supabase: SupabaseClient,
  feature: AgentFlagFeature,
  opts: { failOpen: boolean }
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('automation_settings')
      .select('enabled, kill_switch')
      .eq('feature', feature)
      .maybeSingle();
    if (error || !data) return opts.failOpen;
    if (data.kill_switch) return false;
    return data.enabled !== false;
  } catch {
    return opts.failOpen;
  }
}
