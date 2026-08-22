import { createHash } from 'node:crypto';
import { createDraftContract, type EmailCampaignV1 } from './email-campaign-contract';
import { renderCampaignPreview, type PreviewContact, type PreviewScanContext } from './email-campaign-preview';

export type AuditCampaignLane = 'direct_business' | 'agency_partner';

const sender = {
  displayName: 'Tamon at GEO-Pulse',
  fromAddressRef: 'CAMPAIGN_FROM_ADDRESS',
  replyToRef: 'CAMPAIGN_REPLY_TO_ADDRESS',
  authenticated: true,
  authenticationEvidence: 'Configured GEO-Pulse sender must pass live preflight.',
};

function schedule() {
  return { timezone: 'America/Toronto', sendWindowStartHour: 9, sendWindowEndHour: 16, startAt: null, spacingMinutes: 12, dailyCap: 25, maxSequenceSteps: 2, sequenceDelaysDays: [0, 4] };
}

export function buildAuditCampaignContracts(nowIso = new Date().toISOString()): { directBusiness: EmailCampaignV1; agencyPartner: EmailCampaignV1 } {
  const directBusiness = createDraftContract({
    campaignId: 'audit-direct-business-v1', interventionId: 'audit-direct-business-v1', interventionKey: 'audit-direct-business-v1', nowIso,
    goal: { objective: 'Start a qualified conversation with a business owner using a prepared audit', buyer: 'Owner or operator of an established service business', offerKey: 'personalized_audit_preview', ctaGoal: 'Review the private 10-page preview and open the full audit', owner: 'tamon', meaningfulVariable: 'personalized audit-led opening', successCondition: 'At least one qualified reply, full-report open, or monthly-monitoring checkout', stopCondition: '25 provider-accepted first messages with no qualified reply or full-report open', closureCondition: 'Reply, unsubscribe, disqualification, conversion, or sequence completion', retryPolicy: 'One retry for a transient delivery failure; never retry a suppression or eligibility failure' },
    sender, segment: 'audit-direct-business',
    content: { templateId: 'audit-direct-business-v1', templateVersion: 2, subject: '{{company}} website audit — prepared for {{name}}', previewText: 'We audited {{domain}} and prepared the first 10 pages for you.', bodyFormat: 'html', bodyTemplate: '<p>Hi {{name}},</p><p>We audited {{domain}} and prepared a private 10-page version for {{company}}. It shows the observed gaps, what to fix, who should own each fix, and how to verify the work.</p>{{report_thumbnail}}<p>If it is useful, the last page opens the remaining report and the monthly monitoring option.</p>', followUpSteps: [{ subject: 'The fixes inside {{company}}’s audit', previewText: 'A practical handoff for your web or content team.', bodyTemplate: '<p>Hi {{name}},</p><p>The audit for {{domain}} includes actions your team can assign and verify. Here is the private copy again: <a href="{{report_url}}">review the audit</a>.</p>' }] },
    tracking: { tags: ['audit-led', 'direct-business', 'dry-run-until-activated'], utmSource: 'apollo', utmMedium: 'email', utmCampaign: 'audit_direct_business_v1', utmContent: 'personalized_audit', utmTerm: null }, schedule: schedule(),
  });
  const agencyPartner = createDraftContract({
    campaignId: 'audit-agency-partner-v1', interventionId: 'audit-agency-partner-v1', interventionKey: 'audit-agency-partner-v1', nowIso,
    goal: { objective: 'Start a qualified partner conversation using a client-ready audit', buyer: 'Agency or digital MSP owner serving business clients', offerKey: 'client_audit_delivery_system', ctaGoal: 'Review the prepared client audit and discuss recurring delivery', owner: 'tamon', meaningfulVariable: 'partner resale and client-retention framing', successCondition: 'At least one qualified partner reply, full-report open, or booked conversation', stopCondition: '25 provider-accepted first messages with no qualified reply or full-report open', closureCondition: 'Reply, unsubscribe, disqualification, conversion, or sequence completion', retryPolicy: 'One retry for a transient delivery failure; never retry a suppression or eligibility failure' },
    sender, segment: 'audit-agency-partner',
    content: { templateId: 'audit-agency-partner-v1', templateVersion: 1, subject: 'A client-ready audit for {{company}}', previewText: 'A concrete website deliverable your team can hand to a client.', bodyFormat: 'html', bodyTemplate: '<p>Hi {{name}},</p><p>We prepared a private audit around {{domain}} to show the kind of client deliverable GEO-Pulse can generate: observed gaps, prioritized fixes, ownership, and verification.</p><p><a href="{{report_url}}">Review the 10-page client preview</a></p><p>The full version can support a recurring client reporting and remediation conversation.</p>', followUpSteps: [{ subject: 'Could this fit your client workflow?', previewText: 'The report is designed to be handed to a client or web team.', bodyTemplate: '<p>Hi {{name}},</p><p>The prepared audit is meant to be useful after the sales call too: your client can give the actions to their web team and verify fixes later. <a href="{{report_url}}">Review it here</a>.</p>' }] },
    tracking: { tags: ['audit-led', 'agency-partner', 'dry-run-until-activated'], utmSource: 'apollo', utmMedium: 'email', utmCampaign: 'audit_agency_partner_v1', utmContent: 'client_audit_system', utmTerm: null }, schedule: schedule(),
  });
  return { directBusiness, agencyPartner };
}

