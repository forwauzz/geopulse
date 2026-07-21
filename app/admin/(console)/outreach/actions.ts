'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { parseProspectImport } from '@/lib/server/outreach-import';
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
  const templateId = String(formData.get('templateId') ?? '').trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  } catch {
    return;
  }

  const row: Record<string, unknown> = {
    email,
    url,
    name,
    company,
    cadence,
    enabled: true,
    next_run_at: new Date().toISOString(),
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };
  // template_id only exists after migration 054 — retry without it so adding
  // prospects keeps working on an un-migrated database.
  const { error } = await ctx.adminDb
    .from('outreach_prospects')
    .upsert({ ...row, template_id: templateId }, { onConflict: 'email,url' });
  if (error) {
    await ctx.adminDb.from('outreach_prospects').upsert(row, { onConflict: 'email,url' });
  }

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

/**
 * Bulk import (issue #94): paste or upload the list of companies already contacted.
 * The existing (email,url) upsert dedupes; the cadence sweep (10 per tick) paces the
 * audits without any new machinery.
 */
export async function importOutreachProspects(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  let text = String(formData.get('text') ?? '');
  const file = formData.get('file');
  if (file instanceof File && file.size > 0 && file.size < 1_000_000) {
    text = `${text}\n${await file.text()}`;
  }
  if (!text.trim()) return;

  const parsed = parseProspectImport(text);
  const nowIso = new Date().toISOString();
  let imported = 0;
  let failed = 0;

  for (const row of parsed.rows) {
    const base: Record<string, unknown> = {
      email: row.email,
      url: row.url,
      name: row.name,
      company: row.company,
      cadence: row.cadence,
      enabled: true,
      next_run_at: nowIso,
      created_by: ctx.user.id,
      updated_at: nowIso,
    };
    const { error } = await ctx.adminDb
      .from('outreach_prospects')
      .upsert(base, { onConflict: 'email,url' });
    if (error) failed += 1;
    else imported += 1;
  }

  structuredLog(
    'outreach_import',
    { imported, failed, invalid: parsed.invalid.length },
    'info'
  );
  revalidatePath('/admin/outreach');
  redirect(
    `/admin/outreach?imported=${String(imported)}&invalid=${String(parsed.invalid.length + failed)}`
  );
}

export async function saveOutreachTemplate(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('templateId') ?? '').trim() || null;
  const name = String(formData.get('name') ?? '').trim();
  const subjectTemplate = String(formData.get('subject') ?? '').trim();
  const bodyFormatRaw = String(formData.get('bodyFormat') ?? 'text');
  const bodyFormat = bodyFormatRaw === 'html' ? 'html' : 'text';
  const bodyTemplate = String(formData.get('body') ?? '');
  const makeDefault = String(formData.get('makeDefault') ?? '') === 'true';

  if (!name || !subjectTemplate || !bodyTemplate.trim()) return;

  const nowIso = new Date().toISOString();
  if (makeDefault) {
    // Clear the previous default first (partial unique index allows only one).
    await ctx.adminDb.from('outreach_templates').update({ is_default: false, updated_at: nowIso }).eq('is_default', true);
  }

  if (id) {
    await ctx.adminDb
      .from('outreach_templates')
      .update({
        name,
        subject_template: subjectTemplate,
        body_format: bodyFormat,
        body_template: bodyTemplate,
        is_default: makeDefault,
        updated_at: nowIso,
      })
      .eq('id', id);
  } else {
    await ctx.adminDb.from('outreach_templates').insert({
      name,
      subject_template: subjectTemplate,
      body_format: bodyFormat,
      body_template: bodyTemplate,
      is_default: makeDefault,
      created_by: ctx.user.id,
    });
  }

  structuredLog('outreach_template_saved', { name, bodyFormat, makeDefault }, 'info');
  revalidatePath('/admin/outreach');
}

export async function deleteOutreachTemplate(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('templateId') ?? '').trim();
  if (!id) return;
  await ctx.adminDb.from('outreach_templates').delete().eq('id', id);
  revalidatePath('/admin/outreach');
}

export async function assignProspectTemplate(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const prospectId = String(formData.get('prospectId') ?? '').trim();
  const templateId = String(formData.get('templateId') ?? '').trim() || null;
  if (!prospectId) return;

  await ctx.adminDb
    .from('outreach_prospects')
    .update({ template_id: templateId, updated_at: new Date().toISOString() })
    .eq('id', prospectId);
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
    templateId: data.template_id ?? null,
  };

  await runOutreachForProspect({
    supabase: ctx.adminDb,
    env: env as never,
    prospect,
    nowMs: Date.now(),
  });
  revalidatePath('/admin/outreach');
}
