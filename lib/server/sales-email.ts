import { ctaButton, emailShell, escapeEmailHtml } from './email-theme';

export type SalesEmailEnv = {
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly SALES_REPLY_TO_EMAIL?: string;
};

export function buildWalkthroughConfirmationEmail(args: {
  readonly appUrl: string;
  readonly name: string;
  readonly website: string;
}): { subject: string; html: string } {
  const scanUrl = `${args.appUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(args.website)}#audit`;
  return {
    subject: 'Your GEO-Pulse walkthrough request',
    html: emailShell({
      kicker: 'Walkthrough request received',
      mastheadNote: 'GEO-Pulse',
      sender: 'elena',
      bodyHtml: [
        `<p style="margin:0 0 10px;">Hi ${escapeEmailHtml(args.name)},</p>`,
        `<p style="margin:0 0 14px;">We received your request to review <strong>${escapeEmailHtml(args.website)}</strong>.</p>`,
        '<p style="margin:0 0 18px;">Elena will look at the public site and reply with the most useful next step. This request does not add you to a marketing list.</p>',
        ctaButton('Run the free scan now', scanUrl),
      ].join('\n'),
      footerNote: 'You requested this one-time confirmation from GEO-Pulse.',
    }),
  };
}

export function buildWalkthroughOperatorEmail(args: {
  readonly appUrl: string;
  readonly leadId: string;
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly website: string;
  readonly note: string | null;
  readonly source: string;
}): { subject: string; html: string } {
  const adminUrl = `${args.appUrl.replace(/\/$/, '')}/admin/outreach`;
  const note = args.note
    ? `<p style="margin:14px 0 0;"><strong>Context:</strong> ${escapeEmailHtml(args.note)}</p>`
    : '';
  return {
    subject: `Walkthrough request: ${args.company}`,
    html: emailShell({
      kicker: 'Sales request · action required',
      mastheadNote: 'Owner: Elena',
      sender: 'elena',
      bodyHtml: [
        `<p style="margin:0;"><strong>${escapeEmailHtml(args.name)}</strong> at ${escapeEmailHtml(args.company)} requested a walkthrough.</p>`,
        `<p style="margin:14px 0 0;"><strong>Email:</strong> ${escapeEmailHtml(args.email)}<br/><strong>Website:</strong> ${escapeEmailHtml(args.website)}<br/><strong>Source:</strong> ${escapeEmailHtml(args.source)}<br/><strong>Lead:</strong> ${escapeEmailHtml(args.leadId)}</p>`,
        note,
        '<p style="margin:14px 0 18px;"><strong>Next action:</strong> review the site, reply personally, and schedule a focused walkthrough. Close on reply, disqualification, or conversion.</p>',
        ctaButton('Open outreach control room', adminUrl),
      ].join('\n'),
      footerNote: 'Internal GEO-Pulse sales routing notification.',
    }),
  };
}

export async function sendSalesEmail(args: {
  readonly env: SalesEmailEnv;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly idempotencyKey: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const key = args.env.RESEND_API_KEY?.trim();
  const from = args.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return { ok: false, reason: 'email_not_configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        ...(args.env.SALES_REPLY_TO_EMAIL?.trim()
          ? { reply_to: args.env.SALES_REPLY_TO_EMAIL.trim() }
          : {}),
      }),
    });
    return response.ok
      ? { ok: true }
      : { ok: false, reason: `resend_${String(response.status)}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'email_failed' };
  }
}
