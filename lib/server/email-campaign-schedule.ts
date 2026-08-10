/**
 * Internal test delivery and campaign scheduling (VCI-8 / ECP-3).
 *
 * The two operations that can actually cause mail to leave, so both are narrow on purpose:
 *
 * **The internal test** can only reach a configured allowlist. It writes no `outreach_sends` row,
 * creates no prospect, and advances no sequence — a test that showed up in campaign metrics would
 * make every early number a lie. Its only lasting effect is evidence bound to one version
 * checksum, which the preflight then requires.
 *
 * **Scheduling** runs the full preflight first and refuses on any failed gate. It writes rows but
 * sends nothing: the existing hourly outreach sweep picks the prospects up at their staggered
 * `next_run_at`. Every write is keyed by campaign version + contact + step, so a retried schedule
 * is a no-op rather than a second cohort.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyContractEdit,
  versionChecksum,
  type EmailCampaignPreparationState,
  type EmailCampaignV1,
} from './email-campaign-contract';
import { enrollmentIdempotencyKey } from './campaign-audience';
import { renderCampaignPreview, requiresScanContext, type PreviewContact } from './email-campaign-preview';
import { resolveCampaignSender, resolveTestRecipients, type SenderEnvLike } from './email-campaign-sender';
import { runCampaignPreflight, type PreflightRecipient, type PreflightResult, type ProviderCaps } from './email-campaign-preflight';
import { sendOutreachEmail, type OutreachEnvLike } from './outreach';
import { structuredLog } from './structured-log';
import { loadCampaignScanContext } from './email-campaign-scan-context';

/**
 * One key per (version, contact, step). The provider sees the same key on a retry, and the
 * enrollment table's UNIQUE constraint rejects the duplicate row — belt and braces, because a
 * duplicate cold email is not recoverable by apology.
 */
export function sendIdempotencyKey(args: {
  readonly interventionKey: string;
  readonly campaignVersion: number;
  readonly contactId: string;
  readonly sequenceStep: number;
}): string {
  return `${args.interventionKey}@v${String(args.campaignVersion)}:${args.contactId}:step-${String(args.sequenceStep)}`;
}

/** Staggered first-send times, one per spacing step, so a cohort never bursts at the provider. */
export function plannedSendTimes(startIso: string, count: number, spacingMinutes: number): string[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, index) =>
    new Date(startMs + index * spacingMinutes * 60_000).toISOString());
}

// ── Internal test ───────────────────────────────────────────────────────────────

export type InternalTestResult =
  | { readonly ok: true; readonly recipient: string; readonly checksum: string; readonly providerMessageId: string | null }
  | { readonly ok: false; readonly reason: string };

