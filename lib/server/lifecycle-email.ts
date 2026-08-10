import type { SupabaseClient } from '@supabase/supabase-js';
import { ctaButton, emailShell, escapeEmailHtml } from './email-theme';

export type LifecycleCategory = 'transactional' | 'marketing';
export type LifecycleTemplateKey =
  | 'account_created' | 'checkout_received' | 'monitoring_activated' | 'subscription_activated'
  | 'trial_ending' | 'payment_failed' | 'payment_recovered' | 'subscription_cancelled'
  | 'report_delayed' | 'onboarding_reminder' | 'internal_exception_digest';

export type LifecycleEmailEnv = {
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
  readonly LIFECYCLE_EXCEPTION_TO?: string;
};

type TemplateRow = { template_key: string; category: LifecycleCategory; enabled: boolean; subject_template: string; body_template: string };
type DeliveryRow = {
  id: string; template_key: LifecycleTemplateKey; recipient_email: string; variables: Record<string, unknown>;
  attempts: number; max_attempts: number; idempotency_key: string;
};

const TOKEN = /{{\s*([a-z0-9_]+)\s*}}/gi;
export function renderLifecycleTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(TOKEN, (_match, key: string) => String(variables[key] ?? ''));
}

function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }

export async function setLifecycleEmailSuppression(args: { supabase: SupabaseClient; email: string; scope: 'all' | 'marketing'; reason: 'bounce' | 'complaint' | 'unsubscribe' | 'cancellation' | 'conversion' | 'operator'; source: string; active?: boolean }): Promise<void> {
  const email = normalizedEmail(args.email); if (!email.includes('@')) return;
  const { error } = await args.supabase.from('lifecycle_email_suppressions').upsert({
    email, scope: args.scope, reason: args.reason, source: args.source, active: args.active ?? true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email,scope' });
  if (error) throw new Error(`lifecycle_suppression_write_failed:${error.message}`);
}

async function appendEvent(supabase: SupabaseClient, deliveryId: string, eventType: string, detail: Record<string, unknown> = {}, providerEventId?: string): Promise<void> {
  const { error } = await supabase.from('lifecycle_email_delivery_events').insert({
    delivery_id: deliveryId, event_type: eventType, detail, provider_event_id: providerEventId ?? null,
  });
  if (error && error.code !== '23505') throw new Error(`lifecycle_event_write_failed:${error.message}`);
}

export async function enqueueLifecycleEmail(args: {
  supabase: SupabaseClient; idempotencyKey: string; eventType: string; templateKey: LifecycleTemplateKey;
  to: string; variables?: Record<string, unknown>; userId?: string | null; subjectId?: string | null;
}): Promise<{ ok: boolean; id?: string; status?: string; reason?: string }> {
  const email = normalizedEmail(args.to);
  if (!email.includes('@')) return { ok: false, reason: 'invalid_email' };
  const [{ data: template }, { data: preference }, { data: suppressions }] = await Promise.all([
    args.supabase.from('lifecycle_email_templates').select('template_key,category,enabled').eq('template_key', args.templateKey).maybeSingle(),
    args.supabase.from('lifecycle_email_preferences').select('transactional_enabled,marketing_enabled').eq('email', email).maybeSingle(),
    args.supabase.from('lifecycle_email_suppressions').select('scope,reason').eq('email', email).eq('active', true),
  ]);
  if (!template) return { ok: false, reason: 'template_missing' };
  const category = String(template.category) as LifecycleCategory;
  const suppressed = !template.enabled
    || (category === 'marketing' && preference?.marketing_enabled === false)
    || (category === 'transactional' && preference?.transactional_enabled === false)
    || (suppressions ?? []).some((row: { scope: string }) => row.scope === 'all' || (category === 'marketing' && row.scope === 'marketing'));
  const status = suppressed ? 'suppressed' : 'queued';
  const { data, error } = await args.supabase.from('lifecycle_email_deliveries').upsert({
    idempotency_key: args.idempotencyKey, event_type: args.eventType, template_key: args.templateKey,
    category, recipient_email: email, variables: args.variables ?? {}, user_id: args.userId ?? null,
    subject_id: args.subjectId ?? null, status, next_attempt_at: new Date().toISOString(),
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,status').maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (data?.id) await appendEvent(args.supabase, data.id as string, status === 'queued' ? 'queued' : 'suppressed');
  return { ok: true, id: data?.id as string | undefined, status: (data?.status as string | undefined) ?? status };
}

function buildHtml(template: TemplateRow, variables: Record<string, unknown>): { subject: string; html: string } {
  const subject = renderLifecycleTemplate(template.subject_template, variables);
  const body = renderLifecycleTemplate(template.body_template, variables);
  const lines = body.split(/\n+/).filter(Boolean);
  const ctaUrl = typeof variables['cta_url'] === 'string' ? variables['cta_url'] : '';
  const bodyHtml = lines.map((line) => line === ctaUrl && ctaUrl
    ? ctaButton('Continue in GEO-Pulse', ctaUrl)
    : `<p style="margin:0 0 14px;">${escapeEmailHtml(line)}</p>`).join('\n');
  return { subject, html: emailShell({ kicker: 'GEO-Pulse service update', sender: 'noah', bodyHtml, footerNote: 'This is an automated service email from the GEO-Pulse team in Montréal, Québec.' }) };
}

function retryAt(attempt: number): string {
  const minutes = Math.min(24 * 60, 5 * (2 ** Math.max(0, attempt - 1)));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function processLifecycleEmailQueue(args: { supabase: SupabaseClient; env: LifecycleEmailEnv; limit?: number }): Promise<{ claimed: number; sent: number; failed: number }> {
  const now = new Date().toISOString();
  const { data } = await args.supabase.from('lifecycle_email_deliveries')
    .select('id,template_key,recipient_email,variables,attempts,max_attempts,idempotency_key')
    .in('status', ['queued', 'retrying']).lte('next_attempt_at', now).order('created_at').limit(args.limit ?? 20);
  const rows = (data ?? []) as DeliveryRow[];
  let sent = 0; let failed = 0;
  for (const row of rows) {
    const attempt = row.attempts + 1;
    const { data: claimed } = await args.supabase.from('lifecycle_email_deliveries')
      .update({ status: 'sending', attempts: attempt, updated_at: now }).eq('id', row.id)
      .in('status', ['queued', 'retrying']).select('id').maybeSingle();
    if (!claimed) continue;
    try {
      const { data: template } = await args.supabase.from('lifecycle_email_templates')
        .select('template_key,category,enabled,subject_template,body_template').eq('template_key', row.template_key).single();
      if (!template?.enabled) throw new Error('template_disabled');
      const built = buildHtml(template as TemplateRow, row.variables ?? {});
      const key = args.env.RESEND_API_KEY?.trim(); const from = args.env.RESEND_FROM_EMAIL?.trim();
      if (!key || !from) throw new Error('resend_not_configured');
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15_000), headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': row.idempotency_key,
      }, body: JSON.stringify({ from, to: row.recipient_email, subject: built.subject, html: built.html }) });
      const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok) throw new Error(result.message ?? `resend_${response.status}`);
      await args.supabase.from('lifecycle_email_deliveries').update({ status: 'sent', provider_message_id: result.id ?? null, sent_at: now, last_error: null, updated_at: now }).eq('id', row.id);
      await appendEvent(args.supabase, row.id, 'sent', { attempt, provider_message_id: result.id ?? null }); sent += 1;
    } catch (error) {
      const terminal = attempt >= row.max_attempts;
      const message = error instanceof Error ? error.message : 'unknown_error';
      await args.supabase.from('lifecycle_email_deliveries').update({ status: terminal ? 'failed' : 'retrying', next_attempt_at: retryAt(attempt), last_error: message.slice(0, 500), escalated_at: terminal ? now : null, updated_at: now }).eq('id', row.id);
      await appendEvent(args.supabase, row.id, terminal ? 'failed' : 'retry_scheduled', { attempt, error: message.slice(0, 200) }); failed += 1;
    }
  }
  return { claimed: rows.length, sent, failed };
}

