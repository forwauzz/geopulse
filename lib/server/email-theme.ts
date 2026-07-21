/**
 * The ONE email design system (issue #106) — every email GEO-Pulse sends renders in
 * the same brand: navy masthead, gold kicker, Georgia editorial voice, score gauge,
 * Montréal provenance. If two emails look different, one of them is a bug.
 *
 * Everything is table-based inline-styled HTML — the only thing email clients respect.
 */

export const EMAIL_COLORS = {
  primary: '#565E74', // brand navy (matches report covers + site)
  gold: '#8A7A4A', // kicker / editorial accent
  ink: '#1A1A1A',
  body: '#2C3435',
  muted: '#586162',
  faint: '#9AA1A2',
  bg: '#F1F4F4',
  card: '#FFFFFF',
  track: '#E5E9E9',
  green: '#1F7A4D',
  amber: '#8A6D1F',
  red: '#9E3F3D',
} as const;

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Big score + grade with a table-based gauge bar — the signature visual. */
export function scoreBlock(score: number, grade: string, label?: string): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const fill = clamped >= 80 ? EMAIL_COLORS.green : clamped >= 55 ? EMAIL_COLORS.gold : EMAIL_COLORS.red;
  return [
    label
      ? `<p style="margin:0 0 4px;color:${EMAIL_COLORS.muted};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${escapeEmailHtml(label)}</p>`
      : '',
    `<p style="margin:0;font-family:Georgia,serif;color:${EMAIL_COLORS.ink};"><span style="font-size:46px;font-weight:700;">${String(clamped)}</span><span style="font-size:16px;color:${EMAIL_COLORS.muted};"> / 100 · Grade ${escapeEmailHtml(grade)}</span></p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;"><tr>`,
    `<td width="${String(clamped)}%" style="background:${fill};height:8px;border-radius:4px 0 0 4px;font-size:0;line-height:0;">&nbsp;</td>`,
    `<td width="${String(100 - clamped)}%" style="background:${EMAIL_COLORS.track};height:8px;border-radius:0 4px 4px 0;font-size:0;line-height:0;">&nbsp;</td>`,
    `</tr></table>`,
  ].join('\n');
}

export function ctaButton(labelText: string, url: string): string {
  return `<p style="margin:24px 0;"><a href="${url}" style="background:${EMAIL_COLORS.primary};color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:600;display:inline-block;">${escapeEmailHtml(labelText)}</a></p>`;
}

/** Numbered issue list with fixes — the "we know our shit" block. */
export function issueListHtml(items: ReadonlyArray<{ check?: string; fix?: string }>, heading = 'The biggest opportunities we found'): string {
  const rows = items
    .slice(0, 3)
    .map(
      (issue, i) =>
        `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;color:${EMAIL_COLORS.gold};font-family:Georgia,serif;font-size:20px;font-weight:700;width:28px;">${String(i + 1)}</td>` +
        `<td style="padding:8px 0;"><strong style="color:${EMAIL_COLORS.body};font-size:14px;">${escapeEmailHtml(issue.check ?? 'Check')}</strong>` +
        `${issue.fix ? `<br/><span style="color:${EMAIL_COLORS.muted};font-size:13px;line-height:1.5;">${escapeEmailHtml(issue.fix)}</span>` : ''}</td></tr>`
    )
    .join('');
  if (!rows) return '';
  return [
    `<p style="margin:20px 0 4px;color:${EMAIL_COLORS.gold};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">${escapeEmailHtml(heading)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
  ].join('\n');
}

/**
 * The shell. Body goes in the white card; the masthead, editorial footer, Montréal
 * identification, optional unsubscribe, and optional tracking pixel are the frame no
 * sender may omit.
 */
export function emailShell(input: {
  kicker: string;
  bodyHtml: string;
  /** e.g. 'Daily self-improvement report' — right side of the masthead. */
  mastheadNote?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
  pixelUrl?: string;
}): string {
  return [
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>`,
    `<body style="margin:0;padding:0;background:${EMAIL_COLORS.bg};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.bg};padding:32px 0;"><tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.card};border-radius:12px;overflow:hidden;max-width:600px;width:100%;">`,
    // Masthead — navy band, wordmark, note.
    `<tr><td style="background:${EMAIL_COLORS.primary};padding:22px 32px;">`,
    `<span style="color:#ffffff;font-family:Georgia,serif;font-size:21px;font-weight:700;">GEO-Pulse</span>`,
    input.mastheadNote
      ? `<span style="color:rgba(255,255,255,0.72);font-family:Arial,sans-serif;font-size:12px;margin-left:12px;">${escapeEmailHtml(input.mastheadNote)}</span>`
      : '',
    `</td></tr>`,
    // Gold kicker.
    `<tr><td style="padding:24px 32px 0;">`,
    `<p style="margin:0;color:${EMAIL_COLORS.gold};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-family:Arial,sans-serif;">${escapeEmailHtml(input.kicker)}</p>`,
    `</td></tr>`,
    // Body card.
    `<tr><td style="padding:12px 32px 24px;font-family:Georgia,serif;color:${EMAIL_COLORS.body};font-size:15px;line-height:1.6;">`,
    input.bodyHtml,
    `</td></tr>`,
    // Editorial footer.
    `<tr><td style="padding:20px 32px 24px;border-top:1px solid ${EMAIL_COLORS.bg};">`,
    `<p style="margin:0;color:${EMAIL_COLORS.faint};font-size:12px;font-family:Arial,sans-serif;line-height:1.6;">— GEO-Pulse · editorial intelligence for AI search readiness<br/>Montréal, Québec, Canada · <a href="https://getgeopulse.com" style="color:${EMAIL_COLORS.faint};">getgeopulse.com</a>${input.footerNote ? `<br/>${escapeEmailHtml(input.footerNote)}` : ''}</p>`,
    input.unsubscribeUrl
      ? `<p style="margin:8px 0 0;color:${EMAIL_COLORS.faint};font-size:11px;font-family:Arial,sans-serif;">No longer want these audits? <a href="${input.unsubscribeUrl}" style="color:${EMAIL_COLORS.faint};">Unsubscribe</a> — one click, effective immediately.</p>`
      : '',
    `</td></tr>`,
    `</table>`,
    input.pixelUrl ? `<img src="${input.pixelUrl}" width="1" height="1" alt="" style="display:block;" />` : '',
    `</td></tr></table></body></html>`,
  ].join('\n');
}
