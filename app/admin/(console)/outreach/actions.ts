'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  normalizeOutreachCadence,
  runOutreachForProspect,
  type OutreachProspect,
} from '@/lib/server/outreach';
import { structuredLog } from '@/lib/server/structured-log';

export async function addOutreachProspect(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const url = String(formData.get('url') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim() || null;
  const company = String(formData.get('company') ?? '').trim() || null;
  const cadence = normalizeOutreachCadence(String(formData.get('cadence') ?? ''));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  } catch {
    return;
  }

  await ctx.adminDb.from('outreach_prospects').upsert(
    {
      email,
      url,
      name,
      company,
      cadence,
      enabled: true,
      next_run_at: new Date().toISOString(),
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email,url' }
  );

  structuredLog('outreach_prospect_added', { email_domain: email.split('@')[1] ?? '', cadence }, 'info');
  revalidatePath('/admin/outreach');
}

export async function toggleOutreachProspect(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('prospectId') ?? '').trim();
  const enable = String(formData.get('enable') ?? '') === 'true';
  if (!id) return;

  await ctx.adminDb
    .from('outreach_prospects')
    .update({ enabled: enable, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/admin/outreach');
}

export async function runOutreachNowAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('prospectId') ?? '').trim();
  if (!id) return;

  const { data } = await ctx.adminDb.from('outreach_prospects').select('*').eq('id', id).maybeSingle();
  if (!data) return;

  const env = await getScanApiEnv();
  const prospect: OutreachProspect = {
    id: data.id,
    email: data.email,
    name: data.name ?? null,
    company: data.company ?? null,
    url: data.url,
    cadence: normalizeOutreachCadence(data.cadence),
    enabled: Boolean(data.enabled),
    lastRunAt: data.last_run_at ?? null,
    nextRunAt: data.next_run_at,
    lastScanId: data.last_scan_id ?? null,
    lastError: data.last_error ?? null,
  };

  await runOutreachForProspect({
    supabase: ctx.adminDb,
    env: env as never,
    prospect,
    nowMs: Date.now(),
  });
  revalidatePath('/admin/outreach');
}
