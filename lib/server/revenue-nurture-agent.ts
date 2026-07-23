import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRevenueNurtureEmail, sendLeadEmail, type LeadEmailEnv } from './lead-email';
import { structuredLogWithClientAndWait } from './structured-log';

type ConsentedEvent = {
  lead_id: string | null;
  event_ts: string;
};

type LeadRow = {
  id: string;
  email: string;
  url: string;
  score: number;
  scan_id: string;
  converted: boolean | null;
};

export type RevenueNurtureResult = {
  readonly status: 'completed' | 'skipped';
  readonly eligible: number;
  readonly sent: number;
  readonly reason?: string;
};

export function consentCutoff(now: Date, delayHours: number): string {
  return new Date(now.getTime() - delayHours * 60 * 60 * 1000).toISOString();
}

async function wasAlreadySent(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('app_logs')
    .select('id', { count: 'exact', head: true })
    .eq('event', 'revenue_nurture_sent')
    .eq('data->>lead_id', leadId);
  return !error && (count ?? 0) > 0;
}

async function hasActiveMonitoring(supabase: SupabaseClient, lead: LeadRow): Promise<boolean> {
  const { count, error } = await supabase
    .from('monitoring_subscriptions')
    .select('id', { count: 'exact', head: true })
    .ilike('email', lead.email)
    .in('status', ['active', 'trialing']);
  return !error && (count ?? 0) > 0;
}

async function ensureNurtureProspect(
  supabase: SupabaseClient,
  lead: LeadRow
): Promise<{ id: string; unsubscribed: boolean; activeCadence: boolean } | null> {
  const { data: existingRows } = await supabase
    .from('outreach_prospects')
    .select('id,url,enabled,unsubscribed_at')
    .ilike('email', lead.email);
  const rows = (existingRows ?? []) as Array<{
    id: string;
    url: string;
    enabled: boolean;
    unsubscribed_at: string | null;
  }>;
  const unsubscribed = rows.find((row) => row.unsubscribed_at != null);
  if (unsubscribed) {
    return {
      id: unsubscribed.id,
      unsubscribed: true,
      activeCadence: false,
    };
  }
  const active = rows.find((row) => row.enabled);
  if (active) return { id: active.id, unsubscribed: false, activeCadence: true };
  const existing = rows.find((row) => row.url === lead.url);
  if (existing) return { id: existing.id, unsubscribed: false, activeCadence: false };

  const { data, error } = await supabase
    .from('outreach_prospects')
    .insert({
      email: lead.email.toLowerCase(),
      url: lead.url,
      cadence: 'monthly',
      enabled: false,
      last_scan_id: lead.scan_id,
    })
    .select('id')
    .single();
  return error || !data?.id
    ? null
    : { id: data.id as string, unsubscribed: false, activeCadence: false };
}

export async function runRevenueNurtureAgent(args: {
  readonly supabase: SupabaseClient;
  readonly appUrl: string;
  readonly env: LeadEmailEnv;
  readonly now?: Date;
  readonly dailyCap: number;
  readonly delayHours: number;
}): Promise<RevenueNurtureResult> {
  const now = args.now ?? new Date();
  if (!args.env.RESEND_API_KEY?.trim() || !args.env.RESEND_FROM_EMAIL?.trim()) {
    return { status: 'skipped', eligible: 0, sent: 0, reason: 'email_not_configured' };
  }

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count: sentToday, error: sentCountError } = await args.supabase
    .from('app_logs')
    .select('id', { count: 'exact', head: true })
    .eq('event', 'revenue_nurture_sent')
    .gte('created_at', startOfDay.toISOString());
  if (sentCountError) {
    return { status: 'skipped', eligible: 0, sent: 0, reason: 'daily_cap_query_failed' };
  }
  const remaining = Math.max(0, args.dailyCap - (sentToday ?? 0));
  if (remaining === 0) {
    return { status: 'skipped', eligible: 0, sent: 0, reason: 'daily_cap_reached' };
  }

  const { data: events, error: eventError } = await args.supabase
    .schema('analytics')
    .from('marketing_events')
    .select('lead_id,event_ts')
    .eq('event_name', 'lead_submitted')
    .eq('metadata_json->>marketing_consent', 'true')
    .not('lead_id', 'is', null)
    .lte('event_ts', consentCutoff(now, args.delayHours))
    .order('event_ts', { ascending: true })
    .limit(Math.max(remaining * 4, 20));
  if (eventError) {
    return { status: 'skipped', eligible: 0, sent: 0, reason: 'consent_query_failed' };
  }

  const leadIds = [...new Set(((events ?? []) as ConsentedEvent[]).map((event) => event.lead_id).filter(Boolean))] as string[];
  if (leadIds.length === 0) return { status: 'completed', eligible: 0, sent: 0 };

  const { data: leads, error: leadError } = await args.supabase
    .from('leads')
    .select('id,email,url,score,scan_id,converted')
    .in('id', leadIds)
    .eq('converted', false);
  if (leadError) {
    return { status: 'skipped', eligible: 0, sent: 0, reason: 'lead_query_failed' };
  }

  let sent = 0;
  const eligible = (leads ?? []).length;
  for (const lead of (leads ?? []) as LeadRow[]) {
    if (sent >= remaining) break;
    if (await wasAlreadySent(args.supabase, lead.id)) continue;
    if (await hasActiveMonitoring(args.supabase, lead)) continue;

    const prospect = await ensureNurtureProspect(args.supabase, lead);
    if (!prospect || prospect.unsubscribed || prospect.activeCadence) continue;

    const sendId = randomUUID();
    const { error: sendInsertError } = await args.supabase.from('outreach_sends').insert({
      id: sendId,
      prospect_id: prospect.id,
      scan_id: lead.scan_id,
      score: lead.score,
    });
    if (sendInsertError) continue;

    const email = buildRevenueNurtureEmail({
      appUrl: args.appUrl,
      prospectId: prospect.id,
      sendId,
      scanId: lead.scan_id,
      url: lead.url,
      score: lead.score,
    });
    const delivery = await sendLeadEmail({
      env: args.env,
      to: lead.email,
      subject: email.subject,
      html: email.html,
    });
    if (!delivery.ok) {
      await args.supabase.from('outreach_sends').delete().eq('id', sendId);
      continue;
    }

    await structuredLogWithClientAndWait(
      args.supabase,
      'revenue_nurture_sent',
      { lead_id: lead.id, prospect_id: prospect.id, scan_id: lead.scan_id },
      'info'
    );
    sent += 1;
  }

  return { status: 'completed', eligible, sent };
}
