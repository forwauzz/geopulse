import { escapeHtml, uint8ToBase64 } from './resend-delivery-helpers';
import { GEO_PULSE_BRAND, type BrandConfig } from './report-branding';
import type { AgencyReportSnapshotV2 } from '@/lib/server/agency-report-snapshot';
import { buildAgencyExecutiveSummary } from '@/lib/server/agency-report-pdf';

export type AgencyReportEmailResult = { ok: true } | { ok: false; message: string };

function pct(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function brandCss(brand: BrandConfig): string {
  return `rgb(${String(Math.round(brand.primary.r * 255))},${String(Math.round(brand.primary.g * 255))},${String(Math.round(brand.primary.b * 255))})`;
}

export function buildAgencyReportEmailHtml(input: {
  readonly snapshot: AgencyReportSnapshotV2;
  readonly brand?: BrandConfig;
  readonly secureReportUrl?: string | null;
  readonly attachPdf?: boolean;
}): string {
  const { snapshot } = input;
  const brand = input.brand ?? GEO_PULSE_BRAND;
  const engines = snapshot.engines.map((engine) => `<td style="padding:12px;border:1px solid #e7eaec;border-radius:10px;text-align:center;">
    <div style="font-size:11px;color:#667085;font-weight:700;">${escapeHtml(engine.label)}</div>
    <div style="font-size:26px;line-height:1.25;color:#101828;font-weight:800;">${pct(engine.visibilityPct)}</div>
    <div style="font-size:11px;color:#667085;">${String(engine.queriesCited)} of ${String(engine.queriesTracked)} answers</div>
  </td>`).join('<td style="width:8px"></td>');
  const wins = snapshot.wins.slice(0, 2).map((question) => `<li style="margin:0 0 8px;">${escapeHtml(question.queryText)} <strong>(${String(question.citedByEngines)}/${String(question.enginesMeasured)} assistants)</strong></li>`).join('');
  const opportunities = snapshot.opportunities.slice(0, 2).map((question) => `<li style="margin:0 0 8px;">${escapeHtml(question.queryText)}</li>`).join('');
  const cta = input.secureReportUrl
    ? `<a href="${escapeHtml(input.secureReportUrl)}" style="display:inline-block;background:${brandCss(brand)};color:#fff;padding:14px 24px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700;">View the full client report</a>`
    : input.attachPdf ? '<p style="color:#667085;font-size:13px;">The complete client report is attached.</p>' : '';

  return `<!doctype html><html lang="en"><body style="margin:0;background:#f2f4f7;font-family:Arial,sans-serif;color:#101828;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:${brandCss(brand)};padding:24px 30px;color:#fff;"><strong style="font-size:19px;">${escapeHtml(brand.companyName)}</strong><div style="font-size:12px;margin-top:6px;opacity:.85;">AI visibility performance report</div></td></tr>
      <tr><td style="padding:30px;">
        <div style="font-size:12px;color:#667085;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(snapshot.windowDate)}</div>
        <h1 style="font-size:25px;line-height:1.2;margin:8px 0 6px;">${escapeHtml(snapshot.clientName)}</h1>
        <div style="font-size:14px;color:#667085;">${escapeHtml(snapshot.topic)} &middot; ${escapeHtml(snapshot.location)}</div>
        <div style="margin:26px 0 8px;font-size:54px;line-height:1;font-weight:800;color:${brandCss(brand)};">${pct(snapshot.combinedVisibilityPct)}</div>
        <div style="font-size:14px;color:#475467;margin-bottom:24px;">${String(snapshot.evaluationsCited)} citations across ${String(snapshot.evaluationsTracked)} measured AI answers</div>
        <p style="font-size:14px;line-height:1.65;color:#344054;">${escapeHtml(buildAgencyExecutiveSummary(snapshot))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>${engines}</tr></table>
        ${wins ? `<h2 style="font-size:16px;margin:24px 0 10px;">Wins to share</h2><ul style="padding-left:20px;font-size:13px;line-height:1.5;color:#344054;">${wins}</ul>` : ''}
        ${opportunities ? `<h2 style="font-size:16px;margin:24px 0 10px;">Next growth opportunities</h2><ul style="padding-left:20px;font-size:13px;line-height:1.5;color:#344054;">${opportunities}</ul>` : ''}
        <p style="font-size:11px;line-height:1.5;color:#667085;background:#f9fafb;padding:12px;border-radius:8px;">${escapeHtml(snapshot.scope.disclosure)}</p>
        <div style="margin-top:28px;text-align:center;">${cta}</div>
      </td></tr>
      <tr><td style="padding:18px 30px;border-top:1px solid #eaecf0;font-size:11px;color:#98a2b3;">${escapeHtml(brand.footerNote ?? (brand.showPoweredBy ? 'Prepared with GEO-Pulse' : brand.companyName))} &middot; Results are dated measurements and can vary by AI session.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendAgencyReportEmail(input: {
  readonly apiKey: string;
  readonly from: string;
  readonly recipients: readonly string[];
  readonly replyTo?: string | null;
  readonly brand?: BrandConfig;
  readonly snapshot: AgencyReportSnapshotV2;
  readonly pdfBytes?: Uint8Array;
  readonly secureReportUrl?: string | null;
  readonly idempotencyKey: string;
}): Promise<AgencyReportEmailResult> {
  const attachPdf = Boolean(input.pdfBytes?.byteLength && !input.secureReportUrl);
  const html = buildAgencyReportEmailHtml({
    snapshot: input.snapshot,
    brand: input.brand,
    secureReportUrl: input.secureReportUrl,
    attachPdf,
  });
  const body: Record<string, unknown> = {
    from: input.from,
    to: input.recipients,
    subject: `${input.snapshot.clientName} AI visibility report - ${input.snapshot.windowDate}`,
    html,
  };
  if (input.replyTo) body['reply_to'] = input.replyTo;
  if (attachPdf && input.pdfBytes) {
    body['attachments'] = [{
      filename: `ai-visibility-${input.snapshot.domain}-${input.snapshot.windowDate}.pdf`,
      content: uint8ToBase64(input.pdfBytes),
    }];
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, message: (await response.text()).slice(0, 500) };
  return { ok: true };
}
