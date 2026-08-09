/**
 * Scheduling preflight (VCI-8 / ECP-3).
 *
 * This is the gate that decides whether GEO-Pulse is allowed to mail real people. Everything
 * before it is composition; nothing before it can cause a send. The rules it enforces are the
 * ones that are expensive to get wrong exactly once: mailing someone who unsubscribed, mailing a
 * paying customer a cold pitch, shipping a literal `{{name}}`, sending from an identity DNS never
 * authorized, or sending twice because a retry looked like a new request.
 *
 * Three properties matter more than the individual checks:
 *
 *   1. **Fail closed.** Every gate must return `ok`. An error loading evidence is a FAILED gate,
 *      never a skipped one — "we could not check suppression" must never read as "no suppressions".
 *   2. **Bound to one exact version.** Gates are evaluated against `versionChecksum(contract)`.
 *      An accepted internal test from a different version does not count.
 *   3. **Re-derived, not remembered.** The audience checksum is recomputed from its members rather
 *      than trusted, so a snapshot edited underneath the campaign is caught here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateEmailCampaignV1,
  versionChecksum,
  type EmailCampaignV1,
} from './email-campaign-contract';
import { verifyFrozenAudience, type AudienceEvidence } from './campaign-audience';
import { loadAudienceEvidence } from './campaign-audience';
import { requiresScanContext, unresolvedMergeFields, type PreviewContact, type PreviewScanContext } from './email-campaign-preview';
import { resolveCampaignSender, type SenderEnvLike } from './email-campaign-sender';
import { loadCampaignScanContexts } from './email-campaign-scan-context';

export type PreflightGateKey =
  | 'sender_authenticated'
  | 'audience_frozen'
  | 'audience_not_drifted'
  | 'recipients_within_cap'
  | 'recipients_eligible'
  | 'merge_fields_resolve'
  | 'content_and_tracking_valid'
  | 'internal_test_accepted'
  | 'governance_declared'
  | 'schedule_within_window'
  | 'volume_within_provider_caps';

export interface PreflightGate {
  readonly key: PreflightGateKey;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly gates: readonly PreflightGate[];
  readonly failures: readonly string[];
  readonly checkedAt: string;
  readonly versionChecksum: string;
}

export interface PreflightRecipient extends PreviewContact {
  readonly eligibilityStatus: string;
}

/** Provider-side ceilings. Configuration, not operator input. */
export interface ProviderCaps {
  readonly maxRecipientsPerCampaign: number;
  readonly maxSendsPerDay: number;
  readonly estimatedCostPerSendUsd: number;
  readonly maxCampaignSpendUsd: number;
}

export const DEFAULT_PROVIDER_CAPS: ProviderCaps = {
  maxRecipientsPerCampaign: 50,
  maxSendsPerDay: 100,
  estimatedCostPerSendUsd: 0.001,
  maxCampaignSpendUsd: 5,
};

function gate(key: PreflightGateKey, ok: boolean, detail: string): PreflightGate {
  return { key, ok, detail };
}

// ── Pure gate evaluators ────────────────────────────────────────────────────────

export function evaluateGovernance(contract: EmailCampaignV1): PreflightGate {
  const issues = validateEmailCampaignV1(contract).filter(
    (issue) => issue.section === 'goal' || issue.section === 'schedule',
  );
  return gate(
    'governance_declared',
    issues.length === 0,
    issues.length === 0
      ? 'Owner, one meaningful variable, success condition, stop condition, retry policy, and due times are declared.'
      : issues.map((issue) => `${issue.field}: ${issue.message}`).join(' · '),
  );
}

export function evaluateContentAndTracking(contract: EmailCampaignV1): PreflightGate {
  const issues = validateEmailCampaignV1(contract).filter(
    (issue) => issue.section === 'content' || issue.section === 'subject',
  );
  return gate(
    'content_and_tracking_valid',
    issues.length === 0,
    issues.length === 0
      ? 'Subject, preview text, body, links, UTM values, footer, and unsubscribe path are valid.'
      : issues.map((issue) => `${issue.field}: ${issue.message}`).join(' · '),
  );
}