export async function reconcileResendLifecycleEvent(args: { supabase: SupabaseClient; providerEventId: string; type: string; messageId: string; to?: string }): Promise<boolean> {
  const { data: delivery } = await args.supabase.from('lifecycle_email_deliveries').select('id,recipient_email').eq('provider_message_id', args.messageId).maybeSingle();
  if (!delivery?.id) return false;
  const status = args.type === 'email.delivered' ? 'delivered' : args.type === 'email.bounced' ? 'bounced' : args.type === 'email.complained' ? 'complained' : null;
  if (!status) return false;
  const now = new Date().toISOString();
  await args.supabase.from('lifecycle_email_deliveries').update({ status, ...(status === 'delivered' ? { delivered_at: now } : {}), updated_at: now }).eq('id', delivery.id);
  await appendEvent(args.supabase, delivery.id as string, status, {}, args.providerEventId);
  if (status === 'bounced' || status === 'complained') {
    await setLifecycleEmailSuppression({ supabase: args.supabase, email: args.to ?? delivery.recipient_email, scope: 'all', reason: status === 'bounced' ? 'bounce' : 'complaint', source: 'resend_webhook' });
  }
  return true;
}

export async function enqueueDailyLifecycleExceptionDigest(args: { supabase: SupabaseClient; env: LifecycleEmailEnv; date: string }): Promise<void> {
  const to = args.env.LIFECYCLE_EXCEPTION_TO?.trim(); if (!to) return;
  const { data } = await args.supabase.from('lifecycle_email_deliveries').select('status').in('status', ['failed','bounced','complained','retrying']);
  const counts = (data ?? []).reduce<Record<string, number>>((acc, row: { status: string }) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  if (Object.keys(counts).length === 0) return;
  await enqueueLifecycleEmail({ supabase: args.supabase, idempotencyKey: `lifecycle-exceptions/${args.date}`, eventType: 'daily_exception_digest', templateKey: 'internal_exception_digest', to,
    variables: { date: args.date, summary: Object.entries(counts).map(([k,v]) => `${k}: ${v}`).join(' · '), cta_url: `${args.env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com'}/admin/lifecycle-email` } });
}

export async function enqueueOnboardingReminders(args: { supabase: SupabaseClient; env: LifecycleEmailEnv; now?: Date }): Promise<number> {
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { data: users } = await args.supabase.from('users').select('id,email,full_name,created_at').lte('created_at', cutoff).order('created_at', { ascending: false }).limit(100);
  const candidates = (users ?? []) as Array<{ id: string; email: string; full_name: string | null; created_at: string }>;
  if (candidates.length === 0) return 0;
  const ids = candidates.map((u) => u.id);
  const { data: scans } = await args.supabase.from('scans').select('user_id').in('user_id', ids).limit(500);
  const activated = new Set((scans ?? []).map((row: { user_id: string | null }) => row.user_id).filter(Boolean));
  let queued = 0;
  for (const user of candidates) {
    if (activated.has(user.id)) continue;
    const ageHours = (now.getTime() - new Date(user.created_at).getTime()) / 3_600_000;
    const stage = ageHours >= 72 ? '3d' : '24h';
    const result = await enqueueLifecycleEmail({ supabase: args.supabase, to: user.email, userId: user.id,
      subjectId: user.id, idempotencyKey: `onboarding/${user.id}/${stage}`, eventType: 'onboarding_incomplete',
      templateKey: 'onboarding_reminder', variables: { first_name: user.full_name?.split(/\s+/)[0] ?? 'there',
        cta_url: `${args.env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com'}/dashboard` } });
    if (result.status === 'queued') queued += 1;
  }
  return queued;
}