export async function sendInternalTest(args: {
  readonly supabase: SupabaseClient;
  readonly env: SenderEnvLike & OutreachEnvLike;
  readonly contract: EmailCampaignV1;
  readonly recipient: string;
  readonly sampleContact: PreviewContact | null;
  readonly nowMs: number;
  readonly sequenceStep?: number;
  readonly save: (contract: EmailCampaignV1) => Promise<{ ok: boolean }>;
}): Promise<InternalTestResult> {
  const sender = resolveCampaignSender(args.env);
  if (!sender.authenticated) {
    return { ok: false, reason: sender.blockingReason ?? 'no authenticated sender' };
  }

  const allowlist = resolveTestRecipients(args.env);
  const recipient = args.recipient.trim().toLowerCase();
  if (allowlist.length === 0) {
    return { ok: false, reason: 'no internal test recipients are configured' };
  }
  if (!allowlist.includes(recipient)) {
    // Deliberately not "add it and continue": the allowlist is the thing that keeps a typo in an
    // admin form from becoming an unsolicited email.
    return { ok: false, reason: `${recipient} is not on the configured internal test allowlist` };
  }
  if (!args.sampleContact) {
    return { ok: false, reason: 'no contact is available to render the test against' };
  }

  const checksum = versionChecksum(args.contract);
  const appUrl = args.env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com';
  const scan = requiresScanContext(args.contract, args.sequenceStep ?? 1)
    ? await loadCampaignScanContext({
        supabase: args.supabase,
        contact: args.sampleContact,
        appUrl,
        auditPreview: args.contract.tracking.tags.includes('audit-led')
          ? { secret: args.env['AUDIT_REPORT_CAPABILITY_SECRET'] ?? '', campaignId: args.contract.campaignId }
          : null,
      })
    : null;
  const preview = renderCampaignPreview({
    contract: args.contract,
    contact: args.sampleContact,
    appUrl,
    scan,
    sequenceStep: args.sequenceStep ?? 1,
    resolvedSender: {
      from: sender.resolvedFromAddress!,
      replyTo: sender.resolvedReplyToAddress!,
    },
  });
  if (preview.unresolved.length > 0) {
    return { ok: false, reason: `personalization does not resolve: ${preview.unresolved.map((item) => item.field).join(', ')}` };
  }

  const outcome = await sendOutreachEmail(
    args.env,
    recipient,
    `[TEST] ${preview.subject}`,
    preview.html,
    `campaign-test-${args.contract.interventionKey}-v${String(args.contract.version)}-${checksum}-step-${String(args.sequenceStep ?? 1)}-${recipient}`,
    {
      from: sender.resolvedFromAddress!,
      replyTo: sender.resolvedReplyToAddress!,
    },
  );
  if (!outcome.ok) return { ok: false, reason: outcome.detail };

  // The ONLY persisted effect of a test: evidence bound to this exact version. No send row, no
  // prospect, no sequence advance, nothing that a funnel query could mistake for a real send.
  const { contract } = applyContractEdit(args.contract, {
    governance: {
      testAcceptedAt: new Date(args.nowMs).toISOString(),
      testVersionChecksum: checksum,
      testRecipients: [...new Set([...args.contract.governance.testRecipients, recipient])],
    },
    state: args.contract.state === 'qa_ready' || args.contract.state === 'content_ready' ? 'test_passed' : args.contract.state,
  });
  const saved = await args.save(contract);
  if (!saved.ok) return { ok: false, reason: 'internal_test_evidence_save_failed' };

  structuredLog('email_campaign_internal_test_sent', {
    interventionKey: args.contract.interventionKey,
    version: args.contract.version,
    checksum,
  }, 'info');

  return { ok: true, recipient, checksum, providerMessageId: outcome.providerMessageId };
}

// ── Scheduling ──────────────────────────────────────────────────────────────────

export interface ScheduleRow {
  readonly contactId: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly url: string;
  readonly idempotencyKey: string;
  readonly nextRunAt: string;
  readonly position: number;
}

/** Pure: exactly the rows an authorized schedule should produce, in a deterministic order. */
export function buildScheduleRows(args: {
  readonly contract: EmailCampaignV1;
  readonly recipients: readonly PreflightRecipient[];
}): ScheduleRow[] {
  const startAt = args.contract.schedule.startAt;
  if (!startAt) return [];
  const times = plannedSendTimes(startAt, args.recipients.length, args.contract.schedule.spacingMinutes);
  return args.recipients.map((recipient, index) => ({
    contactId: recipient.contactId,
    email: recipient.email,
    name: recipient.name,
    company: recipient.company,
    url: `https://${recipient.companyDomain ?? recipient.email.slice(recipient.email.indexOf('@') + 1)}`,
    idempotencyKey: enrollmentIdempotencyKey({
      interventionKey: args.contract.interventionKey,
      campaignVersion: args.contract.version,
      contactId: recipient.contactId,
    }),
    nextRunAt: times[index] ?? startAt,
    position: index + 1,
  }));
}

export type ScheduleOutcome =
  | { readonly ok: true; readonly enrolled: number; readonly alreadyEnrolled: number; readonly preflight: PreflightResult }
  | { readonly ok: false; readonly reason: string; readonly preflight: PreflightResult };