/**
 * A test is only evidence for the exact version it validated. Any change to the sender, audience,
 * subject, body, tracking, or cadence changes the checksum and therefore invalidates the test.
 */
export function evaluateInternalTest(contract: EmailCampaignV1): PreflightGate {
  const checksum = versionChecksum(contract);
  if (!contract.governance.testAcceptedAt) {
    return gate('internal_test_accepted', false, 'No internal test has been accepted for this campaign.');
  }
  if (contract.governance.testVersionChecksum !== checksum) {
    return gate(
      'internal_test_accepted',
      false,
      `The accepted test belongs to version checksum ${String(contract.governance.testVersionChecksum)}, not ${checksum}. Re-test this exact version.`,
    );
  }
  return gate('internal_test_accepted', true, `Internal test accepted ${contract.governance.testAcceptedAt} for ${checksum}.`);
}

/** Hour-of-day check in the campaign's own timezone — a UTC comparison would drift with DST. */
export function localHourIn(timezone: string, iso: string): number {
  const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour12: false, hour: '2-digit' })
    .format(new Date(iso));
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
}

export function evaluateSchedule(contract: EmailCampaignV1, nowMs: number): PreflightGate {
  const startAt = contract.schedule.startAt;
  if (!startAt) return gate('schedule_within_window', false, 'No first send time is set.');
  const startMs = Date.parse(startAt);
  if (!Number.isFinite(startMs)) return gate('schedule_within_window', false, 'The first send time is not a valid timestamp.');
  if (startMs <= nowMs) {
    return gate('schedule_within_window', false, 'The first send time is in the past. Choose a future time.');
  }

  const hour = localHourIn(contract.schedule.timezone, startAt);
  if (hour < contract.schedule.sendWindowStartHour || hour >= contract.schedule.sendWindowEndHour) {
    return gate(
      'schedule_within_window',
      false,
      `${String(hour)}:00 ${contract.schedule.timezone} is outside the approved ${String(contract.schedule.sendWindowStartHour)}:00–${String(contract.schedule.sendWindowEndHour)}:00 window.`,
    );
  }

  // EVERY staggered first-send must land inside the window, not just the last one. Checking only
  // the last is how a cohort spread over a full day passes: 25 recipients an hour apart from
  // 09:00 ends at 09:00 the next morning, which looks fine and mailed most of them overnight.
  const recipients = contract.audience.recipientCount ?? 0;
  for (let index = 1; index < recipients; index += 1) {
    const sendMs = startMs + index * contract.schedule.spacingMinutes * 60_000;
    const sendHour = localHourIn(contract.schedule.timezone, new Date(sendMs).toISOString());
    if (sendHour < contract.schedule.sendWindowStartHour || sendHour >= contract.schedule.sendWindowEndHour) {
      return gate(
        'schedule_within_window',
        false,
        `Spacing ${String(contract.schedule.spacingMinutes)} min over ${String(recipients)} recipients puts send ${String(index + 1)} at ${String(sendHour)}:00, outside the approved window.`,
      );
    }
  }

  return gate('schedule_within_window', true, `First send ${startAt} is inside the approved ${contract.schedule.timezone} window.`);
}

export function evaluateVolume(contract: EmailCampaignV1, caps: ProviderCaps = DEFAULT_PROVIDER_CAPS): PreflightGate {
  const recipients = contract.audience.recipientCount ?? 0;
  const totalSends = recipients * contract.schedule.maxSequenceSteps;
  const spend = totalSends * caps.estimatedCostPerSendUsd;

  if (recipients > caps.maxRecipientsPerCampaign) {
    return gate('volume_within_provider_caps', false, `${String(recipients)} recipients exceeds the ${String(caps.maxRecipientsPerCampaign)} per-campaign cap.`);
  }
  const sendsPerDay = Math.min(contract.schedule.dailyCap, recipients);
  if (sendsPerDay > caps.maxSendsPerDay) {
    return gate('volume_within_provider_caps', false, `${String(sendsPerDay)} sends per day exceeds the ${String(caps.maxSendsPerDay)} provider cap.`);
  }
  if (spend > caps.maxCampaignSpendUsd) {
    return gate('volume_within_provider_caps', false, `Estimated $${spend.toFixed(2)} exceeds the $${caps.maxCampaignSpendUsd.toFixed(2)} campaign spend cap.`);
  }
  return gate(
    'volume_within_provider_caps',
    true,
    `${String(totalSends)} maximum sends, estimated $${spend.toFixed(2)}, within provider caps.`,
  );
}

