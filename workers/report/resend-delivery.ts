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

/**
 * Send deep-audit PDF via Resend HTTP API (Workers-safe, no Node-only SDK paths).
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
}): Promise<ResendEmailResult> {
  const b64 = uint8ToBase64(input.pdfBytes);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `Your GEO-Pulse deep audit — ${input.domain}`,
      html: `<p>Your full <strong>AI Search Readiness</strong> checklist for ${escapeHtml(input.url)} is attached.</p><p>Thank you for using GEO-Pulse.</p>`,
      attachments: [{ filename: input.filename, content: b64 }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, message: t.slice(0, 500) };
  }
  return { ok: true };
}
