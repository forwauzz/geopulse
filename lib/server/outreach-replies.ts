import type { SupabaseClient } from '@supabase/supabase-js';

export type ReplyClassification =
  | 'positive'
  | 'neutral'
  | 'not_interested'
  | 'out_of_office'
  | 'wrong_person'
  | 'unsubscribed'
  | 'automated';

const AUTOMATED_SENDER_RE =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?)@/i;

export function normalizeSenderEmail(raw: string): string | null {
  const bracketed = raw.match(/<([^<>@\s]+@[^<>\s]+)>/);
  const candidate = (bracketed?.[1] ?? raw).trim().toLowerCase();
  const match = candidate.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? null;
}

export function classifyOutreachReply(args: {
  readonly sender: string;
  readonly subject: string;
  readonly text: string | null;
}): ReplyClassification {
  const sender = normalizeSenderEmail(args.sender) ?? args.sender.trim().toLowerCase();
  const content = `${args.subject}\n${args.text ?? ''}`.toLowerCase().replace(/\s+/g, ' ');

  if (
    AUTOMATED_SENDER_RE.test(sender) ||
    /\b(delivery status notification|undeliverable|message blocked|mail delivery failed)\b/.test(
      content
    )
  ) {
    return 'automated';
  }
  if (
    /\b(unsubscribe|remove me|take me off|stop emailing|do not email|don't email)\b/.test(content)
  ) {
    return 'unsubscribed';
  }
  if (
    /\b(out of (the )?office|automatic reply|auto-reply|on vacation|away from (my )?email)\b/.test(
      content
    )
  ) {
    return 'out_of_office';
  }
  if (
    /\b(wrong person|not the right person|no longer work|left the company|contact .{0,40} instead)\b/.test(
      content
    )
  ) {
    return 'wrong_person';
  }
  if (
    /\b(not interested|no thanks|not a fit|we'll pass|we will pass|already have|not right now)\b/.test(
      content
    )
  ) {
    return 'not_interested';
  }
  if (
    /\b(interested|tell me more|walkthrough|book|schedule|let's talk|lets talk|sounds useful|yes[,!. ]|call me|send times)\b/.test(
      content
    )
  ) {
    return 'positive';
  }
  return 'neutral';
}

async function senderHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email.trim().toLowerCase())
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

type ReplyProcessingResult = {
  readonly ok: boolean;
  readonly duplicate: boolean;
  readonly matched: boolean;
  readonly classification: ReplyClassification;
  readonly prospectIds: string[];
  readonly leadId: string | null;
};

export async function processInboundSalesReply(args: {
  readonly supabase: SupabaseClient;
  readonly providerEventId: string;
  readonly providerEmailId: string;
  readonly sender: string;
  readonly subject: string;
  readonly text: string | null;
  readonly receivedAt: string;
}): Promise<ReplyProcessingResult> {
  const sender = normalizeSenderEmail(args.sender);
  const classification = classifyOutreachReply({
    sender: args.sender,
    subject: args.subject,
    text: args.text,
  });
  if (!sender) {
    return {
      ok: false,
      duplicate: false,
      matched: false,
      classification,
      prospectIds: [],
      leadId: null,
    };
  }

  const { error: insertError } = await args.supabase.from('outreach_reply_events').insert({
    provider_event_id: args.providerEventId,
    provider_email_id: args.providerEmailId,
    sender_email_hash: await senderHash(sender),
    classification,
    processing_status: 'received',
    received_at: args.receivedAt,
  });
  if (insertError?.code === '23505') {
    const { data: existing } = await args.supabase
      .from('outreach_reply_events')
      .select('prospect_id,lead_id,classification')
      .eq('provider_event_id', args.providerEventId)
      .maybeSingle();
    const existingProspectId = (existing?.prospect_id as string | null | undefined) ?? null;
    const existingLeadId = (existing?.lead_id as string | null | undefined) ?? null;
    const existingClassification =
      (existing?.classification as ReplyClassification | null | undefined) ?? classification;
    return {
      ok: true,
      duplicate: true,
      matched: existingProspectId !== null || existingLeadId !== null,
      classification: existingClassification,
      prospectIds: existingProspectId ? [existingProspectId] : [],
      leadId: existingLeadId,
    };
  }
  if (insertError) {
    return {
      ok: false,
      duplicate: false,
      matched: false,
      classification,
      prospectIds: [],
      leadId: null,
    };
  }

  const [{ data: prospects }, { data: leads }] = await Promise.all([
    args.supabase
      .from('outreach_prospects')
      .select('id')
      .eq('email', sender)
      .order('updated_at', { ascending: false })
      .limit(20),
    args.supabase
      .from('leads')
      .select('id')
      .eq('email', sender)
      .eq('request_type', 'walkthrough')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const prospectIds = ((prospects ?? []) as { id: string }[]).map((row) => row.id);
  const leadId = ((leads ?? []) as { id: string }[])[0]?.id ?? null;
  const matched = prospectIds.length > 0 || leadId !== null;
  const nowIso = new Date().toISOString();

  if (classification !== 'automated' && prospectIds.length > 0) {
    const lifecycle =
      classification === 'positive'
        ? 'positive_reply'
        : classification === 'unsubscribed'
          ? 'unsubscribed'
          : classification === 'out_of_office'
            ? 'paused'
            : 'replied';
    const nextAction =
      classification === 'positive'
        ? 'respond personally and schedule a focused walkthrough'
        : classification === 'neutral'
          ? 'review the question and respond personally'
          : classification === 'out_of_office'
            ? 'review the return date and resume manually if still appropriate'
            : classification === 'wrong_person'
              ? 'identify the correct public business contact before any new outreach'
              : null;
    const replyClassification =
      classification === 'unsubscribed'
        ? 'not_interested'
        : classification;
    const update: Record<string, unknown> = {
      enabled: false,
      lifecycle_status: lifecycle,
      reply_classification: replyClassification,
      replied_at: nowIso,
      next_action: nextAction,
      updated_at: nowIso,
    };
    if (classification === 'unsubscribed') update['unsubscribed_at'] = nowIso;
    if (classification !== 'out_of_office') {
      update['exited_at'] = nowIso;
      update['exit_reason'] = `inbound_reply:${classification}`;
    }
    await args.supabase.from('outreach_prospects').update(update).in('id', prospectIds);
  }

  if (classification !== 'automated' && leadId) {
    const status =
      classification === 'positive' || classification === 'neutral'
        ? 'qualified'
        : classification === 'out_of_office'
          ? 'new'
          : 'closed_lost';
    const nextAction =
      classification === 'positive' || classification === 'neutral'
        ? 'respond personally and schedule the next step'
        : classification === 'out_of_office'
          ? 'review the return date and follow up manually'
          : null;
    await args.supabase
      .from('leads')
      .update({ status, next_action: nextAction })
      .eq('id', leadId);
  }

  await args.supabase
    .from('outreach_reply_events')
    .update({
      prospect_id: prospectIds[0] ?? null,
      lead_id: leadId,
      processing_status: matched ? 'processed' : 'unmatched',
      processed_at: nowIso,
    })
    .eq('provider_event_id', args.providerEventId);

  return {
    ok: true,
    duplicate: false,
    matched,
    classification,
    prospectIds,
    leadId,
  };
}

