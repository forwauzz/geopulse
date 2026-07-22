'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { resolveFirstRunAt } from '@/lib/server/montreal-time';
import { normalizeProspectUrl, parseProspectImport } from '@/lib/server/outreach-import';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  addSegmentToSequence,
  importContacts,
  normalizeSegment,
  parseContactImport,
} from '@/lib/server/outreach-contacts';
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
  // Same normalization as the importer, so the same site always stores identically —
  // a raw-vs-normalized mismatch would let a re-add slip past the consent guard.
  const url = normalizeProspectUrl(String(formData.get('url') ?? ''));
  const name = String(formData.get('name') ?? '').trim() || null;
  const company = String(formData.get('company') ?? '').trim() || null;
  const cadence = normalizeOutreachCadence(String(formData.get('cadence') ?? ''));
  const templateId = String(formData.get('templateId') ?? '').trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  if (!url) return;

  // CASL (issue #97): withdrawal of consent belongs to the EMAIL ADDRESS, not to one
  // (email, url) pair — an opted-out person must not be re-added under a different site.
  {
    const { data: existing, error } = await ctx.adminDb
      .from('outreach_prospects')
      .select('id')
      .eq('email', email)
      .not('unsubscribed_at', 'is', null)
      .limit(1);
    if (!error && Array.isArray(existing) && existing.length > 0) {
      structuredLog('outreach_prospect_add_blocked_unsubscribed', { email_domain: email.split('@')[1] ?? '' }, 'info');
      return;
    }
  }

  // Brevo-style scheduling (issue #108): the first send goes out at the admin's chosen
  // Montréal date/time; blank = the next hourly tick. Cadence anchors from there.
  const firstRunAt = resolveFirstRunAt(String(formData.get('startAt') ?? ''), Date.now());

  const row: Record<string, unknown> = {
    email,
    url,
    name,
    company,
    cadence,
    enabled: true,
    next_run_at: firstRunAt,
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
  // One scheduled first-send applies to the whole imported batch (issue #108).
  const firstRunAt = resolveFirstRunAt(String(formData.get('startAt') ?? ''), Date.now());
  let imported = 0;
  let failed = 0;

  // CASL (issue #97): a re-imported list must never resurrect unsubscribed contacts.
  // Consent withdrawal belongs to the EMAIL — any unsubscribed row blocks that address
  // under every URL. Fail-soft pre-migration-056: the select errors, the set stays
  // empty, imports proceed.
  let unsubscribedEmails = new Set<string>();
  {
    const { data, error } = await ctx.adminDb
      .from('outreach_prospects')
      .select('email,unsubscribed_at')
      .not('unsubscribed_at', 'is', null);
    if (!error && Array.isArray(data)) {
      unsubscribedEmails = new Set(data.map((r: { email: string }) => r.email.toLowerCase()));
    }
  }

  for (const row of parsed.rows) {
    if (unsubscribedEmails.has(row.email)) {
      failed += 1; // surfaces in the "skipped" count; the contact opted out
      continue;
    }
    const base: Record<string, unknown> = {
      email: row.email,
      url: row.url,
      name: row.name,
      company: row.company,
      cadence: row.cadence,
      enabled: true,
      next_run_at: firstRunAt,
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

/** Hard delete (issue #108): removes the prospect AND its send history. */
export async function deleteOutreachProspect(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('prospectId') ?? '').trim();
  if (!id) return;

  await ctx.adminDb.from('outreach_sends').delete().eq('prospect_id', id);
  await ctx.adminDb.from('outreach_prospects').delete().eq('id', id);
  structuredLog('outreach_prospect_deleted', {}, 'info');
  revalidatePath('/admin/outreach');
}

/** Reschedule an existing prospect's next send (issue #108). */
export async function rescheduleOutreachProspect(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('prospectId') ?? '').trim();
  const startAt = String(formData.get('startAt') ?? '');
  if (!id || !startAt.trim()) return;

  await ctx.adminDb
    .from('outreach_prospects')
    .update({ next_run_at: resolveFirstRunAt(startAt, Date.now()), updated_at: new Date().toISOString() })
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

// ── Contact bank (issue #135) — save now, sequence later ─────────────────────

export async function importOutreachContactsAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const segment = normalizeSegment(String(formData.get('segment') ?? ''));
  const text = String(formData.get('contacts') ?? '');
  if (!segment || !text.trim()) return;

  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  const parsed = parseContactImport(text);
  const result = await importContacts(ctx.adminDb, parsed.rows, {
    segment,
    tags,
    source: 'admin-import',
  });
  revalidatePath('/admin/outreach');
  redirect(
    `/admin/outreach?contactsImported=${String(result.imported)}&contactsInvalid=${String(parsed.invalid.length)}${result.error ? `&contactsError=${encodeURIComponent(result.error.slice(0, 120))}` : ''}`
  );
}

export async function addSegmentToSequenceAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const segment = normalizeSegment(String(formData.get('segment') ?? ''));
  if (!segment) return;
  const firstRunAt = resolveFirstRunAt(String(formData.get('startAt') ?? ''), Date.now());

  const result = await addSegmentToSequence({
    supabase: ctx.adminDb,
    segment,
    startMs: new Date(firstRunAt).getTime(),
    cadence: normalizeOutreachCadence(String(formData.get('cadence') ?? 'monthly')),
  });
  revalidatePath('/admin/outreach');
  redirect(
    `/admin/outreach?seqAdded=${String(result.added)}&seqSkipped=${String(result.skippedExisting + result.skippedUnsubscribed)}`
  );
}

export async function deleteOutreachContactAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const id = String(formData.get('contactId') ?? '').trim();
  if (!id) return;
  await ctx.adminDb.from('outreach_contacts').delete().eq('id', id);
  revalidatePath('/admin/outreach');
}