export async function scheduleCampaign(args: {
  readonly supabase: SupabaseClient;
  readonly env: SenderEnvLike;
  readonly contract: EmailCampaignV1;
  readonly nowMs: number;
  readonly caps?: ProviderCaps;
  readonly save: (contract: EmailCampaignV1) => Promise<{ ok: boolean }>;
}): Promise<ScheduleOutcome> {
  const { result, recipients } = await runCampaignPreflight({
    supabase: args.supabase,
    env: args.env,
    contract: args.contract,
    nowMs: args.nowMs,
    ...(args.caps ? { caps: args.caps } : {}),
  });

  if (!result.ok) {
    // Record why, so the composer can show the exact failing gates without re-running the check.
    const { contract } = applyContractEdit(args.contract, {
      governance: { preflightPassedAt: null, preflightFailures: result.failures },
    });
    const saved = await args.save(contract);
    return {
      ok: false,
      reason: saved.ok ? 'preflight_failed' : 'preflight_failed_state_save_failed',
      preflight: result,
    };
  }

  const nowIso = new Date(args.nowMs).toISOString();
  const rows = buildScheduleRows({ contract: args.contract, recipients });

  const { data: existingRows, error: existingRowsError } = await args.supabase
    .from('outreach_campaign_enrollments')
    .select('idempotency_key')
    .eq('audience_id', args.contract.audience.audienceId);
  if (existingRowsError) {
    return { ok: false, reason: `enrollment_read_failed:${existingRowsError.message}`, preflight: result };
  }
  const alreadyEnrolled = new Set(
    ((existingRows ?? []) as { idempotency_key: string }[]).map((row) => String(row.idempotency_key)),
  );
  if (rows.length > 0 && rows.every((row) => alreadyEnrolled.has(row.idempotencyKey))) {
    // A stale operator retry after a successful schedule is a read-only success. Re-saving the
    // already locked version would either fork a phantom version or incorrectly report failure.
    return { ok: true, enrolled: 0, alreadyEnrolled: rows.length, preflight: result };
  }

  let enrolled = 0;
  let racedEnrollment = 0;
  for (const row of rows) {
    if (alreadyEnrolled.has(row.idempotencyKey)) continue;

    // Prospect first: the enrollment references it, and an enrollment pointing at nothing would
    // read as "scheduled" while no send could ever happen.
    const { data: prospect, error: prospectError } = await args.supabase
      .from('outreach_prospects')
      .upsert({
        email: row.email,
        url: row.url,
        name: row.name,
        company: row.company,
        cadence: 'monthly',
        enabled: true,
        lifecycle_status: 'active',
        sequence_step: 1,
        max_sequence_steps: args.contract.schedule.maxSequenceSteps,
        sequence_delays_days: args.contract.schedule.sequenceDelaysDays,
        consecutive_failures: 0,
        max_attempts: 3,
        owner: args.contract.goal.owner,
        next_action: `send campaign step 1 of ${String(args.contract.schedule.maxSequenceSteps)}`,
        closure_condition: args.contract.goal.closureCondition,
        segment: args.contract.audience.segment,
        growth_campaign_id: args.contract.campaignId,
        growth_intervention_id: args.contract.interventionId,
        next_run_at: row.nextRunAt,
        updated_at: nowIso,
      }, { onConflict: 'email,url' })
      .select('id')
      .single();
    if (prospectError || !prospect?.id) {
      return {
        ok: false,
        reason: `prospect_upsert_failed:${prospectError?.message ?? 'prospect_id_missing'}`,
        preflight: result,
      };
    }

    const { error } = await args.supabase.from('outreach_campaign_enrollments').insert({
      audience_id: args.contract.audience.audienceId,
      contact_id: row.contactId,
      campaign_id: args.contract.campaignId,
      intervention_id: args.contract.interventionId,
      campaign_version: args.contract.version,
      prospect_id: String(prospect.id),
      idempotency_key: row.idempotencyKey,
      status: 'enrolled',
      enrolled_at: nowIso,
    });
    if (!error) {
      enrolled += 1;
    } else if (error.code === '23505') {
      // A concurrent scheduler won the same immutable idempotency key. Count it as durable work;
      // every other database error is a partial failure and must keep the version unlocked.
      racedEnrollment += 1;
    } else {
      return { ok: false, reason: `enrollment_insert_failed:${error.message}`, preflight: result };
    }
  }

  const { contract } = applyContractEdit(args.contract, {
    state: 'scheduled',
    governance: {
      preflightPassedAt: nowIso,
      preflightFailures: [],
      scheduledAt: nowIso,
      lockedAt: nowIso,
    },
  });
  const saved = await args.save(contract);
  if (!saved.ok) {
    return { ok: false, reason: 'scheduled_contract_save_failed', preflight: result };
  }

  structuredLog('email_campaign_scheduled', {
    interventionKey: args.contract.interventionKey,
    version: args.contract.version,
    enrolled,
    alreadyEnrolled: alreadyEnrolled.size + racedEnrollment,
  }, 'info');

  return { ok: true, enrolled, alreadyEnrolled: alreadyEnrolled.size + racedEnrollment, preflight: result };
}