export function evaluateRecipients(args: {
  readonly contract: EmailCampaignV1;
  readonly recipients: readonly PreflightRecipient[];
  readonly evidence: AudienceEvidence;
  readonly scansByContactId?: ReadonlyMap<string, PreviewScanContext>;
}): PreflightGate[] {
  const { contract, recipients, evidence } = args;

  if (recipients.length === 0) {
    return [
      gate('recipients_eligible', false, 'The frozen audience resolved to zero contacts.'),
      gate('merge_fields_resolve', false, 'No recipient to resolve personalization against.'),
    ];
  }

  const problems: string[] = [];
  for (const recipient of recipients) {
    const email = recipient.email.toLowerCase();
    if (recipient.eligibilityStatus !== 'eligible') problems.push(`${email} is ${recipient.eligibilityStatus}`);
    else if (evidence.unsubscribedEmails.has(email)) problems.push(`${email} unsubscribed`);
    else if (evidence.convertedEmails.has(email)) problems.push(`${email} is an existing customer`);
    else if (evidence.suppressedEmails.has(email)) problems.push(`${email} is suppressed`);
    else if (evidence.activeSequenceEmails.has(email)) problems.push(`${email} is in a conflicting active sequence`);
  }

  const unresolved: string[] = [];
  for (const recipient of recipients) {
    const missing = unresolvedMergeFields({
      contract,
      contact: recipient,
      scan: args.scansByContactId?.get(recipient.contactId) ?? null,
    });
    if (missing.length > 0) {
      unresolved.push(`${recipient.email}: ${missing.map((item) => `{{${item.field}}}`).join(', ')}`);
    }
  }

  return [
    gate(
      'recipients_eligible',
      problems.length === 0,
      problems.length === 0
        ? `All ${String(recipients.length)} recipients are eligible and free of suppression, conversion, and sequence conflicts.`
        : problems.slice(0, 10).join(' · '),
    ),
    gate(
      'merge_fields_resolve',
      unresolved.length === 0,
      unresolved.length === 0
        ? 'Every required merge variable resolves for every recipient.'
        : unresolved.slice(0, 10).join(' · '),
    ),
  ];
}

export function assemblePreflight(gates: readonly PreflightGate[], contract: EmailCampaignV1, nowIso: string): PreflightResult {
  const failures = gates.filter((item) => !item.ok).map((item) => `${item.key}: ${item.detail}`);
  return {
    ok: failures.length === 0,
    gates,
    failures,
    checkedAt: nowIso,
    versionChecksum: versionChecksum(contract),
  };
}

// ── Full preflight ──────────────────────────────────────────────────────────────

async function loadFrozenRecipients(
  supabase: SupabaseClient,
  audienceId: string,
): Promise<PreflightRecipient[]> {
  const { data: members } = await supabase
    .from('outreach_campaign_audience_members')
    .select('contact_id,email,position')
    .eq('audience_id', audienceId)
    .order('position', { ascending: true });
  const ids = ((members ?? []) as { contact_id: string }[]).map((row) => String(row.contact_id));
  if (ids.length === 0) return [];

  const { data: contacts } = await supabase
    .from('outreach_contacts')
    .select('id,email,name,company,company_domain,eligibility_status,personalization_reason,personalization_source_url')
    .in('id', ids);
  const byId = new Map(((contacts ?? []) as Record<string, any>[]).map((row) => [String(row.id), row]));

  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row: any) => ({
      contactId: String(row.id),
      email: String(row.email),
      name: (row.name as string | null) ?? null,
      company: (row.company as string | null) ?? null,
      companyDomain: (row.company_domain as string | null) ?? null,
      personalizationReason: (row.personalization_reason as string | null) ?? null,
      personalizationSourceUrl: (row.personalization_source_url as string | null) ?? null,
      eligibilityStatus: String(row.eligibility_status ?? 'needs_verification'),
    }));
}

