import { escapeHtml, uint8ToBase64 } from './resend-delivery-helpers';
import type { GpmReportPayload } from '@/lib/server/geo-performance-report-payload';

export type GpmEmailResult = { ok: true } | { ok: false; message: string };

// ── HTML builder ──────────────────────────────────────────────────────────────

function platformLabel(platform: string): string {
  if (platform === 'chatgpt')    return 'ChatGPT';
  if (platform === 'gemini')     return 'Gemini';
  if (platform === 'perplexity') return 'Perplexity';
  return platform;
}

function platformColor(platform: string): string {
  if (platform === 'chatgpt')    return '#0f7a5c';
  if (platform === 'gemini')     return '#3a62be';
  return '#7a3da0';
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmtRank(v: number | null): string {
  return v !== null ? `#${String(Math.round(v * 10) / 10)}` : '\u2014';
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatWindow(w: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(w);
  if (m) {
    const month = MONTH_NAMES[parseInt(m[2]!, 10) - 1] ?? m[2]!;
    return `${month} ${m[1]!}`;
  }
  const wk = /^(\d{4})-W(\d+)$/.exec(w);
  if (wk) return `Week ${String(parseInt(wk[2]!, 10))}, ${wk[1]!}`;
  return w;
}

function buildGpmEmailHtml(input: {
  payload: GpmReportPayload;
  narrative: string | null;
  pdfUrl: string | null;
  attachPdf: boolean;
}): string {
  const { payload, narrative, pdfUrl, attachPdf } = input;
  const { domain, topic, location, platform, windowDate,
          visibilityPct, citationRate, industryRank,
          prompts, opportunities, competitors } = payload;

  const period      = formatWindow(windowDate);
  const pl          = platformLabel(platform);
  const pColor      = platformColor(platform);
  const citedCount  = prompts.filter((p) => p.cited).length;
  const totalCount  = prompts.length;

  // Visibility stat cards
  const statsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin:24px 0;">
      <tr>
        <td style="background:#F8F9F9;border-radius:10px;padding:16px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:${pColor};">${fmtPct(visibilityPct)}</div>
          <div style="font-size:11px;color:#586162;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;">AI Visibility</div>
          <div style="font-size:11px;color:#ABB4B5;">${pl}</div>
        </td>
        <td style="background:#F8F9F9;border-radius:10px;padding:16px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:#2C3435;">${fmtPct(citationRate)}</div>
          <div style="font-size:11px;color:#586162;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;">Citation Rate</div>
          <div style="font-size:11px;color:#ABB4B5;">${String(citedCount)} of ${String(totalCount)} queries</div>
        </td>
        <td style="background:#F8F9F9;border-radius:10px;padding:16px;text-align:center;width:33%;">
          <div style="font-size:28px;font-weight:700;color:#2C3435;">${fmtRank(industryRank)}</div>
          <div style="font-size:11px;color:#586162;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;">Avg. Rank</div>
          <div style="font-size:11px;color:#ABB4B5;">when cited</div>
        </td>
      </tr>
    </table>`;

  // Top opportunities (up to 3)
  let oppsHtml = '';
  if (opportunities.length > 0) {
    const rows = opportunities.slice(0, 3).map((o, i) => {
      const comp = o.topCompetitorInQuery
        ? `<br/><span style="color:#ABB4B5;font-size:12px;">appeared instead: ${escapeHtml(o.topCompetitorInQuery)}</span>`
        : '';
      return `<tr>
        <td style="padding:8px 12px;color:#ABB4B5;font-size:18px;font-weight:700;width:32px;">${String(i + 1).padStart(2, '0')}</td>
        <td style="padding:8px 12px;font-size:13px;color:#2C3435;">${escapeHtml(o.queryText)}${comp}</td>
      </tr>`;
    }).join('');
    oppsHtml = `
      <p style="font-size:15px;font-weight:700;color:#2C3435;margin:24px 0 8px;">Top opportunities</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F9;border-radius:10px;">
        ${rows}
      </table>`;
  }

  // Top competitors (up to 3)
  let compsHtml = '';
  if (competitors.length > 0) {
    const rows = competitors.slice(0, 3).map((c) => {
      const pct = Math.round((c.citationCount / totalCount) * 100);
      return `<tr>
        <td style="padding:6px 12px;font-size:13px;color:#2C3435;">${escapeHtml(c.name)}</td>
        <td style="padding:6px 12px;font-size:13px;color:#586162;text-align:right;">${String(c.citationCount)} quer${c.citationCount !== 1 ? 'ies' : 'y'} (${String(pct)}%)</td>
      </tr>`;
    }).join('');
    compsHtml = `
      <p style="font-size:15px;font-weight:700;color:#2C3435;margin:24px 0 8px;">Competitor co-citations</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F9;border-radius:10px;">
        ${rows}
      </table>`;
  }

  // PDF CTA
  let ctaHtml = '';
  if (pdfUrl) {
    ctaHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr><td align="center">
          <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;background:#565E74;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Download Full Report PDF</a>
        </td></tr>
      </table>`;
  } else if (attachPdf) {
    ctaHtml = `<p style="font-size:13px;color:#586162;margin-top:24px;">The full report PDF is attached to this email.</p>`;
  }

  const narrativeHtml = narrative
    ? `<p style="color:#2C3435;font-size:14px;line-height:1.65;margin:0 0 0;">${escapeHtml(narrative)}</p>`
    : '';

  const dateStr = new Date().toISOString().split('T')[0] ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F4;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:600px;">

  <!-- Header -->
  <tr><td style="background:#565E74;padding:0;">
    <div style="background:${pColor};height:4px;"></div>
    <div style="padding:20px 32px;">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">GEO-Pulse</span>
      <span style="color:rgba(255,255,255,0.65);font-size:13px;margin-left:12px;">GEO Performance Report</span>
    </div>
  </td></tr>

  <!-- Domain + period -->
  <tr><td style="padding:28px 32px 0;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#2C3435;">${escapeHtml(domain)}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#586162;">${escapeHtml(topic)} &middot; ${escapeHtml(location)} &middot; ${escapeHtml(pl)} &middot; ${escapeHtml(period)}</p>
  </td></tr>

  <!-- Narrative -->
  ${narrativeHtml ? `<tr><td style="padding:20px 32px 0;">${narrativeHtml}</td></tr>` : ''}

  <!-- Stats -->
  <tr><td style="padding:0 32px;">${statsHtml}</td></tr>

  <!-- Opportunities -->
  ${oppsHtml ? `<tr><td style="padding:0 32px;">${oppsHtml}</td></tr>` : ''}

  <!-- Competitors -->
  ${compsHtml ? `<tr><td style="padding:0 32px;">${compsHtml}</td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:0 32px;">${ctaHtml}</td></tr>

  <!-- Footer -->
  <tr><td style="padding:28px 32px;border-top:1px solid #F1F4F4;margin-top:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#ABB4B5;font-size:11px;">Powered by GEO-Pulse</td>
        <td style="color:#ABB4B5;font-size:11px;text-align:right;">${escapeHtml(dateStr)}</td>
      </tr>
    </table>
    <p style="color:#ABB4B5;font-size:11px;margin-top:8px;">Visibility data reflects AI responses captured during the measurement window. Results may vary across sessions.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function sendGpmReportEmail(input: {
  readonly apiKey: string;
  readonly from: string;
  readonly to: string;
  readonly payload: GpmReportPayload;
  readonly narrative?: string | null;
  readonly pdfBytes?: Uint8Array;
  readonly pdfUrl?: string | null;
  readonly idempotencyKey: string;
}): Promise<GpmEmailResult> {
  const attachPdf = !!(input.pdfBytes && input.pdfBytes.byteLength > 0 && !input.pdfUrl);

  const html = buildGpmEmailHtml({
    payload: input.payload,
    narrative: input.narrative ?? null,
    pdfUrl: input.pdfUrl ?? null,
    attachPdf,
  });

  const { domain, topic, location } = input.payload;
  const period = formatWindow(input.payload.windowDate);
  const subject = `GEO Performance Report — ${domain} · ${topic}, ${location} · ${period}`;

  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject,
    html,
  };

  if (attachPdf && input.pdfBytes) {
    const filename = `geo-performance-${domain}-${input.payload.windowDate}-${input.payload.platform}.pdf`;
    body['attachments'] = [{ filename, content: uint8ToBase64(input.pdfBytes) }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: text.slice(0, 500) };
  }
  return { ok: true };
}
