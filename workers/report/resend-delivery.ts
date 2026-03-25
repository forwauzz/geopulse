function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export type ResendEmailResult = { ok: true } | { ok: false; message: string };

export type DeepAuditDownloadLinks = {
  readonly pdfUrl: string;
  readonly markdownUrl?: string;
};

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
  /** Resend dedupes within 24h — safe when queue retries or DLQ replays. */
  idempotencyKey: string;
  /** When false, link-only (requires `downloadLinks`). */
  attachPdf: boolean;
  downloadLinks?: DeepAuditDownloadLinks;
}): Promise<ResendEmailResult> {
  if (!input.attachPdf && !input.downloadLinks?.pdfUrl) {
    return { ok: false, message: 'deep_audit_email_requires_pdf_link_when_no_attachment' };
  }

  const parts: string[] = [];
  parts.push(
    `<p>Your full <strong>AI Search Readiness</strong> checklist for ${escapeHtml(input.url)}.</p>`
  );

  if (input.downloadLinks) {
    parts.push('<p><strong>Downloads</strong></p><ul>');
    parts.push(
      `<li><a href="${escapeHtml(input.downloadLinks.pdfUrl)}">PDF report</a></li>`
    );
    if (input.downloadLinks.markdownUrl) {
      parts.push(
        `<li><a href="${escapeHtml(input.downloadLinks.markdownUrl)}">Markdown report</a></li>`
      );
    }
    parts.push('</ul>');
  }

  if (input.attachPdf) {
    parts.push('<p>The PDF is also attached to this message.</p>');
  } else if (input.downloadLinks) {
    parts.push('<p>Your report is available via the links above (attachment omitted due to size).</p>');
  } else {
    parts.push('<p>Report delivery incomplete — contact support.</p>');
  }

  parts.push('<p>Thank you for using GEO-Pulse.</p>');
  const html = parts.join('');

  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: `Your GEO-Pulse deep audit — ${input.domain}`,
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