export async function runCampaignPreflight(args: {
  readonly supabase: SupabaseClient;
  readonly env: SenderEnvLike;
  readonly contract: EmailCampaignV1;
  readonly nowMs: number;
  readonly caps?: ProviderCaps;
}): Promise<{ result: PreflightResult; recipients: readonly PreflightRecipient[] }> {
  const nowIso = new Date(args.nowMs).toISOString();
  const sender = resolveCampaignSender(args.env);
  const gates: PreflightGate[] = [
    gate(
      'sender_authenticated',
      sender.authenticated,
      sender.authenticated
        ? `Authenticated GEO-Pulse sender: ${String(sender.authenticationEvidence)}`
        : String(sender.blockingReason),
    ),
    evaluateGovernance(args.contract),
    evaluateContentAndTracking(args.contract),
    evaluateInternalTest(args.contract),
    evaluateSchedule(args.contract, args.nowMs),
    evaluateVolume(args.contract, args.caps ?? DEFAULT_PROVIDER_CAPS),
  ];

  const audienceId = args.contract.audience.audienceId;
  if (!audienceId) {
    gates.push(
      gate('audience_frozen', false, 'The audience has not been frozen for this version.'),
      gate('audience_not_drifted', false, 'No frozen audience to verify.'),
      gate('recipients_within_cap', false, 'No frozen audience to size.'),
      gate('recipients_eligible', false, 'No frozen audience to check.'),
      gate('merge_fields_resolve', false, 'No frozen audience to check.'),
    );
    return { result: assemblePreflight(gates, args.contract, nowIso), recipients: [] };
  }

  gates.push(gate('audience_frozen', true, `Audience ${audienceId} is frozen for version ${String(args.contract.version)}.`));

  const verified = await verifyFrozenAudience(args.supabase, audienceId);
  gates.push(
    gate(
      'audience_not_drifted',
      verified.ok && verified.checksum === args.contract.audience.checksum,
      verified.ok
        ? verified.checksum === args.contract.audience.checksum
          ? `Audience checksum ${verified.checksum.slice(0, 12)} matches the reviewed snapshot.`
          : 'The stored audience no longer matches the checksum this campaign reviewed.'
        : `Audience could not be verified: ${verified.reason}`,
    ),
  );

  const recipients = await loadFrozenRecipients(args.supabase, audienceId);
  gates.push(
    gate(
      'recipients_within_cap',
      recipients.length > 0 && recipients.length === args.contract.audience.recipientCount,
      recipients.length === args.contract.audience.recipientCount
        ? `${String(recipients.length)} recipients, matching the reviewed count.`
        : `Resolved ${String(recipients.length)} recipients but the campaign reviewed ${String(args.contract.audience.recipientCount ?? 0)}.`,
    ),
  );

  let evidence: AudienceEvidence;
  try {
    // Scoped to this intervention: a campaign's own prospects and enrollments are not a conflict,
    // or a retry after a partial schedule could never complete.
    evidence = await loadAudienceEvidence(args.supabase, { excludeInterventionId: args.contract.interventionId });
  } catch {
    // Fail closed: an unreadable suppression ledger is not an empty one.
    gates.push(
      gate('recipients_eligible', false, 'Suppression and conversion evidence could not be loaded. Refusing to schedule.'),
      gate('merge_fields_resolve', false, 'Not evaluated because suppression evidence is unavailable.'),
    );
    return { result: assemblePreflight(gates, args.contract, nowIso), recipients };
  }

  const scansByContactId = requiresScanContext(args.contract)
    ? await loadCampaignScanContexts({
        supabase: args.supabase,
        contacts: recipients,
        appUrl: args.env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com',
      })
    : undefined;
  gates.push(...evaluateRecipients({ contract: args.contract, recipients, evidence, scansByContactId }));
  return { result: assemblePreflight(gates, args.contract, nowIso), recipients };
}
