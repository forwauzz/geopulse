/**
 * Campaign preview (VCI-8 / ECP-2).
 *
 * Preview goes through the PRODUCTION renderer (`renderOutreachTemplate` → `emailShell`). A
 * separate preview renderer is the classic way to ship a campaign that looked right in the admin
 * and arrived broken: different escaping, a missing footer, a missing unsubscribe link. Whatever
 * this shows is literally what the sender would build.
 *
 * The other job here is refusing to be reassuring. The renderer substitutes friendly fallbacks
 * ("there" for a missing name), so a template can look perfect while personalization is silently
 * missing for half the cohort. `unresolvedMergeFields` checks the CONTACT before rendering and
 * reports what would have been faked.
 */
import { renderOutreachTemplate, type OutreachTemplateVars } from './outreach-templates';
import {
  CONTACT_MERGE_FIELDS,
  extractMergeFields,
  stepContent,
  unsupportedMergeFields,
  type EmailCampaignV1,
} from './email-campaign-contract';

/** Fields that only exist once a site has been scanned for this recipient. */
export const SCAN_MERGE_FIELDS: readonly string[] = ['score', 'grade', 'top_issues', 'report_url'];

export interface PreviewContact {
  readonly contactId: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly companyDomain: string | null;
  readonly personalizationReason: string | null;
  readonly personalizationSourceUrl: string | null;
}

export interface PreviewScanContext {
  readonly score: number;
  readonly grade: string;
  readonly topIssues: ReadonlyArray<{ check?: string; fix?: string }>;
  readonly reportUrl: string;
}

export interface CampaignPreview {
  readonly subject: string;
  readonly html: string;
  readonly previewText: string;
  readonly senderLine: string;
  readonly replyToLine: string;
  readonly unsubscribeUrl: string;
  readonly links: readonly string[];
  readonly unresolved: readonly { readonly field: string; readonly why: string }[];
}

/**
 * Which `{{fields}}` this contact cannot fill. Fail-closed: an unknown field, a missing contact
 * value, and a scan-dependent field with no scan all count as unresolved.
 */
export function unresolvedMergeFields(args: {
  readonly contract: EmailCampaignV1;
  readonly contact: PreviewContact;
  readonly scan?: PreviewScanContext | null;
  /** Defaults to step 1; pass a later step to check a follow-up message's fields. */
  readonly sequenceStep?: number;
}): { readonly field: string; readonly why: string }[] {
  const step = stepContent(args.contract.content, args.sequenceStep ?? 1);
  const required = extractMergeFields(step.subject, step.previewText, step.bodyTemplate);
  const unresolved: { field: string; why: string }[] = [];

  for (const field of unsupportedMergeFields(required)) {
    unresolved.push({ field, why: 'not a supported merge field — it would ship literally' });
  }

  for (const field of required) {
    if (CONTACT_MERGE_FIELDS.includes(field)) {
      const value = field === 'name' ? args.contact.name
        : field === 'company' ? args.contact.company
        : args.contact.companyDomain;
      if (!value || !value.trim()) {
        unresolved.push({ field, why: `this contact has no ${field}; the renderer would substitute a generic fallback` });
      }
    }
    if (SCAN_MERGE_FIELDS.includes(field) && !args.scan) {
      unresolved.push({ field, why: 'requires a completed scan for this recipient, and none exists' });
    }
    if (field === 'personalization_reason' && !args.contact.personalizationReason) {
      unresolved.push({ field, why: 'no verified personalization evidence for this contact' });
    }
    if (field === 'personalization_source_url' && !args.contact.personalizationSourceUrl) {
      unresolved.push({ field, why: 'no public source URL recorded for this contact' });
    }
  }

  return unresolved;
}

export function campaignUtmQuery(contract: EmailCampaignV1, sequenceStep: number): string {
  const params = new URLSearchParams({
    utm_source: contract.tracking.utmSource,
    utm_medium: contract.tracking.utmMedium,
    utm_campaign: contract.tracking.utmCampaign,
    utm_content: `${contract.tracking.utmContent}-step-${String(sequenceStep)}`,
  });
  if (contract.tracking.utmTerm) params.set('utm_term', contract.tracking.utmTerm);
  return params.toString();
}

/**
 * Render one recipient's message exactly as the sender would build it.
 *
 * `previewContactId` is used for the unsubscribe and pixel paths so the operator can see the real
 * footer. Nothing here contacts a provider or records a send — this is composition only.
 */
export function renderCampaignPreview(args: {
  readonly contract: EmailCampaignV1;
  readonly contact: PreviewContact;
  readonly appUrl: string;
  readonly scan?: PreviewScanContext | null;
  readonly sequenceStep?: number;
}): CampaignPreview {
  const appUrl = args.appUrl.replace(/\/+$/, '');
  const sequenceStep = args.sequenceStep ?? 1;
  const query = campaignUtmQuery(args.contract, sequenceStep);
  const domain = args.contact.companyDomain ?? args.contact.email.slice(args.contact.email.indexOf('@') + 1);
  const walkthroughUrl = `${appUrl}/walkthrough?${query}&source=outreach`;
  // Preview identifiers, not ledger rows: a preview must never allocate a real send id.
  const unsubscribeUrl = `${appUrl}/api/outreach/unsubscribe/preview-${args.contact.contactId}`;
  const pixelUrl = `${appUrl}/api/outreach/open/preview-${args.contact.contactId}`;

  const vars: OutreachTemplateVars = {
    name: args.contact.name,
    company: args.contact.company,
    domain,
    score: args.scan?.score ?? 0,
    grade: args.scan?.grade ?? '—',
    topIssues: args.scan?.topIssues ?? [],
    reportUrl: args.scan?.reportUrl ?? `${appUrl}/results/preview?${query}`,
    walkthroughUrl,
    personalizationReason: args.contact.personalizationReason,
    personalizationSourceUrl: args.contact.personalizationSourceUrl,
  };

  const step = stepContent(args.contract.content, sequenceStep);
  const rendered = renderOutreachTemplate(
    {
      subjectTemplate: step.subject,
      bodyFormat: args.contract.content.bodyFormat,
      bodyTemplate: step.bodyTemplate,
    },
    vars,
    pixelUrl,
    unsubscribeUrl,
  );

  const links = [...new Set((rendered.html.match(/https?:\/\/[^\s"'<>)]+/gi) ?? []))];

  return {
    subject: rendered.subject,
    html: rendered.html,
    previewText: step.previewText,
    senderLine: `${args.contract.sender.displayName} <${args.contract.sender.authenticated ? args.contract.sender.fromAddressRef : 'no authenticated sender configured'}>`,
    replyToLine: args.contract.sender.authenticated ? args.contract.sender.replyToRef : 'no authenticated reply-to configured',
    unsubscribeUrl,
    links,
    unresolved: unresolvedMergeFields({
      contract: args.contract,
      contact: args.contact,
      scan: args.scan ?? null,
      sequenceStep,
    }),
  };
}

/** Literal `{{tokens}}` surviving into rendered output are always a defect. */
export function findLiteralTokens(html: string): string[] {
  return [...new Set((html.match(/\{\{\s*[a-z0-9_]+\s*\}\}/gi) ?? []).map((token) => token.trim()))];
}
