export type ResendEmailResult = { ok: true } | { ok: false; message: string };
import {
  buildDeliveryCallToAction,
  escapeHtml,
  gradeColor,
  severityColor,
  severityLabel,
  uint8ToBase64,
  type DeepAuditDownloadLinks,
  type EmailIssueRow,
} from './resend-delivery-helpers';

export type { DeepAuditDownloadLinks, EmailIssueRow } from './resend-delivery-helpers';

function buildBrandedHtml(input: {
  domain: string;
  url: string;
  score?: number;
  grade?: string;
  topIssues?: readonly EmailIssueRow[];
  totalChecks?: number;
  passedChecks?: number;
  attachPdf: boolean;
  downloadLinks?: DeepAuditDownloadLinks;
  scanId?: string;
  appUrl?: string;
}): string {
  const score = input.score ?? 0;
  const grade = input.grade ?? '—';
  const total = input.totalChecks ?? 0;
  const passed = input.passedChecks ?? 0;
  const topIssue = input.topIssues?.[0]?.check ?? '';

  const narrative = `Your site scored ${String(score)}/100 (${grade}). ${String(passed)} of ${String(total)} checks passed. ${topIssue ? `The most critical gap is: ${escapeHtml(topIssue)}.` : 'No critical issues detected.'}`;

  const gClr = gradeColor(grade);

  let prioritiesHtml = '';
  if (input.topIssues && input.topIssues.length > 0) {
    const rows = input.topIssues.slice(0, 3).map((issue, i) => {
      const sev = severityLabel(issue.weight);
      const sClr = severityColor(sev);
      const num = String(i + 1).padStart(2, '0');
      const fix = issue.fix ? `<br/><span style="color:#586162;font-size:13px;">${escapeHtml(issue.fix)}</span>` : '';
      return `<tr><td style="padding:8px 12px;vertical-align:top;color:#ABB4B5;font-size:20px;font-weight:700;width:36px;">${num}</td><td style="padding:8px 12px;"><span style="display:inline-block;background:${sClr};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:4px;">${sev}</span><br/><strong style="color:#2C3435;font-size:14px;">${escapeHtml(issue.check)}</strong>${fix}</td></tr>`;
    });
    prioritiesHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr><td style="padding:0 0 8px 12px;font-size:16px;font-weight:700;color:#2C3435;">Your top priorities</td></tr>
        ${rows.join('')}
      </table>`;
  }

  const { ctaHref, ctaLabel, attachNote } = buildDeliveryCallToAction({
    attachPdf: input.attachPdf,
    downloadLinks: input.downloadLinks,
    scanId: input.scanId,
    appUrl: input.appUrl,
  });

  let downloadHtml = '';
  if (ctaHref) {
    downloadHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr><td align="center">
          <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#565E74;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">${ctaLabel}</a>
        </td></tr>
      </table>`;
  }

  const scanIdNote = input.scanId ? `<span style="color:#ABB4B5;font-size:11px;">Scan ${escapeHtml(input.scanId.slice(0, 8))}</span>` : '';
  const dateStr = new Date().toISOString().split('T')[0] ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F4;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:600px;">

  <!-- Header -->
  <tr><td style="background:#565E74;padding:24px 32px;">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">GEO-Pulse</span>
    <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:12px;">AI Search Readiness Report</span>
  </td></tr>

  <!-- Score badge -->
  <tr><td style="padding:32px 32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="background:#F8F9F9;border-radius:12px;padding:20px 32px;text-align:center;">
          <div style="font-size:48px;font-weight:700;color:#2C3435;line-height:1;">${String(score)}</div>
          <div style="color:#586162;font-size:13px;margin-top:4px;">/ 100</div>
        </td>
        <td style="padding-left:20px;">
          <div style="display:inline-block;background:${gClr};color:#fff;width:48px;height:48px;border-radius:50%;text-align:center;line-height:48px;font-size:22px;font-weight:700;">${escapeHtml(grade)}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Domain -->
  <tr><td style="padding:0 32px;text-align:center;">
    <p style="color:#586162;font-size:14px;margin:0;">${escapeHtml(input.domain)}</p>
  </td></tr>

  <!-- Executive summary -->
  <tr><td style="padding:20px 32px 0;">
    <p style="color:#2C3435;font-size:14px;line-height:1.6;margin:0;">${narrative}</p>
  </td></tr>

  <!-- Top priorities -->
  <tr><td style="padding:0 20px;">${prioritiesHtml}</td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 32px;">${downloadHtml}${attachNote}</td></tr>

  <!-- Footer -->
  <tr><td style="padding:32px;border-top:1px solid #F1F4F4;margin-top:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#ABB4B5;font-size:11px;">Powered by GEO-Pulse</td>
        <td style="color:#ABB4B5;font-size:11px;text-align:right;">${scanIdNote} &middot; ${escapeHtml(dateStr)}</td>
      </tr>
    </table>
    <p style="color:#ABB4B5;font-size:11px;margin-top:8px;">This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Send deep-audit email: attach PDF when small enough and `attachPdf` is true; always include optional R2 links in HTML.
 */
export async function sendDeepAuditEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  domain: string;
  url: string;
  pdfBytes: Uint8Array;
  filename: string;
  idempotencyKey: string;
  attachPdf: boolean;
  downloadLinks?: DeepAuditDownloadLinks;
  score?: number;
  grade?: string;
  topIssues?: readonly EmailIssueRow[];
  totalChecks?: number;
  passedChecks?: number;
  scanId?: string;
  appUrl?: string;
}): Promise<ResendEmailResult> {
  if (!input.attachPdf && !input.downloadLinks?.pdfUrl) {
    return { ok: false, message: 'deep_audit_email_requires_pdf_link_when_no_attachment' };
  }

  const html = buildBrandedHtml({
    domain: input.domain,
    url: input.url,
    score: input.score,
    grade: input.grade,
    topIssues: input.topIssues,
    totalChecks: input.totalChecks,
    passedChecks: input.passedChecks,
    attachPdf: input.attachPdf,
    downloadLinks: input.downloadLinks,
    scanId: input.scanId,
    appUrl: input.appUrl,
  });

  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: `Your AI Search Readiness Report — ${input.domain}`,
    html,
  };

  if (input.attachPdf && input.pdfBytes.byteLength > 0) {
    body['attachments'] = [
      { filename: input.filename, content: uint8ToBase64(input.pdfBytes) },
    ];
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
    const t = await res.text();
    return { ok: false, message: t.slice(0, 500) };
  }
  return { ok: true };
}
