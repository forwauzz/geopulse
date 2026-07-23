import { ctaButton, emailShell, escapeEmailHtml, scoreBlock } from './email-theme';

export type LeadEmailEnv = {
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
};

function gradeForScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function buildSavedPreviewEmail(args: {
  readonly appUrl: string;
  readonly scanId: string;
  readonly url: string;
  readonly score: number;
}): { subject: string; html: string } {
  const base = args.appUrl.replace(/\/$/, '');
  const resultsUrl = `${base}/results/${args.scanId}`;
  const html = emailShell({
    kicker: 'Your saved GEO-Pulse preview',
    mastheadNote: 'AI search readiness',
    bodyHtml: [
      `<p style="margin:0 0 10px;">Your preview for <strong>${escapeEmailHtml(args.url)}</strong> is saved.</p>`,
      scoreBlock(args.score, gradeForScore(args.score), 'Current GEO readiness'),
      ctaButton('Return to your results', resultsUrl),
      '<p style="margin:0;color:#586162;font-size:13px;">Your results explain what AI answer engines can extract today and which improvements are most likely to make your business easier to cite.</p>',
    ].join('\n'),
    footerNote: 'You requested this one-time email when you saved your preview.',
  });
  return {
    subject: `Your GEO-Pulse preview: ${args.score}/100`,
    html,
  };
}

export function buildRevenueNurtureEmail(args: {
  readonly appUrl: string;
  readonly prospectId: string;
  readonly sendId: string;
  readonly scanId: string;
  readonly url: string;
  readonly score: number;
}): { subject: string; html: string } {
  const base = args.appUrl.replace(/\/$/, '');
  const resultsUrl = `${base}/results/${args.scanId}?utm_source=email&utm_medium=nurture&utm_campaign=monitoring`;
  const unsubscribeUrl = `${base}/api/outreach/unsubscribe/${args.prospectId}`;
  const pixelUrl = `${base}/api/outreach/open/${args.sendId}`;
  const html = emailShell({
    kicker: 'One useful next step',
    mastheadNote: 'GEO-Pulse Monitoring',
    bodyHtml: [
      `<p style="margin:0 0 10px;">You asked for GEO visibility tips after auditing <strong>${escapeEmailHtml(args.url)}</strong>.</p>`,
      scoreBlock(args.score, gradeForScore(args.score), 'Your audit baseline'),
      '<p style="margin:18px 0 0;">A single audit is a snapshot. Monthly monitoring turns it into a trend: what improved, what regressed, and whether competitors are becoming easier for AI systems to recommend.</p>',
      ctaButton('See your results and monitoring options', resultsUrl),
      '<p style="margin:0;color:#586162;font-size:13px;">Monitoring is optional. Your existing audit remains available whether or not you subscribe.</p>',
    ].join('\n'),
    unsubscribeUrl,
    pixelUrl,
  });
  return {
    subject: `Turn your ${args.score}/100 GEO score into a measurable baseline`,
    html,
  };
}

export async function sendLeadEmail(args: {
  readonly env: LeadEmailEnv;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const key = args.env.RESEND_API_KEY?.trim();
  const from = args.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return { ok: false, reason: 'email_not_configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
    });
    return response.ok
      ? { ok: true }
      : { ok: false, reason: `resend_${String(response.status)}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'email_failed' };
  }
}
