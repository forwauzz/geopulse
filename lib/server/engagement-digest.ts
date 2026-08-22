/**
 * Engagement digest (issue #131) — the "someone is biting" ping.
 *
 * Once a day, ONLY when something happened, email the operator a short branded summary of
 * the last 24h of evidence: provider-accepted sends, tracking-image loads, deduplicated possible
 * report visits, verified external audit requests, and new lead captures. Silence means nothing happened — the operator never
 * has to poll /admin/outreach to know whether to get involved.
 *
 * Internal-only notification (never contacts third parties), so the 'engagement_digest'
 * flag reads FAIL-OPEN. Once-per-day dedupe uses an AWAITED automation_settings config
 * write — app_logs inserts are fire-and-forget and provably lossy on the free-plan cron.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAgentEnabled } from './agent-flags';
import { loadAutomationSetting, updateAutomationSetting } from './automation-settings';
import { loadSelfImprovementSettings } from './self-improvement';
import { emailShell, escapeEmailHtml } from './email-theme';
import { isVerifiedExternalAuditRequest, uniqueReportViewScanIds } from './engagement-evidence';
import { normalizedRevenueDomain } from './revenue-identity';
import { structuredLog } from './structured-log';

export const DIGEST_HOUR_UTC = 12; // 8 AM Montréal in summer

export type DigestStats = {
  providerAccepted: { company: string; score: number | null }[];
  pixelLoads: { company: string }[];
  possibleReportVisits: number;
  verifiedAuditRequests: { domain: string }[];
  newLeads: { email: string; url: string }[];
};

type ProspectRelation = { company?: string | null } | { company?: string | null }[];
export type DigestAuditRow = {
  guest_email?: string | null;
  user_id?: string | null;
  scan?: { domain?: string; run_source?: string } | { domain?: string; run_source?: string }[];
};

export function assembleDigestStats(input: {
  sends: readonly { score: number | null; prospect?: ProspectRelation }[];
  pixelLoads: readonly { prospect?: ProspectRelation }[];
  reportViews: readonly { data?: { scanId?: string | null } | null }[];
  audits: readonly DigestAuditRow[];
  users: readonly { id: string; email: string }[];
  prospects: readonly { email: string; url: string }[];
  leads: readonly { email: string; url: string }[];
}): DigestStats {
  const companyOf = (row: { prospect?: ProspectRelation }): string => {
    const one = Array.isArray(row.prospect) ? row.prospect[0] : row.prospect;
    return one?.company?.trim() || 'Unknown prospect';
  };
  const userEmails = new Map(input.users.map((user) => [user.id, user.email]));

  return {
    providerAccepted: input.sends.map((row) => ({ company: companyOf(row), score: row.score })),
    pixelLoads: input.pixelLoads.map((row) => ({ company: companyOf(row) })),
    possibleReportVisits: uniqueReportViewScanIds(input.reportViews).length,
    verifiedAuditRequests: input.audits.flatMap((row) => {
      const scan = Array.isArray(row.scan) ? row.scan[0] : row.scan;
      const reportEmail = row.guest_email ?? (row.user_id ? userEmails.get(row.user_id) : null);
      const scanDomain = normalizedRevenueDomain(scan?.domain);
      const matchingProspectEmails = input.prospects
        .filter((prospect) => normalizedRevenueDomain(prospect.url) === scanDomain)
        .map((prospect) => prospect.email);
      return isVerifiedExternalAuditRequest({
        domain: scan?.domain,
        runSource: scan?.run_source,
        reportEmail,
        prospectEmails: matchingProspectEmails,
      }) ? [{ domain: scan?.domain ?? 'unknown domain' }] : [];
    }),
    newLeads: input.leads.map((lead) => ({ email: lead.email, url: lead.url })),
  };
}

export function digestHasActivity(stats: DigestStats): boolean {
  return (
    stats.pixelLoads.length > 0 ||
    stats.possibleReportVisits > 0 ||
    stats.verifiedAuditRequests.length > 0 ||
    stats.newLeads.length > 0
  );
}

export function digestSubject(stats: DigestStats): string {
  const parts: string[] = [];
  if (stats.verifiedAuditRequests.length > 0) parts.push(`${String(stats.verifiedAuditRequests.length)} verified audit request${stats.verifiedAuditRequests.length > 1 ? 's' : ''}`);
  if (stats.possibleReportVisits > 0) parts.push(`${String(stats.possibleReportVisits)} possible report visit${stats.possibleReportVisits > 1 ? 's' : ''}`);
  if (stats.pixelLoads.length > 0) parts.push(`${String(stats.pixelLoads.length)} tracking-image load${stats.pixelLoads.length > 1 ? 's' : ''}`);
  if (stats.newLeads.length > 0) parts.push(`${String(stats.newLeads.length)} new lead${stats.newLeads.length > 1 ? 's' : ''}`);
  return `GEO-Pulse engagement: ${parts.join(' · ')}`;
}

function listHtml(title: string, rows: string[]): string {
  if (rows.length === 0) return '';
  const items = rows.map((r) => `<li style="margin:2px 0;">${r}</li>`).join('');
  return `<p style="margin:14px 0 4px;font-weight:700;">${escapeEmailHtml(title)}</p><ul style="margin:0;padding-left:18px;">${items}</ul>`;
}

export function buildEngagementDigestHtml(stats: DigestStats): string {
  const body = [
    `<p style="margin:0 0 6px;">Here are the evidence signals recorded in the last 24 hours. Measurement limits are stated explicitly; only verified requests, replies, and conversions should be treated as high intent.</p>`,
    listHtml(
      'Verified external full-audit requests',
      stats.verifiedAuditRequests.map((f) => `<strong>${escapeEmailHtml(f.domain)}</strong>`)
    ),
    stats.possibleReportVisits > 0
      ? `<p style="margin:14px 0 4px;font-weight:700;">Possible report visits</p><p style="margin:0;">${String(stats.possibleReportVisits)} unique report${stats.possibleReportVisits > 1 ? 's were' : ' was'} served. Duplicate server loads were collapsed; a mail-security scanner may still be responsible.</p>`
      : '',
    listHtml(
      'Tracking image loaded (weak signal; automation possible)',
      stats.pixelLoads.map((o) => escapeEmailHtml(o.company))
    ),
    listHtml(
      'New leads captured on the site',
      stats.newLeads.map((l) => `${escapeEmailHtml(l.email)} — ${escapeEmailHtml(l.url)}`)
    ),
    listHtml(
      'Scorecards accepted by the email provider (not confirmed delivered)',
      stats.providerAccepted.map((s) => `${escapeEmailHtml(s.company)}${s.score != null ? ` — scored ${String(s.score)}` : ''}`)
    ),
    `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Full funnel detail lives in /admin/outreach. This digest only arrives when something happened.</p>`,
  ]
    .filter(Boolean)
    .join('');

  return emailShell({
    kicker: 'Engagement digest · last 24 hours',
    bodyHtml: body,
    mastheadNote: 'Internal',
    sender: 'elena',
  });
}

export async function collectDigestStats(supabase: SupabaseClient, sinceIso: string): Promise<DigestStats> {
  const [sendsRes, opensRes, viewsRes, auditsRes, leadsRes, prospectsRes] = await Promise.all([
    supabase.from('outreach_sends').select('score, sent_at, prospect:outreach_prospects(company)').eq('delivery_status', 'sent').gt('sent_at', sinceIso).limit(50),
    supabase.from('outreach_sends').select('prospect:outreach_prospects(company), opened_at').eq('delivery_status', 'sent').gt('opened_at', sinceIso).limit(50),
    supabase.from('app_logs').select('data').eq('event', 'outreach_report_viewed').gt('created_at', sinceIso).limit(200),
    supabase.from('reports').select('created_at,guest_email,user_id,scan:scans(domain,run_source)').eq('type', 'deep_audit').gt('created_at', sinceIso).limit(50),
    supabase.from('leads').select('email, url, created_at').gt('created_at', sinceIso).limit(50),
    supabase.from('outreach_prospects').select('email,url').limit(1000),
  ]);

  const auditRows = (auditsRes.data ?? []) as DigestAuditRow[];
  const userIds = [...new Set(auditRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
  const usersRes = userIds.length > 0
    ? await supabase.from('users').select('id,email').in('id', userIds)
    : { data: [] as { id: string; email: string }[] };
  return assembleDigestStats({
    sends: (sendsRes.data ?? []) as { score: number | null; prospect?: ProspectRelation }[],
    pixelLoads: (opensRes.data ?? []) as { prospect?: ProspectRelation }[],
    reportViews: (viewsRes.data ?? []) as { data?: { scanId?: string | null } | null }[],
    audits: auditRows,
    users: (usersRes.data ?? []) as { id: string; email: string }[],
    prospects: (prospectsRes.data ?? []) as { email: string; url: string }[],
    leads: (leadsRes.data ?? []) as { email: string; url: string }[],
  });
}

type DigestEnvLike = { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string };

/** Runs every cron tick; self-gates on hour, flag, recipient, once-per-day, and activity. */
export async function runEngagementDigest(args: {
  supabase: SupabaseClient;
  env: DigestEnvLike;
  nowMs: number;
}): Promise<{ sent: boolean; reason: string }> {
  const { supabase, env, nowMs } = args;
  const now = new Date(nowMs);
  if (now.getUTCHours() !== DIGEST_HOUR_UTC) return { sent: false, reason: 'not_the_hour' };

  if (!(await isAgentEnabled(supabase, 'engagement_digest', { failOpen: true }))) {
    return { sent: false, reason: 'disabled' };
  }

  const setting = await loadAutomationSetting(supabase, 'engagement_digest');
  const today = now.toISOString().slice(0, 10);
  if (setting.config['last_digest_date'] === today) return { sent: false, reason: 'already_sent_today' };

  const configRecipient = typeof setting.config['recipient'] === 'string' ? (setting.config['recipient'] as string).trim() : '';
  const selfImprove = await loadSelfImprovementSettings(supabase);
  const recipient = configRecipient || selfImprove.reportRecipient || '';
  if (!recipient) return { sent: false, reason: 'no_recipient' };

  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return { sent: false, reason: 'resend_not_configured' };

  const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const stats = await collectDigestStats(supabase, since);
  if (!digestHasActivity(stats)) {
    // Mark the day so we don't re-query every tick of the hour on retries.
    await updateAutomationSetting(supabase, 'engagement_digest', { config: { ...setting.config, last_digest_date: today } }, null);
    return { sent: false, reason: 'no_activity' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: digestSubject(stats),
      html: buildEngagementDigestHtml(stats),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    structuredLog('engagement_digest_send_failed', { status: res.status }, 'warning');
    return { sent: false, reason: `resend_http_${String(res.status)}` };
  }

  await updateAutomationSetting(supabase, 'engagement_digest', { config: { ...setting.config, last_digest_date: today } }, null);
  structuredLog('engagement_digest_sent', { recipient, subject: digestSubject(stats) }, 'info');
  return { sent: true, reason: 'sent' };
}