// ── Lifecycle stops ─────────────────────────────────────────────────────────────

export type SequenceStopReason =
  | 'replied'
  | 'positive_reply'
  | 'unsubscribed'
  | 'disqualified'
  | 'converted'
  | 'existing_customer'
  | 'campaign_stopped'
  | 'paused'
  | 'retries_exhausted'
  | 'sequence_complete'
  | 'provider_safety_incident';

export interface SequenceState {
  readonly lifecycleStatus: string;
  readonly unsubscribed: boolean;
  readonly hasActiveSubscription: boolean;
  readonly consecutiveFailures: number;
  readonly maxAttempts: number;
  readonly sequenceStep: number;
  readonly maxSequenceSteps: number;
  readonly campaignState: EmailCampaignPreparationState;
  readonly providerSafetyIncident?: boolean;
}

/**
 * Pure: may another step go out? Every terminal signal wins over the schedule — the cheapest way
 * to lose a prospect permanently is to keep mailing after they answered.
 */
export function nextSequenceStop(state: SequenceState): SequenceStopReason | null {
  if (state.unsubscribed || state.lifecycleStatus === 'unsubscribed') return 'unsubscribed';
  if (state.hasActiveSubscription) return 'existing_customer';
  if (state.lifecycleStatus === 'converted') return 'converted';
  if (state.lifecycleStatus === 'positive_reply') return 'positive_reply';
  if (state.lifecycleStatus === 'replied') return 'replied';
  if (state.lifecycleStatus === 'disqualified') return 'disqualified';
  if (state.lifecycleStatus === 'completed') return 'sequence_complete';
  if (state.lifecycleStatus === 'paused') return 'paused';
  if (state.providerSafetyIncident) return 'provider_safety_incident';
  if (state.campaignState === 'stopped') return 'campaign_stopped';
  if (state.consecutiveFailures >= state.maxAttempts) return 'retries_exhausted';
  if (state.sequenceStep >= state.maxSequenceSteps) return 'sequence_complete';
  return null;
}

export function canSendNextStep(state: SequenceState): boolean {
  return nextSequenceStop(state) === null;
}

/** Stop a campaign: no further step may be sent, and the reason is recorded on the version. */
export async function stopCampaign(args: {
  readonly supabase: SupabaseClient;
  readonly contract: EmailCampaignV1;
  readonly reason: string;
  readonly nowMs: number;
  readonly save: (contract: EmailCampaignV1) => Promise<{ ok: boolean }>;
}): Promise<{ ok: true; stoppedProspects: number } | { ok: false; reason: string }> {
  const nowIso = new Date(args.nowMs).toISOString();

  const { data: enrollments } = await args.supabase
    .from('outreach_campaign_enrollments')
    .select('id,prospect_id')
    .eq('audience_id', args.contract.audience.audienceId)
    .in('status', ['enrolled', 'sending']);

  const rows = (enrollments ?? []) as { id: string; prospect_id: string | null }[];
  const prospectIds = rows.map((row) => row.prospect_id).filter((id): id is string => Boolean(id));

  if (prospectIds.length > 0) {
    await args.supabase
      .from('outreach_prospects')
      .update({
        enabled: false,
        lifecycle_status: 'paused',
        next_action: null,
        last_error: `campaign_stopped: ${args.reason}`,
        updated_at: nowIso,
      })
      .in('id', prospectIds);
  }

  await args.supabase
    .from('outreach_campaign_enrollments')
    .update({ status: 'stopped', exit_reason: args.reason, exited_at: nowIso, updated_at: nowIso })
    .eq('audience_id', args.contract.audience.audienceId)
    .in('status', ['enrolled', 'sending']);

  const { contract } = applyContractEdit(args.contract, {
    state: 'stopped',
    governance: { stopReason: args.reason },
  });
  await args.save(contract);

  structuredLog('email_campaign_stopped', {
    interventionKey: args.contract.interventionKey,
    version: args.contract.version,
    reason: args.reason,
    stoppedProspects: prospectIds.length,
  }, 'warning');

  return { ok: true, stoppedProspects: prospectIds.length };
}
