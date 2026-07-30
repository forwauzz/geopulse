import { z } from 'zod';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';
import { getClientIp, getPaymentApiEnv } from '@/lib/server/cf-env';
import { checkEmailLeadRateLimit, emailRateKey } from '@/lib/server/rate-limit-kv';
import {
  buildWalkthroughConfirmationEmail,
  buildWalkthroughOperatorEmail,
  sendSalesEmail,
} from '@/lib/server/sales-email';
import { structuredLogWithClientAndWait } from '@/lib/server/structured-log';
import { verifyTurnstileToken } from '@/lib/server/turnstile';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

const nullableAttribution = z.string().max(500).nullish();
const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  company: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  website: z.string().trim().url().max(2048),
  note: z.string().trim().max(500).nullish(),
  source: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  turnstileToken: z.string().min(1),
  anonymous_id: z.string().max(128).nullish(),
  utm_source: nullableAttribution,
  utm_medium: nullableAttribution,
  utm_campaign: nullableAttribution,
  utm_content: nullableAttribution,
  utm_term: nullableAttribution,
  referrer_url: z.string().url().max(2048).nullish(),
  landing_path: z.string().max(2048).nullish(),
});

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(emailRateKey(email));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const turnstile = await verifyTurnstileToken(
    env.TURNSTILE_SECRET_KEY,
    parsed.data.turnstileToken,
    getClientIp(request)
  );
  if (!turnstile.ok) {
    return Response.json(
      { error: { code: 'turnstile_failed', message: turnstile.error } },
      { status: 400 }
    );
  }

  const rateLimit = await checkEmailLeadRateLimit(
    env.SCAN_CACHE,
    await hashEmail(parsed.data.email)
  );
  if (!rateLimit.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Daily request limit reached.' } },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec ?? 86_400) },
      }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const normalizedEmail = emailRateKey(parsed.data.email);
  const note = parsed.data.note || null;
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      email: normalizedEmail,
      url: parsed.data.website,
      score: null,
      scan_id: null,
      source: parsed.data.source,
      name: parsed.data.name,
      company: parsed.data.company,
      request_type: 'walkthrough',
      message: note,
      status: 'new',
      owner: 'elena',
      next_action: 'review site and respond personally with a focused walkthrough',
      closure_condition: 'reply, disqualification, or active recurring subscription',
    })
    .select('id')
    .single();

  if (error || !lead?.id) {
    return Response.json(
      { error: { code: 'db_error', message: error?.message ?? 'lead_insert_failed' } },
      { status: 500 }
    );
  }

  const leadId = lead.id as string;
  await emitMarketingEvent(supabase, 'lead_submitted', {
    anonymous_id: parsed.data.anonymous_id,
    lead_id: leadId,
    email: normalizedEmail,
    utm_source: parsed.data.utm_source,
    utm_medium: parsed.data.utm_medium,
    utm_campaign: parsed.data.utm_campaign,
    utm_content: parsed.data.utm_content,
    utm_term: parsed.data.utm_term,
    referrer_url: parsed.data.referrer_url,
    landing_path: parsed.data.landing_path,
    channel: 'sales_assisted',
    content_id: parsed.data.source,
    metadata: {
      request_type: 'walkthrough',
      company: parsed.data.company,
      website: parsed.data.website,
    },
  });

  const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com';
  const confirmation = buildWalkthroughConfirmationEmail({
    appUrl,
    name: parsed.data.name,
    website: parsed.data.website,
  });
  const confirmationDelivery = await sendSalesEmail({
    env,
    to: normalizedEmail,
    subject: confirmation.subject,
    html: confirmation.html,
    idempotencyKey: `walkthrough-confirmation-${leadId}`,
  });

  const operatorRecipient =
    env.MARKETING_REPORT_TO?.trim() || env.SELF_IMPROVEMENT_REPORT_TO?.trim() || '';
  let operatorNotified = false;
  let operatorReason = 'operator_recipient_missing';
  if (operatorRecipient) {
    const operatorEmail = buildWalkthroughOperatorEmail({
      appUrl,
      leadId,
      name: parsed.data.name,
      email: normalizedEmail,
      company: parsed.data.company,
      website: parsed.data.website,
      note,
      source: parsed.data.source,
    });
    const delivery = await sendSalesEmail({
      env,
      to: operatorRecipient,
      subject: operatorEmail.subject,
      html: operatorEmail.html,
      idempotencyKey: `walkthrough-operator-${leadId}`,
    });
    operatorNotified = delivery.ok;
    operatorReason = delivery.reason ?? 'delivered';
  }

  await structuredLogWithClientAndWait(
    supabase,
    'sales_walkthrough_requested',
    {
      lead_id: leadId,
      source: parsed.data.source,
      confirmation_delivered: confirmationDelivery.ok,
      operator_notified: operatorNotified,
      operator_reason: operatorReason,
    },
    operatorNotified ? 'info' : 'warning'
  );

  return Response.json({
    ok: true,
    confirmationDelivered: confirmationDelivery.ok,
    operatorNotified,
  });
}
