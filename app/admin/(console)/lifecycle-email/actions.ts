'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { enqueueLifecycleEmail, type LifecycleTemplateKey } from '@/lib/server/lifecycle-email';

const PATH = '/admin/lifecycle-email';

async function db() {
  const ctx = await loadAdminActionContext();
  return ctx.ok ? { db: ctx.adminDb, userId: ctx.user.id } : null;
}

export async function toggleLifecycleTemplate(formData: FormData): Promise<void> {
  const ctx = await db(); if (!ctx) return;
  const key = String(formData.get('template_key') ?? '');
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  await ctx.db.from('lifecycle_email_templates').update({ enabled, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq('template_key', key);
  revalidatePath(PATH);
}

export async function updateLifecycleTemplate(formData: FormData): Promise<void> {
  const ctx = await db(); if (!ctx) return;
  const key = String(formData.get('template_key') ?? '');
  const subject = String(formData.get('subject_template') ?? '').trim();
  const body = String(formData.get('body_template') ?? '').trim();
  if (!key || !subject || !body || subject.length > 200 || body.length > 5000) return;
  await ctx.db.from('lifecycle_email_templates').update({ subject_template: subject, body_template: body, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq('template_key', key);
  revalidatePath(PATH);
}

export async function resendLifecycleDelivery(formData: FormData): Promise<void> {
  const ctx = await db(); if (!ctx) return;
  const id = String(formData.get('delivery_id') ?? '');
  const { data: original } = await ctx.db.from('lifecycle_email_deliveries')
    .select('event_type,template_key,recipient_email,variables,user_id,subject_id').eq('id', id).maybeSingle();
  if (!original) return;
  const resend = await enqueueLifecycleEmail({
    supabase: ctx.db,
    idempotencyKey: `operator-resend/${id}/${crypto.randomUUID()}`,
    eventType: original.event_type,
    templateKey: original.template_key as LifecycleTemplateKey,
    to: original.recipient_email,
    variables: original.variables ?? {},
    userId: original.user_id,
    subjectId: original.subject_id,
  });
  await ctx.db.from('lifecycle_email_delivery_events').insert({
    delivery_id: id,
    event_type: 'operator_resend_requested',
    detail: { user_id: ctx.userId, new_delivery_id: resend.id ?? null, result: resend.status ?? resend.reason ?? 'unknown' },
  });
  revalidatePath(PATH);
}

export async function updateLifecyclePreference(formData: FormData): Promise<void> {
  const ctx = await db(); if (!ctx) return;
  const email = String(formData.get('email') ?? '').trim().toLowerCase(); if (!email.includes('@')) return;
  await ctx.db.from('lifecycle_email_preferences').upsert({ email, transactional_enabled: String(formData.get('transactional')) === 'true', marketing_enabled: String(formData.get('marketing')) === 'true', updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: 'email' });
  revalidatePath(PATH);
}

export async function setLifecycleSuppression(formData: FormData): Promise<void> {
  const ctx = await db(); if (!ctx) return;
  const email = String(formData.get('email') ?? '').trim().toLowerCase(); if (!email.includes('@')) return;
  const active = String(formData.get('active')) === 'true';
  await ctx.db.from('lifecycle_email_suppressions').upsert({ email, scope: String(formData.get('scope')) === 'marketing' ? 'marketing' : 'all', reason: 'operator', source: 'admin_console', active, updated_at: new Date().toISOString(), metadata: { user_id: ctx.userId } }, { onConflict: 'email,scope' });
  revalidatePath(PATH);
}
