/**
 * Console data for the campaign composer (VCI-8 / ECP-2).
 *
 * The page renders what this returns and nothing more. Keeping assembly here means the section
 * states, the sender boundary, and the preview an operator sees are the same values the tests
 * assert — a page that computed its own states could drift from the contract it claims to show.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveSectionStates,
  isLocked,
  isReadyToSchedule,
  versionChecksum,
  type EmailCampaignV1,
  type SectionStatus,
} from './email-campaign-contract';
import { loadEmailCampaign, listEmailCampaigns, type EmailCampaignRecord } from './email-campaign-store';
import { resolveCampaignSender, resolveTestRecipients, type SenderEnvLike, type SenderResolution } from './email-campaign-sender';
import { renderCampaignPreview, requiresScanContext, type CampaignPreview, type PreviewContact } from './email-campaign-preview';
import { runCampaignPreflight, type PreflightResult } from './email-campaign-preflight';
import { loadCampaignResults, type CampaignResults } from './email-campaign-results';
import { loadActiveGrowthCampaigns, type GrowthCampaign } from './growth-campaign-intelligence';
import { loadCampaignScanContext, loadCampaignScanContexts } from './email-campaign-scan-context';

export interface EmailCampaignListItem {
  readonly interventionKey: string;
  readonly name: string;
  readonly campaignName: string;
  readonly campaignRole: string;
  readonly version: number;
  readonly state: string;
  readonly recipientCount: number | null;
  readonly startAt: string | null;
  readonly owner: string;
  readonly readyToSchedule: boolean;
  readonly locked: boolean;
}

export interface EmailCampaignSegmentOption {
  readonly segment: string;
  readonly total: number;
  readonly eligible: number;
  readonly needsVerification: number;
  readonly excluded: number;
  readonly inSequence: number;
}

export interface EmailCampaignComposerOptions {
  readonly campaigns: readonly GrowthCampaign[];
  readonly segments: readonly EmailCampaignSegmentOption[];
  readonly warnings: readonly string[];
}

type SegmentSummaryRow = {
  readonly segment?: string | null;
  readonly eligibility_status?: string | null;
  readonly added_to_sequence_at?: string | null;
};

export function summarizeEmailCampaignSegments(
  rows: readonly SegmentSummaryRow[],
): EmailCampaignSegmentOption[] {
  const summaries = new Map<string, EmailCampaignSegmentOption>();
  for (const row of rows) {
    const segment = row.segment?.trim();
    if (!segment) continue;
    const current = summaries.get(segment) ?? {
      segment,
      total: 0,
      eligible: 0,
      needsVerification: 0,
      excluded: 0,
      inSequence: 0,
    };
    const status = row.eligibility_status ?? 'needs_verification';
    summaries.set(segment, {
      ...current,
      total: current.total + 1,
      eligible: current.eligible + (status === 'eligible' ? 1 : 0),
      needsVerification: current.needsVerification + (status === 'needs_verification' ? 1 : 0),
      excluded: current.excluded + (['suppressed', 'rejected', 'converted'].includes(status) ? 1 : 0),
      inSequence: current.inSequence + (row.added_to_sequence_at ? 1 : 0),
    });
  }
  return [...summaries.values()].sort((left, right) => left.segment.localeCompare(right.segment));
}

export async function loadEmailCampaignComposerOptions(
  supabase: SupabaseClient,
): Promise<EmailCampaignComposerOptions> {
  const [campaigns, contacts] = await Promise.all([
    loadActiveGrowthCampaigns(supabase),
    supabase
      .from('outreach_contacts')
      .select('segment,eligibility_status,added_to_sequence_at')
      .limit(5000),
  ]);
  const warnings: string[] = [];
  if (campaigns.length === 0) warnings.push('No active primary or challenger growth campaign is available.');
  if (contacts.error) warnings.push('Contact segment counts are unavailable; draft creation remains held.');
  return {
    campaigns,
    segments: summarizeEmailCampaignSegments((contacts.data ?? []) as SegmentSummaryRow[]),
    warnings,
  };
}

export interface EmailCampaignDetail {
  readonly record: EmailCampaignRecord;
  readonly contract: EmailCampaignV1;
  readonly sender: SenderResolution;
  readonly sections: readonly SectionStatus[];
  readonly readyToSchedule: boolean;
  readonly locked: boolean;
  readonly versionChecksum: string;
  readonly testRecipients: readonly string[];
  readonly previewContacts: readonly PreviewContact[];
  readonly preview: CampaignPreview | null;
  readonly audienceSample: readonly { readonly position: number; readonly email: string; readonly name: string | null; readonly company: string | null }[];
  readonly preflight: PreflightResult;
  readonly results: CampaignResults;
  readonly warnings: readonly string[];
}

/**
 * The sender lives in configuration, not in the stored contract, so a campaign saved while the
 * sender was unavailable reflects reality the moment it becomes available — and vice versa. A
 * contract that cached `authenticated: true` would keep claiming a sender that had been revoked.
 */
