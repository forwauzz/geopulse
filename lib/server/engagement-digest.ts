/**
 * Engagement digest (issue #131) — the "someone is biting" ping.
 *
 * Once a day, ONLY when something happened, email the operator a short branded summary of
 * the last 24h of funnel activity: outreach sends, pixel opens, report views, completed
 * full audits, and new lead captures. Silence means nothing happened — the operator never
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
import { structuredLog } from './structured-log';

export const DIGEST_HOUR_UTC = 12; // 8 AM Montréal in summer

export type DigestStats = {
  sends: { company: string; score: number | null }[];
  opens: { company: string }[];
  views: number;
  fullAudits: { domain: string }[];
  newLeads: { email: string; url: string }[];
};

export function digestHasActivity(stats: DigestStats): boolean {
  return (
    stats.sends.length > 0 ||
    stats.opens.length > 0 ||
    stats.views > 0 ||
    stats.fullAudits.length > 0 ||
    stats.newLeads.length > 0
  );
}

export function digestSubject(stats: DigestStats): string {
  const parts: string[] = [];
  if (stats.fullAudits.length > 0) parts.push(`${String(stats.fullAudits.length)} full audit${stats.fullAudits.length > 1 ? 's' : ''}`);
  if (stats.views > 0) parts.push(`${String(stats.views)} report view${stats.views > 1 ? 's' : ''}`);
  if (stats.opens.length > 0) parts.push(`${String(stats.opens.length)} open${stats.opens.length > 1 ? 's' : ''}`);
  if (stats.newLeads.length > 0) parts.push(`${String(stats.newLeads.length)} new lead${stats.newLeads.length > 1 ? 's' : ''}`);
  if (parts.length === 0 && stats.sends.length > 0) parts.push(`${String(stats.sends.length)} sends delivered`);
  return `GEO-Pulse engagement: ${parts.join(' · ')}`;
}

function listHtml(title: string, rows: string[]): string {
  if (rows.length === 0) return '';
  const items = rows.map((r) => `<li style="margin:2px 0;">${r}</li>`).join('');
  return `<p style="margin:14px 0 4px;font-weight:700;">${escapeEmailHtml(title)}</p><ul style="margin:0;padding-left:18px;">${items}</ul>`;
}

export function buildEngagementDigestHtml(stats: DigestStats): string {
  const body = [
    `<p style="margin:0 0 6px;">Here is what moved in the last 24 hours. The people below are engaging — a short personal follow-up lands best while it is fresh.</p>`,
    listHtml(
      'Ran the FULL audit (hottest signal)',
      stats.fullAudits.map((f) => `<strong>${escapeEmailHtml(f.domain)}</strong>`)
    ),
    stats.views > 0
      ? `<p style="margin:14px 0 4px;font-weight:700;">Report views</p><p style="margin:0;">Cadence reports were opened in a browser ${String(stats.views)} time${stats.views > 1 ? 's' : ''}.</p>`
      : '',
    listHtml(
      'Opened their email (pixel floor)',
      stats.opens.map((o) => escapeEmailHtml(o.company))
    ),
    listHtml(
      'New leads captured on the site',
      stats.newLeads.map((l) => `${escapeEmailHtml(l.email)} — ${escapeEmailHtml(l.url)}`)
    ),
    listHtml(
      'Scorecards delivered',
      stats.sends.map((s) => `${escapeEmailHtml(s.company)}${s.score != null ? ` — scored ${String(s.score)}` : ''}`)
    ),
    `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Full funnel detail lives in /admin/outreach. This digest only arrives when something happened.</p>`,
  ]
    .filter(Boolean)
    .join('');

  return emailShell({
    kicker: 'Engagement digest · last 24 hours',
    bodyHtml: body,
    mastheadNote: 'Internal',
  });
}

export async function collectDigestStats(supabase: SupabaseClient, sinceIso: string): Promise<DigestStats> {
  const [sendsRes, opensRes, viewsRes, auditsRes, leadsRes] = await Promise.all([
    supabase.from('outreach_sends').select('score, sent_at, prospect:outreach_prospects(company)').gt('sent_at', sinceIso).limit(50),
    supabase.from('outreach_sends').select('prospect:outreach_prospects(company), opened_at').gt('opened_at', sinceIso).limit(50),
    supabase.from('app_logs').select('id').eq('event', 'outreach_report_viewed').gt('created_at', sinceIso).limit(200),
    supabase.from('reports').select('created_at, scan:scans(domain)').eq('type', 'deep_audit').gt('created_at', sinceIso).limit(50),
    supabase.from('leads').select('email, url, created_at').gt('created_at', sinceIso).limit(50),
  ]);

  const companyOf = (row: unknown): string => {
    const prospect = (row as { prospect?: { company?: string | null } | { company?: string | null }[] }).prospect;
    const one = Array.isArray(prospect) ? prospect[0] : prospect;
    return one?.company?.trim() || 'Unknown prospect';
  };

  return {
    sends: ((sendsRes.data ?? []) as { score: number | null }[]).map((r) => ({ company: companyOf(r), score: r.score })),
    opens: (opensRes.data ?? []).map((r) => ({ company: companyOf(r) })),
    views: (viewsRes.data ?? []).length,
    fullAudits: ((auditsRes.data ?? []) as { scan?: { domain?: string } | { domain?: string }[] }[]).map((r) => {
      const scan = Array.isArray(r.scan) ? r.scan[0] : r.scan;
      return { domain: scan?.domain ?? 'unknown domain' };
    }),
    newLeads: ((leadsRes.data ?? []) as { email: string; url: string }[]).map((l) => ({ email: l.email, url: l.url })),
  };
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
