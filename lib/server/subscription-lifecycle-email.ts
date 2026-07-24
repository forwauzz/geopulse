import type { SupabaseClient } from '@supabase/supabase-js';
import { ctaButton, emailShell, escapeEmailHtml } from './email-theme';
import type { LeadEmailEnv } from './lead-email';

type LifecycleEmailEnv = LeadEmailEnv & { readonly NEXT_PUBLIC_APP_URL?: string };

function planName(bundleKey: string): string {
  if (bundleKey === 'agency_core') return 'Agency Core';
  if (bundleKey === 'agency_pro') return 'Agency Pro';
  return 'Startup Dev';
}

export function buildSubscriptionWelcomeEmail(args: {
  appUrl: string;
  bundleKey: string;
  organizationName: string | null;
}): { subject: string; html: string } {
  const agency = args.bundleKey === 'agency_core' || args.bundleKey === 'agency_pro';
  const name = args.organizationName?.trim();
  return {
    subject: `${planName(args.bundleKey)} is ready`,
    html: emailShell({
      kicker: 'Your workspace is ready',
      mastheadNote: planName(args.bundleKey),
      bodyHtml: [
        `<p style="margin:0 0 12px;">${name ? `<strong>${escapeEmailHtml(name)}</strong> is` : 'Your workspace is'} ready.</p>`,
        agency
          ? '<p style="margin:0 0 14px;">Start with three steps: add one client, run its baseline scan, then configure the prompts you want to measure across ChatGPT, Gemini, and Perplexity.</p>'
          : '<p style="margin:0 0 14px;">Start with a baseline scan, review the prioritized fixes, then configure the prompts you want to measure over time.</p>',
        ctaButton(agency ? 'Open your agency workspace' : 'Open your workspace', `${args.appUrl.replace(/\/$/, '')}/dashboard`),
        '<p style="margin:0;color:#586162;font-size:13px;">Your dashboard keeps audit history, reports, billing, and recurring measurement in one place.</p>',
      ].join('\n'),
      footerNote: 'You received this service email because your GEO-Pulse subscription was activated.',
    }),
  };
}

export function buildTrialEndingEmail(args: {
  appUrl: string;
  bundleKey: string;
}): { subject: string; html: string } {
  return {
    subject: `Your ${planName(args.bundleKey)} trial ends soon`,
    html: emailShell({
      kicker: 'Trial reminder',
      mastheadNote: planName(args.bundleKey),
      bodyHtml: [
        '<p style="margin:0 0 14px;">Your trial ends in about three days. Your plan will continue automatically unless you cancel before renewal.</p>',
        ctaButton('Review your plan and billing', `${args.appUrl.replace(/\/$/, '')}/dashboard/billing`),
        '<p style="margin:0;color:#586162;font-size:13px;">You can update your payment method, download invoices, or cancel from the secure Stripe billing portal.</p>',
      ].join('\n'),
      footerNote: 'This is a transactional reminder about your GEO-Pulse subscription.',
    }),
  };
}

async function sendLifecycleEmail(args: {
  env: LifecycleEmailEnv;
  to: string;
  email: { subject: string; html: string };
  idempotencyKey: string;
}): Promise<boolean> {
  const key = args.env.RESEND_API_KEY?.trim();
  const from = args.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({ from, to: args.to, ...args.email }),
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok;
}

async function userEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
  return typeof data?.email === 'string' ? data.email : null;
}

export async function sendSubscriptionWelcome(args: {
  supabase: SupabaseClient;
  env: LifecycleEmailEnv;
  userId: string;
  subscriptionId: string;
  bundleKey: string;
  organizationName: string | null;
}): Promise<boolean> {
  const to = await userEmail(args.supabase, args.userId);
  if (!to) return false;
  return sendLifecycleEmail({
    env: args.env,
    to,
    email: buildSubscriptionWelcomeEmail({
      appUrl: args.env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com',
      bundleKey: args.bundleKey,
      organizationName: args.organizationName,
    }),
    idempotencyKey: `subscription-welcome/${args.subscriptionId}`,
  });
}

export async function sendTrialEndingReminder(args: {
  supabase: SupabaseClient;
  env: LifecycleEmailEnv;
  userId: string;
  subscriptionId: string;
  bundleKey: string;
}): Promise<boolean> {
  const to = await userEmail(args.supabase, args.userId);
  if (!to) return false;
  return sendLifecycleEmail({
    env: args.env,
    to,
    email: buildTrialEndingEmail({
      appUrl: args.env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com',
      bundleKey: args.bundleKey,
    }),
    idempotencyKey: `subscription-trial-ending/${args.subscriptionId}`,
  });
}
