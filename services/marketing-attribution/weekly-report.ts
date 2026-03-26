import type { SupabaseClient } from '@supabase/supabase-js';

export type FunnelRow = {
  week_start: string;
  channel: string;
  utm_source: string | null;
  utm_campaign: string | null;
  sessions: number;
  scans_started: number;
  scans_completed: number;
  leads_submitted: number;
  checkouts_started: number;
  payments_completed: number;
};

export type ConversionRow = {
  payment_ts: string;
  last_touch_channel: string | null;
  last_touch_utm_source: string | null;
  last_touch_utm_campaign: string | null;
  seconds_to_convert_from_first_touch: number | null;
};

export type WeeklyReportData = {
  funnel: FunnelRow[];
  conversions: ConversionRow[];
  weekLabel: string;
};

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().split('T')[0]!;
}

export async function fetchWeeklyReportData(supabase: SupabaseClient): Promise<WeeklyReportData> {
  const weekStart = mondayOfCurrentWeek();

  const { data: funnel } = await supabase
    .schema('analytics')
    .from('channel_funnel_weekly_v1')
    .select('*')
    .gte('week_start', weekStart)
    .order('payments_completed', { ascending: false })
    .limit(50);

  const { data: conversions } = await supabase
    .schema('analytics')
    .from('attribution_conversions_v1')
    .select('payment_ts,last_touch_channel,last_touch_utm_source,last_touch_utm_campaign,seconds_to_convert_from_first_touch')
    .gte('payment_ts', `${weekStart}T00:00:00Z`)
    .order('payment_ts', { ascending: false })
    .limit(50);

  return {
    funnel: (funnel ?? []) as FunnelRow[],
    conversions: (conversions ?? []) as ConversionRow[],
    weekLabel: `Week of ${weekStart}`,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function funnelTableHtml(rows: FunnelRow[]): string {
  if (rows.length === 0) return '<p style="color:#586162;">No events this week yet.</p>';
  const thead = `<tr style="background:#F1F4F4;">
    <th style="padding:6px 8px;text-align:left;font-size:12px;">Channel</th>
    <th style="padding:6px 8px;text-align:left;font-size:12px;">Source</th>
    <th style="padding:6px 8px;text-align:left;font-size:12px;">Campaign</th>
    <th style="padding:6px 8px;text-align:right;font-size:12px;">Scans</th>
    <th style="padding:6px 8px;text-align:right;font-size:12px;">Leads</th>
    <th style="padding:6px 8px;text-align:right;font-size:12px;">Checkouts</th>
    <th style="padding:6px 8px;text-align:right;font-size:12px;">Paid</th>
  </tr>`;
  const trows = rows.map((r) => `<tr>
    <td style="padding:4px 8px;font-size:13px;">${esc(r.channel)}</td>
    <td style="padding:4px 8px;font-size:13px;">${esc(r.utm_source ?? '—')}</td>
    <td style="padding:4px 8px;font-size:13px;">${esc(r.utm_campaign ?? '—')}</td>
    <td style="padding:4px 8px;font-size:13px;text-align:right;">${String(r.scans_completed)}</td>
    <td style="padding:4px 8px;font-size:13px;text-align:right;">${String(r.leads_submitted)}</td>
    <td style="padding:4px 8px;font-size:13px;text-align:right;">${String(r.checkouts_started)}</td>
    <td style="padding:4px 8px;font-size:13px;text-align:right;font-weight:700;">${String(r.payments_completed)}</td>
  </tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9E9;border-radius:6px;border-collapse:collapse;">${thead}${trows.join('')}</table>`;
}

function conversionSummaryHtml(rows: ConversionRow[]): string {
  if (rows.length === 0) return '<p style="color:#586162;">No conversions this week.</p>';
  const count = rows.length;
  const channels = rows.reduce<Record<string, number>>((acc, r) => {
    const ch = r.last_touch_channel ?? 'direct_or_unknown';
    acc[ch] = (acc[ch] ?? 0) + 1;
    return acc;
  }, {});
  const channelList = Object.entries(channels)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `${esc(ch)}: <strong>${String(n)}</strong>`)
    .join(' · ');

  const times = rows.filter((r) => r.seconds_to_convert_from_first_touch != null).map((r) => r.seconds_to_convert_from_first_touch!);
  let timeNote = '';
  if (times.length > 0) {
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const hrs = Math.round(median / 3600);
    timeNote = ` · Median time-to-convert: <strong>${hrs < 1 ? '<1' : String(hrs)}h</strong>`;
  }

  return `<p style="font-size:14px;color:#2C3435;"><strong>${String(count)}</strong> paid conversion${count === 1 ? '' : 's'} this week. ${channelList}${timeNote}</p>`;
}

export function buildWeeklyReportHtml(data: WeeklyReportData): string {
  const dateStr = new Date().toISOString().split('T')[0] ?? '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F4;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:640px;">
  <tr><td style="background:#565E74;padding:24px 32px;">
    <span style="color:#fff;font-size:20px;font-weight:700;">GEO-Pulse</span>
    <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:12px;">Weekly Attribution Report</span>
  </td></tr>
  <tr><td style="padding:24px 32px 8px;">
    <h2 style="margin:0;color:#2C3435;font-size:18px;">${esc(data.weekLabel)}</h2>
  </td></tr>
  <tr><td style="padding:8px 32px 16px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Conversions</h3>
    ${conversionSummaryHtml(data.conversions)}
  </td></tr>
  <tr><td style="padding:8px 32px 24px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Channel Funnel</h3>
    ${funnelTableHtml(data.funnel)}
  </td></tr>
  <tr><td style="padding:24px 32px;border-top:1px solid #F1F4F4;">
    <p style="color:#ABB4B5;font-size:11px;margin:0;">Generated ${esc(dateStr)} · Powered by GEO-Pulse</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export type SendWeeklyReportResult = { ok: true } | { ok: false; reason: string };

export async function sendWeeklyReport(input: {
  supabase: SupabaseClient;
  resendApiKey: string;
  from: string;
  to: string;
}): Promise<SendWeeklyReportResult> {
  const data = await fetchWeeklyReportData(input.supabase);
  const html = buildWeeklyReportHtml(data);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `GEO-Pulse Attribution Report — ${data.weekLabel}`,
      html,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, reason: t.slice(0, 500) };
  }
  return { ok: true };
}