export function withResolvedSender(contract: EmailCampaignV1, sender: SenderResolution): EmailCampaignV1 {
  return {
    ...contract,
    sender: {
      displayName: contract.sender.displayName || sender.displayName,
      fromAddressRef: sender.fromAddressRef,
      replyToRef: sender.replyToRef,
      authenticated: sender.authenticated,
      authenticationEvidence: sender.authenticationEvidence,
    },
  };
}

export async function loadEmailCampaignList(
  supabase: SupabaseClient,
  env: SenderEnvLike,
): Promise<EmailCampaignListItem[]> {
  const sender = resolveCampaignSender(env);
  return (await listEmailCampaigns(supabase)).map((record) => {
    const contract = withResolvedSender(record.contract, sender);
    return {
      interventionKey: record.interventionKey,
      name: record.interventionName,
      campaignName: record.campaignName,
      campaignRole: record.campaignRole,
      version: contract.version,
      state: contract.state,
      recipientCount: contract.audience.recipientCount,
      startAt: contract.schedule.startAt,
      owner: contract.goal.owner,
      readyToSchedule: isReadyToSchedule(contract),
      locked: isLocked(contract),
    };
  });
}

async function loadPreviewContacts(supabase: SupabaseClient, contract: EmailCampaignV1): Promise<PreviewContact[]> {
  // Prefer the frozen audience: previewing against the live segment would show an operator a
  // recipient the campaign is not actually going to mail.
  if (contract.audience.audienceId) {
    const { data: members } = await supabase
      .from('outreach_campaign_audience_members')
      .select('contact_id,email,position')
      .eq('audience_id', contract.audience.audienceId)
      .order('position', { ascending: true })
      .limit(25);
    const ids = ((members ?? []) as { contact_id: string }[]).map((row) => String(row.contact_id));
    if (ids.length > 0) {
      const { data: contacts } = await supabase
        .from('outreach_contacts')
        .select('id,email,name,company,company_domain,personalization_reason,personalization_source_url')
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
        }));
    }
  }

  const { data } = await supabase
    .from('outreach_contacts')
    .select('id,email,name,company,company_domain,personalization_reason,personalization_source_url')
    .eq('segment', contract.audience.segment)
    .eq('eligibility_status', 'eligible')
    .limit(25);
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    contactId: String(row.id),
    email: String(row.email),
    name: (row.name as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    companyDomain: (row.company_domain as string | null) ?? null,
    personalizationReason: (row.personalization_reason as string | null) ?? null,
    personalizationSourceUrl: (row.personalization_source_url as string | null) ?? null,
  }));
}

