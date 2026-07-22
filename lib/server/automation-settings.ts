/**
 * Generic feature-keyed automation toggles (admin Automation console, migration 048).
 * Fail-closed: any read error yields safe disabled defaults so a missing table / row never
 * accidentally turns an autonomy feature on.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AutomationFeature =
  | 'marketing_autopilot'
  | 'report_design_agent'
  | 'outreach_sweep'
  | 'research_agent'
  | 'competitor_benchmark'
  | 'engagement_digest';

export type AutomationSetting = {
  feature: string;
  enabled: boolean;
  killSwitch: boolean;
  config: Record<string, unknown>;
};

function safeDefault(feature: string): AutomationSetting {
  return { feature, enabled: false, killSwitch: false, config: {} };
}

export async function loadAutomationSetting(
  supabase: SupabaseClient,
  feature: AutomationFeature
): Promise<AutomationSetting> {
  try {
    const { data, error } = await supabase
      .from('automation_settings')
      .select('feature, enabled, kill_switch, config')
      .eq('feature', feature)
      .maybeSingle();
    if (error || !data) return safeDefault(feature);
    return {
      feature,
      enabled: Boolean(data.enabled),
      killSwitch: Boolean(data.kill_switch),
      config: (data.config && typeof data.config === 'object' ? data.config : {}) as Record<string, unknown>,
    };
  } catch {
    return safeDefault(feature);
  }
}

export async function updateAutomationSetting(
  supabase: SupabaseClient,
  feature: AutomationFeature,
  patch: { enabled?: boolean; killSwitch?: boolean; config?: Record<string, unknown> },
  updatedBy: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = { feature, updated_at: new Date().toISOString(), updated_by: updatedBy };
  if (patch.enabled !== undefined) row['enabled'] = patch.enabled;
  if (patch.killSwitch !== undefined) row['kill_switch'] = patch.killSwitch;
  if (patch.config !== undefined) row['config'] = patch.config;
  const { error } = await supabase.from('automation_settings').upsert(row, { onConflict: 'feature' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Read a positive integer from a setting's config, else the fallback. */
export function configInt(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}
