import { Resend, type EmailReceivedEvent } from 'resend';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { processInboundSalesReply } from '@/lib/server/outreach-replies';
import { structuredLogWithClientAndWait } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

function webhookHeaders(request: Request) {
  const id = request.headers.get('svix-id') ?? '';
  const timestamp = request.headers.get('svix-timestamp') ?? '';
  const signature = request.headers.get('svix-signature') ?? '';
  return { id, timestamp, signature };
}

export async function POST(request: Request): Promise<Response> {
  const env = await getPaymentApiEnv();
  if (
    !env.RESEND_API_KEY ||
    !env.RESEND_INBOUND_WEBHOOK_SECRET ||
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return Response.json({ error: 'resend_inbound_not_configured' }, { status: 503 });
  }

  const headers = webhookHeaders(request);
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return Response.json({ error: 'webhook_headers_missing' }, { status: 400 });
  }

  const payload = await request.text();
  const resend = new Resend(env.RESEND_API_KEY);
  let event: ReturnType<typeof resend.webhooks.verify>;
  try {
    event = resend.webhooks.verify({
      payload,
      headers,
      webhookSecret: env.RESEND_INBOUND_WEBHOOK_SECRET,
    });
  } catch {
    return Response.json({ error: 'invalid_webhook_signature' }, { status: 400 });
  }

  if (event.type !== 'email.received') {
    return Response.json({ ok: true, ignored: true });
  }
  const receivedEvent = event as EmailReceivedEvent;
  const received = await resend.emails.receiving.get(receivedEvent.data.email_id, {
    html_format: 'cid',
  });
  if (received.error || !received.data) {
    return Response.json({ error: 'inbound_email_retrieval_failed' }, { status: 500 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const result = await processInboundSalesReply({
    supabase,
    providerEventId: headers.id,
    providerEmailId: receivedEvent.data.email_id,
    sender: received.data.from,
    subject: received.data.subject,
    text: received.data.text,
    receivedAt: received.data.created_at,
  });
  if (!result.ok) {
    return Response.json({ error: 'inbound_reply_processing_failed' }, { status: 500 });
  }

  let forwarded = false;
  let forwardReason = result.matched ? 'operator_recipient_missing' : 'not_matched';
  const operatorRecipient =
    env.SALES_OPERATOR_EMAIL?.trim() ||
    env.MARKETING_REPORT_TO?.trim() ||
    env.SELF_IMPROVEMENT_REPORT_TO?.trim() ||
    '';
  if (result.matched && result.classification !== 'automated' && operatorRecipient) {
    const forward = await resend.emails.receiving.forward(
      {
        emailId: receivedEvent.data.email_id,
        to: operatorRecipient,
        from: env.RESEND_FROM_EMAIL,
        passthrough: true,
      },
      { idempotencyKey: `inbound-forward-${receivedEvent.data.email_id}` }
    );
    forwarded = forward.error === null;
    forwardReason = forward.error?.message ?? 'forwarded';
  }

  await structuredLogWithClientAndWait(
    supabase,
    'outreach_reply_received',
    {
      provider_event_id: headers.id,
      classification: result.classification,
      matched: result.matched,
      prospect_count: result.prospectIds.length,
      lead_id: result.leadId,
      forwarded,
      forward_reason: forwardReason,
      body_retained: false,
    },
    result.matched && !forwarded && result.classification !== 'automated' ? 'warning' : 'info'
  );

  if (
    result.matched &&
    result.classification !== 'automated' &&
    operatorRecipient &&
    !forwarded
  ) {
    return Response.json({ error: 'operator_forward_failed' }, { status: 500 });
  }

  return Response.json({
    ok: true,
    duplicate: result.duplicate,
    matched: result.matched,
    classification: result.classification,
    forwarded,
  });
}
