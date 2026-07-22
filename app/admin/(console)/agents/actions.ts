'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { updateAutomationSetting, type AutomationFeature } from '@/lib/server/automation-settings';

const TOGGLEABLE: ReadonlySet<AutomationFeature> = new Set<AutomationFeature>([
  'outreach_sweep',
  'research_agent',
  'report_design_agent',
  'marketing_autopilot',
  'competitor_benchmark',
  'engagement_digest',
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
