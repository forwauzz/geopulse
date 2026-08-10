/**
 * Delivery adapter for frozen `email_campaign_v1` enrollments.
 *
 * The hourly outreach sweep calls this before any legacy scan work. The enrollment names an
 * immutable campaign version and contact, so the provider receives the same renderer output the
 * operator previewed. Missing lineage, evidence, sender authentication, or ledger writes fail
 * closed; none may fall back to the legacy scorecard email.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { findLiteralTokens, renderCampaignPreview, requiresScanContext, type PreviewContact } from './email-campaign-preview';
import { resolveCampaignSender, type SenderEnvLike } from './email-campaign-sender';
import { loadEmailCampaignVersion } from './email-campaign-store';
import { progressAfterFailedSend, progressAfterSuccessfulSend } from './outreach-sequence';
import { structuredLog } from './structured-log';
import { loadCampaignScanContext } from './email-campaign-scan-context';

export interface CampaignDeliveryProspect {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly url: string;
  readonly cadence: 'hourly' | 'daily' | 'weekly' | 'monthly';
  readonly sequenceStep: number;
  readonly maxSequenceSteps: number | null;
  readonly sequenceDelaysDays: number[];
  readonly consecutiveFailures: number;
  readonly maxAttempts: number;
  readonly growthInterventionId: string | null;
}

export type CampaignDeliveryEnv = SenderEnvLike & {
  readonly RESEND_API_KEY?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
};

export type CampaignDeliveryOutcome =
  | { readonly ok: true; readonly scanId: string | null; readonly score: number | null }
  | { readonly ok: false; readonly reason: string };

export type CampaignSend = (
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string,
  identity: { readonly from: string; readonly replyTo: string },
) => Promise<{ ok: true; providerMessageId: string | null } | { ok: false; detail: string }>;

export function campaignSendKey(args: {
  readonly interventionKey: string;
  readonly campaignVersion: number;
  readonly contactId: string;
  readonly sequenceStep: number;
}): string {
  return `${args.interventionKey}@v${String(args.campaignVersion)}:${args.contactId}:step-${String(args.sequenceStep)}`;
}

async function recordDeliveryFailure(args: {
  readonly supabase: SupabaseClient;
  readonly prospect: CampaignDeliveryProspect;
  readonly nowMs: number;
  readonly reason: string;
}): Promise<CampaignDeliveryOutcome> {
  const failure = progressAfterFailedSend({
    consecutiveFailures: args.prospect.consecutiveFailures,
    maxAttempts: args.prospect.maxAttempts,
    nowMs: args.nowMs,
    reason: args.reason,
  });
  await args.supabase
    .from('outreach_prospects')
    .update({
      enabled: failure.enabled,
      lifecycle_status: failure.lifecycleStatus,
      consecutive_failures: failure.consecutiveFailures,
      last_run_at: new Date(args.nowMs).toISOString(),
      next_run_at: failure.nextRunAt,
      last_error: `email_campaign_delivery_failed: ${args.reason}`,
      next_action: failure.nextAction,
      updated_at: new Date(args.nowMs).toISOString(),
    })
    .eq('id', args.prospect.id);
  return { ok: false, reason: args.reason };
}

export async function runEmailCampaignDelivery(args: {
  readonly supabase: SupabaseClient;
  readonly env: CampaignDeliveryEnv;
  readonly prospect: CampaignDeliveryProspect;
  readonly nowMs: number;
  readonly sendEmail: CampaignSend;
}): Promise<CampaignDeliveryOutcome> {
  const { supabase, env, prospect, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();
  if (!prospect.growthInterventionId) return { ok: false, reason: 'campaign_intervention_missing' };

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('outreach_campaign_enrollments')
    .select('id,contact_id,intervention_id,campaign_version,status')
    .eq('prospect_id', prospect.id)
    .eq('intervention_id', prospect.growthInterventionId)
    .in('status', ['enrolled', 'sending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (enrollmentError || !enrollment) {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: enrollmentError?.message ?? 'campaign_enrollment_missing',
    });
  }

  const campaignVersion = Number(enrollment.campaign_version);
  const contract = await loadEmailCampaignVersion(
    supabase,
    String(enrollment.intervention_id),
    campaignVersion,
  );
  if (!contract) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: 'locked_campaign_version_missing' });
  }
  if (!['scheduled', 'running', 'evaluating'].includes(contract.state)) {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: `campaign_version_not_sendable:${contract.state}`,
    });
  }
  if (prospect.sequenceStep > contract.schedule.maxSequenceSteps) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: 'campaign_sequence_step_out_of_range' });
  }

  const { data: contact, error: contactError } = await supabase
    .from('outreach_contacts')
    .select('id,email,name,company,company_domain,eligibility_status,personalization_reason,personalization_source_url')
    .eq('id', String(enrollment.contact_id))
    .maybeSingle();
  if (contactError || !contact) {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: contactError?.message ?? 'campaign_contact_missing',
    });
  }
  if (String(contact.email).toLowerCase() !== prospect.email.toLowerCase()) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: 'campaign_contact_email_mismatch' });
  }
  if (contact.eligibility_status !== 'eligible') {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: `campaign_contact_not_eligible:${String(contact.eligibility_status ?? 'unknown')}`,
    });
  }

  const sender = resolveCampaignSender(env, contract.sender.displayName);
  if (!sender.authenticated || !sender.resolvedFromAddress || !sender.resolvedReplyToAddress) {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: sender.blockingReason ?? 'campaign_sender_not_authenticated',
    });
  }
  if (
    contract.sender.fromAddressRef !== sender.fromAddressRef
    || contract.sender.replyToRef !== sender.replyToRef
  ) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: 'campaign_sender_reference_mismatch' });
  }

  const sendKey = campaignSendKey({
    interventionKey: contract.interventionKey,
    campaignVersion,
    contactId: String(enrollment.contact_id),
    sequenceStep: prospect.sequenceStep,
  });

  const { data: existingSend, error: existingSendError } = await supabase
    .from('outreach_sends')
    .select('id,delivery_status,provider_message_id')
    .eq('campaign_send_key', sendKey)
    .maybeSingle();
  if (existingSendError) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: existingSendError.message });
  }

  let sendId = existingSend?.id ? String(existingSend.id) : null;
  if (!sendId) {
    const { data: insertedSend, error: sendInsertError } = await supabase
      .from('outreach_sends')
      .insert({
        prospect_id: prospect.id,
        scan_id: null,
        score: null,
        delivery_status: 'pending',
        sequence_step: prospect.sequenceStep,
        campaign_send_key: sendKey,
      })
      .select('id')
      .single();
    if (sendInsertError || !insertedSend?.id) {
      return recordDeliveryFailure({
        supabase,
        prospect,
        nowMs,
        reason: sendInsertError?.message ?? 'campaign_send_row_insert_failed',
      });
    }
    sendId = String(insertedSend.id);
  }

  const previewContact: PreviewContact = {
    contactId: String(contact.id),
    email: String(contact.email),
    name: (contact.name as string | null) ?? prospect.name,
    company: (contact.company as string | null) ?? prospect.company,
    companyDomain: (contact.company_domain as string | null) ?? null,
    personalizationReason: (contact.personalization_reason as string | null) ?? null,
    personalizationSourceUrl: (contact.personalization_source_url as string | null) ?? null,
  };
  const scan = requiresScanContext(contract, prospect.sequenceStep)
    ? await loadCampaignScanContext({
        supabase,
        contact: previewContact,
        appUrl: env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com',
        auditPreview: contract.tracking.tags.includes('audit-led')
          ? { secret: env.AUDIT_REPORT_CAPABILITY_SECRET ?? '', campaignId: contract.campaignId, nowMs }
          : null,
      })
    : null;
  const rendered = renderCampaignPreview({
    contract,
    contact: previewContact,
    appUrl: env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com',
    scan,
    sequenceStep: prospect.sequenceStep,
    trackingIds: { prospectId: prospect.id, sendId },
    resolvedSender: { from: sender.resolvedFromAddress, replyTo: sender.resolvedReplyToAddress },
  });
  const literalTokens = findLiteralTokens(rendered.html);
  if (rendered.unresolved.length > 0 || literalTokens.length > 0) {
    const detail = rendered.unresolved.length > 0
      ? `campaign_personalization_unresolved:${rendered.unresolved.map((item) => item.field).join(',')}`
      : `campaign_literal_tokens:${literalTokens.join(',')}`;
    await supabase
      .from('outreach_sends')
      .update({ delivery_status: 'failed', delivery_error: detail, updated_at: nowIso })
      .eq('id', sendId);
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: detail });
  }

  if (scan?.scanId) {
    await supabase
      .from('outreach_sends')
      .update({ scan_id: scan.scanId, score: scan.score, updated_at: nowIso })
      .eq('id', sendId);
  }

  await supabase
    .from('outreach_campaign_enrollments')
    .update({ status: 'sending', updated_at: nowIso })
    .eq('id', String(enrollment.id));

  let providerOutcome: Awaited<ReturnType<CampaignSend>>;
  if (existingSend?.delivery_status === 'sent') {
    providerOutcome = {
      ok: true,
      providerMessageId: (existingSend.provider_message_id as string | null) ?? null,
    };
  } else {
    providerOutcome = await args.sendEmail(
      prospect.email,
      rendered.subject,
      rendered.html,
      sendKey,
      { from: sender.resolvedFromAddress, replyTo: sender.resolvedReplyToAddress },
    );
  }

  const { error: sendUpdateError } = await supabase
    .from('outreach_sends')
    .update({
      delivery_status: providerOutcome.ok ? 'sent' : 'failed',
      provider_message_id: providerOutcome.ok ? providerOutcome.providerMessageId : null,
      delivery_error: providerOutcome.ok ? null : providerOutcome.detail,
      updated_at: nowIso,
    })
    .eq('id', sendId);
  if (sendUpdateError) {
    return recordDeliveryFailure({ supabase, prospect, nowMs, reason: `campaign_send_ledger_update_failed:${sendUpdateError.message}` });
  }
  if (!providerOutcome.ok) {
    return recordDeliveryFailure({
      supabase,
      prospect,
      nowMs,
      reason: `email_send_failed:${providerOutcome.detail}`,
    });
  }

  const progress = progressAfterSuccessfulSend(
    prospect,
    nowMs,
    new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const { error: progressError } = await supabase
    .from('outreach_prospects')
    .update({
      enabled: progress.enabled,
      lifecycle_status: progress.lifecycleStatus,
      sequence_step: progress.sequenceStep,
      consecutive_failures: 0,
      last_run_at: nowIso,
      next_run_at: progress.nextRunAt,
      last_error: null,
      next_action: progress.nextAction,
      exited_at: progress.exitedAt,
      exit_reason: progress.exitReason,
      updated_at: nowIso,
    })
    .eq('id', prospect.id);
  if (progressError) {
    return { ok: false, reason: `campaign_prospect_progress_update_failed:${progressError.message}` };
  }

  const enrollmentStatus = progress.lifecycleStatus === 'completed' ? 'completed' : 'sending';
  const { error: enrollmentUpdateError } = await supabase
    .from('outreach_campaign_enrollments')
    .update({
      status: enrollmentStatus,
      ...(enrollmentStatus === 'completed'
        ? { exited_at: nowIso, exit_reason: 'sequence_completed' }
        : {}),
      updated_at: nowIso,
    })
    .eq('id', String(enrollment.id));
  if (enrollmentUpdateError) {
    return { ok: false, reason: `campaign_enrollment_progress_update_failed:${enrollmentUpdateError.message}` };
  }

  structuredLog('email_campaign_message_sent', {
    interventionKey: contract.interventionKey,
    campaignVersion,
    sequenceStep: prospect.sequenceStep,
    sendKey,
  }, 'info');
  return { ok: true, scanId: scan?.scanId ?? null, score: scan?.score ?? null };
}