export async function loadEmailCampaignDetail(args: {
  readonly supabase: SupabaseClient;
  readonly env: SenderEnvLike;
  readonly interventionKey: string;
  readonly previewContactId?: string | null;
  readonly previewSequenceStep?: number;
  readonly appUrl?: string;
}): Promise<EmailCampaignDetail | null> {
  const record = await loadEmailCampaign(args.supabase, args.interventionKey);
  if (!record) return null;

  const sender = resolveCampaignSender(args.env);
  const contract = withResolvedSender(record.contract, sender);
  const loadedPreviewContacts = await loadPreviewContacts(args.supabase, contract);
  const appUrl = args.appUrl ?? args.env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com';
  const previewSequenceStep = Math.max(1, Math.min(
    args.previewSequenceStep ?? 1,
    contract.schedule.maxSequenceSteps,
  ));
  const auditPreview = contract.tracking.tags.includes('audit-led')
    ? { secret: args.env['AUDIT_REPORT_CAPABILITY_SECRET'] ?? '', campaignId: contract.campaignId }
    : null;
  const auditScans = requiresScanContext(contract, previewSequenceStep) && auditPreview
    ? await loadCampaignScanContexts({
        supabase: args.supabase,
        contacts: loadedPreviewContacts,
        appUrl,
        auditPreview,
      })
    : new Map<string, Awaited<ReturnType<typeof loadCampaignScanContext>>>();
  const previewContacts = auditPreview
    ? [...loadedPreviewContacts].sort((left, right) =>
        Number(auditScans.has(right.contactId)) - Number(auditScans.has(left.contactId)))
    : loadedPreviewContacts;
  const selected = args.previewContactId
    ? previewContacts.find((contact) => contact.contactId === args.previewContactId) ?? previewContacts[0]
    : previewContacts[0];

  const scan = selected && requiresScanContext(contract, previewSequenceStep)
    ? auditScans.get(selected.contactId) ?? await loadCampaignScanContext({
        supabase: args.supabase,
        contact: selected,
        appUrl,
        auditPreview,
      })
    : null;
  const preview = selected
    ? renderCampaignPreview({
        contract,
        contact: selected,
        appUrl,
        scan,
        sequenceStep: previewSequenceStep,
        ...(sender.resolvedFromAddress && sender.resolvedReplyToAddress
          ? { resolvedSender: { from: sender.resolvedFromAddress, replyTo: sender.resolvedReplyToAddress } }
          : {}),
      })
    : null;

  const warnings: string[] = [];
  if (sender.blockingReason) warnings.push(sender.blockingReason);
  if (previewContacts.length === 0) {
    warnings.push(`No eligible contact in "${contract.audience.segment}" to preview against. Import and review contacts first.`);
  }
  if (contract.governance.testAcceptedAt && contract.governance.testVersionChecksum !== versionChecksum(contract)) {
    warnings.push('The accepted internal test belongs to a different version of this campaign. It no longer counts.');
  }

  let audienceSample: EmailCampaignDetail['audienceSample'] = [];
  if (contract.audience.audienceId) {
    audienceSample = previewContacts.map((contact, index) => ({
      position: index + 1,
      email: contact.email,
      name: contact.name,
      company: contact.company,
    }));
  }

  // The live gate state, not the last stored result: an operator looking at this page needs to
  // know whether it would pass NOW, after whatever changed in the ledgers since the last check.
  const { result: preflight } = await runCampaignPreflight({
    supabase: args.supabase,
    env: args.env,
    contract,
    nowMs: Date.now(),
  });

  const results = await loadCampaignResults({
    supabase: args.supabase,
    contract,
    testRecipients: resolveTestRecipients(args.env),
    nowMs: Date.now(),
  });
  warnings.push(...results.warnings);

  return {
    record,
    contract,
    sender,
    preflight,
    results,
    sections: deriveSectionStates(contract),
    readyToSchedule: isReadyToSchedule(contract),
    locked: isLocked(contract),
    versionChecksum: versionChecksum(contract),
    testRecipients: resolveTestRecipients(args.env),
    previewContacts,
    preview,
    audienceSample,
    warnings,
  };
}