export function evaluateAuditCampaignGate(input: { campaignFrozen: boolean; reportQaPassed: boolean; linksValid: boolean; suppressionLoaded: boolean; unresolvedRecipients: number }) {
  const gates = [
    { key: 'campaign_frozen', ok: input.campaignFrozen },
    { key: 'report_qa_passed', ok: input.reportQaPassed },
    { key: 'preview_and_full_links_valid', ok: input.linksValid },
    { key: 'suppression_evidence_loaded', ok: input.suppressionLoaded },
    { key: 'all_personalization_resolved', ok: input.unresolvedRecipients === 0 },
    { key: 'provider_send_disabled', ok: true },
  ];
  return { ready: gates.every((gate) => gate.ok), gates, failures: gates.filter((gate) => !gate.ok).map((gate) => gate.key) };
}

export function buildAuditDryRun(args: {
  contract: EmailCampaignV1;
  recipients: readonly PreviewContact[];
  scansByContactId: ReadonlyMap<string, PreviewScanContext>;
  appUrl: string;
  campaignFrozen: boolean;
  reportQaPassed: boolean;
  linksValid: boolean;
  suppressionLoaded: boolean;
}) {
  const rendered = args.recipients.map((contact) => {
    const preview = renderCampaignPreview({ contract: args.contract, contact, scan: args.scansByContactId.get(contact.contactId), appUrl: args.appUrl });
    return { contactId: contact.contactId, email: contact.email, subject: preview.subject, contentSha256: createHash('sha256').update(preview.html).digest('hex'), links: preview.links, unresolved: preview.unresolved };
  });
  const gate = evaluateAuditCampaignGate({ campaignFrozen: args.campaignFrozen, reportQaPassed: args.reportQaPassed, linksValid: args.linksValid, suppressionLoaded: args.suppressionLoaded, unresolvedRecipients: rendered.filter((item) => item.unresolved.length > 0).length });
  return { contract: 'audit_campaign_dry_run_v1' as const, mode: 'dry_run' as const, ready: gate.ready, providerCalls: 0, sends: 0, gate, campaignId: args.contract.campaignId, version: args.contract.version, recipients: rendered, funnel: { delivered: 'not_available', previewOpened: 'not_available', fullReportOpened: 'not_available', replied: 'not_available', checkoutStarted: 'not_available', converted: 'not_available' } };
}

export function classifyApolloLead(input: { email: string; companyDomain: string; companyType?: string | null; title?: string | null }): AuditCampaignLane | 'reject' {
  if (!/^\S+@\S+\.\S+$/.test(input.email) || !input.companyDomain.trim()) return 'reject';
  const text = `${input.companyType ?? ''} ${input.title ?? ''}`.toLowerCase();
  return /(managed service|msp|agency|consultancy|consulting|marketing|web design|it service)/.test(text) ? 'agency_partner' : 'direct_business';
}

export function buildApolloIntakeManifest(records: readonly { email: string; companyDomain: string; companyType?: string | null; title?: string | null }[], suppressedEmails: ReadonlySet<string>) {
  const seen = new Set<string>();
  const accepted: Array<{ email: string; companyDomain: string; lane: AuditCampaignLane }> = [];
  const rejected: Array<{ email: string; reason: string }> = [];
  for (const record of records) {
    const email = record.email.trim().toLowerCase();
    const lane = classifyApolloLead(record);
    const reason = lane === 'reject' ? 'invalid_or_incomplete' : suppressedEmails.has(email) ? 'suppressed' : seen.has(email) ? 'duplicate' : null;
    if (reason) rejected.push({ email, reason });
    else { seen.add(email); accepted.push({ email, companyDomain: record.companyDomain.trim().toLowerCase(), lane: lane as AuditCampaignLane }); }
  }
  return { contract: 'apollo_intake_manifest_v1' as const, mode: 'intake_only' as const, providerCalls: 0, enrollments: 0, sends: 0, accepted, rejected };
}
