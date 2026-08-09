/**
 * `email_campaign_v1` (VCI-8 / ECP-2) — one typed, validated, versioned description of an email
 * campaign.
 *
 * Why a contract instead of fields spread across components: a campaign has to be reproducible
 * after the fact. When someone asks "what exactly went out, to whom, from whom, and what was
 * supposed to stop it?", the answer must come from one immutable object, not from re-reading a
 * template that has since been edited and a segment that has since changed.
 *
 * Two rules do the heavy lifting:
 *
 *   1. Everything here is *declared before* sending — success condition, stop condition, owner,
 *      the one meaningful variable, caps. A campaign that cannot say what would make it a failure
 *      cannot be scheduled.
 *   2. Once scheduled, the version is frozen. A meaningful edit produces version N+1 in `draft`;
 *      the sent version keeps the exact sender, audience, subject, body, timing, and rules used.
 *
 * This module is pure. Persistence lives in `email-campaign-store.ts`, preview/rendering in
 * `email-campaign-preview.ts`, and the send-time gate in ECP-3's preflight.
 */

export const EMAIL_CAMPAIGN_CONTRACT = 'email_campaign_v1' as const;

export type EmailCampaignPreparationState =
  | 'draft'
  | 'audience_ready'
  | 'content_ready'
  | 'qa_ready'
  | 'test_passed'
  | 'scheduled'
  | 'running'
  | 'evaluating'
  | 'completed'
  | 'stopped';

export const PREPARATION_SEQUENCE: readonly EmailCampaignPreparationState[] = [
  'draft', 'audience_ready', 'content_ready', 'qa_ready', 'test_passed',
  'scheduled', 'running', 'evaluating', 'completed',
];

/** After these states the version is historical evidence and may never be edited in place. */
export const LOCKED_STATES: ReadonlySet<EmailCampaignPreparationState> = new Set([
  'scheduled', 'running', 'evaluating', 'completed', 'stopped',
]);

export type EmailCampaignSectionKey =
  | 'goal' | 'sender' | 'audience' | 'subject' | 'content' | 'preview_test' | 'schedule' | 'results';

export type SectionState = 'complete' | 'needs_attention' | 'unavailable';

export interface EmailCampaignGoal {
  readonly objective: string;
  readonly buyer: string;
  readonly offerKey: string;
  readonly ctaGoal: string;
  readonly owner: string;
  /** Exactly one thing this intervention changes, so the result is attributable. */
  readonly meaningfulVariable: string;
  readonly successCondition: string;
  readonly stopCondition: string;
  readonly closureCondition: string;
  readonly retryPolicy: string;
}

export interface EmailCampaignSender {
  readonly displayName: string;
  /**
   * A REFERENCE to a configured, authenticated identity (an env key), never a literal address.
   * Storing a raw from-address here would let the composer invent a sender that DNS never
   * authorized — the exact founder boundary VCI-8 holds.
   */
  readonly fromAddressRef: string;
  readonly replyToRef: string;
  readonly authenticated: boolean;
  readonly authenticationEvidence: string | null;
}

export interface EmailCampaignAudience {
  readonly segment: string;
  readonly audienceId: string | null;
  readonly checksum: string | null;
  readonly recipientCount: number | null;
  readonly frozenAt: string | null;
  readonly excludedCounts: Readonly<Record<string, number>>;
}

export interface EmailCampaignStepContent {
  readonly subject: string;
  readonly previewText: string;
  readonly bodyTemplate: string;
}

export interface EmailCampaignContent {
  readonly templateId: string | null;
  readonly templateVersion: number;
  readonly subject: string;
  readonly previewText: string;
  readonly bodyFormat: 'text' | 'html';
  readonly bodyTemplate: string;
  /**
   * Steps 2..N. VCI-8 keeps the bounded three-step default "only when all three approved
   * templates are present", so the sequence length is derived from the approved copy rather than
   * configured separately — a campaign cannot declare three steps and then have two written.
   */
  readonly followUpSteps: readonly EmailCampaignStepContent[];
  readonly requiredMergeFields: readonly string[];
}

/** Step 1 is the primary content; later steps come from `followUpSteps`. */
export function stepContent(content: EmailCampaignContent, sequenceStep: number): EmailCampaignStepContent {
  if (sequenceStep <= 1) {
    return { subject: content.subject, previewText: content.previewText, bodyTemplate: content.bodyTemplate };
  }
  return (
    content.followUpSteps[sequenceStep - 2]
    ?? { subject: content.subject, previewText: content.previewText, bodyTemplate: content.bodyTemplate }
  );
}

export function allStepContent(content: EmailCampaignContent): EmailCampaignStepContent[] {
  return [
    { subject: content.subject, previewText: content.previewText, bodyTemplate: content.bodyTemplate },
    ...content.followUpSteps,
  ];
}

export interface EmailCampaignTracking {
  readonly tags: readonly string[];
  readonly utmSource: string;
  readonly utmMedium: string;
  readonly utmCampaign: string;
  readonly utmContent: string;
  readonly utmTerm: string | null;
}

export interface EmailCampaignSchedule {
  readonly timezone: string;
  readonly sendWindowStartHour: number;
  readonly sendWindowEndHour: number;
  readonly startAt: string | null;
  readonly spacingMinutes: number;
  readonly dailyCap: number;
  readonly maxSequenceSteps: number;
  readonly sequenceDelaysDays: readonly number[];
}

export interface EmailCampaignGovernance {
  readonly preflightPassedAt: string | null;
  readonly preflightFailures: readonly string[];
  readonly testAcceptedAt: string | null;
  /** Binds an accepted internal test to the exact version it validated. */
  readonly testVersionChecksum: string | null;
  readonly testRecipients: readonly string[];
  readonly scheduledAt: string | null;
  readonly lockedAt: string | null;
  readonly stopReason: string | null;
}

export interface EmailCampaignV1 {
  readonly contract: typeof EMAIL_CAMPAIGN_CONTRACT;
  readonly campaignId: string;
  readonly interventionId: string;
  readonly interventionKey: string;
  readonly version: number;
  readonly state: EmailCampaignPreparationState;
  readonly goal: EmailCampaignGoal;
  readonly sender: EmailCampaignSender;
  readonly audience: EmailCampaignAudience;
  readonly content: EmailCampaignContent;
  readonly tracking: EmailCampaignTracking;
  readonly schedule: EmailCampaignSchedule;
  readonly governance: EmailCampaignGovernance;
  readonly updatedAt: string;
}

export interface ContractIssue {
  readonly section: EmailCampaignSectionKey;
  readonly field: string;
  readonly message: string;
}

// ── Merge fields ────────────────────────────────────────────────────────────────

/**
 * The variables the production renderer actually substitutes. Anything else in a template is a
 * typo that would ship a literal `{{whatever}}` to a prospect, so it is a validation failure,
 * not a warning.
 */
export const SUPPORTED_MERGE_FIELDS: readonly string[] = [
  'name', 'company', 'domain', 'score', 'grade', 'top_issues',
  'report_url', 'walkthrough_url', 'scan_preview', 'walkthrough_cta',
  'personalization_reason', 'personalization_source_url',
];

/** Fields that come from the CONTACT and therefore have to resolve per recipient. */
export const CONTACT_MERGE_FIELDS: readonly string[] = ['name', 'company', 'domain'];

export function extractMergeFields(...templates: string[]): string[] {
  const found = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
      found.add((match[1] ?? '').toLowerCase());
    }
  }
  return [...found].sort();
}

export function unsupportedMergeFields(fields: readonly string[]): string[] {
  return fields.filter((field) => !SUPPORTED_MERGE_FIELDS.includes(field));
}

// ── Validation ──────────────────────────────────────────────────────────────────

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>)]+/gi;

function requireText(
  value: unknown,
  section: EmailCampaignSectionKey,
  field: string,
  issues: ContractIssue[],
  message: string,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ section, field, message });
  }
}

/**
 * Structural validation of a stored or edited contract. This is the "can we describe it" gate;
 * the "is it safe to send" gate is ECP-3's preflight, which additionally re-checks live
 * suppression, audience drift, and provider state.
 */
export function validateEmailCampaignV1(input: EmailCampaignV1): ContractIssue[] {
  const issues: ContractIssue[] = [];

  if (input.contract !== EMAIL_CAMPAIGN_CONTRACT) {
    issues.push({ section: 'goal', field: 'contract', message: `unknown contract "${String(input.contract)}"` });
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    issues.push({ section: 'goal', field: 'version', message: 'version must be a positive integer' });
  }

  // Goal — a campaign that cannot state what failure looks like must not be schedulable.
  requireText(input.goal.objective, 'goal', 'objective', issues, 'state what this campaign is for');
  requireText(input.goal.buyer, 'goal', 'buyer', issues, 'name the buyer, not a generic audience');
  requireText(input.goal.offerKey, 'goal', 'offerKey', issues, 'offer is required');
  requireText(input.goal.ctaGoal, 'goal', 'ctaGoal', issues, 'state the one action a reply should take');
  requireText(input.goal.owner, 'goal', 'owner', issues, 'an accountable owner is required');
  requireText(input.goal.meaningfulVariable, 'goal', 'meaningfulVariable', issues, 'declare the one variable this intervention changes');
  requireText(input.goal.successCondition, 'goal', 'successCondition', issues, 'declare the success condition before sending');
  requireText(input.goal.stopCondition, 'goal', 'stopCondition', issues, 'declare the stop condition before sending');
  requireText(input.goal.closureCondition, 'goal', 'closureCondition', issues, 'declare how this campaign closes');
  requireText(input.goal.retryPolicy, 'goal', 'retryPolicy', issues, 'declare the retry policy');

  // Sender — references only, and an unauthenticated identity is a hard stop.
  requireText(input.sender.displayName, 'sender', 'displayName', issues, 'sender display name is required');
  requireText(input.sender.fromAddressRef, 'sender', 'fromAddressRef', issues, 'reference a configured sender identity');
  requireText(input.sender.replyToRef, 'sender', 'replyToRef', issues, 'reference a configured reply-to identity');
  if (input.sender.fromAddressRef.includes('@') || input.sender.replyToRef.includes('@')) {
    issues.push({
      section: 'sender',
      field: 'fromAddressRef',
      message: 'store a configuration reference, not a literal address — an address typed here was never DNS-authenticated',
    });
  }
  if (!input.sender.authenticated) {
    issues.push({ section: 'sender', field: 'authenticated', message: 'no authenticated GEO-Pulse sending identity is configured' });
  }

  // Audience — a frozen snapshot or nothing.
  requireText(input.audience.segment, 'audience', 'segment', issues, 'choose a source segment');
  if (!input.audience.audienceId || !input.audience.checksum) {
    issues.push({ section: 'audience', field: 'audienceId', message: 'freeze the audience before scheduling' });
  } else if (!input.audience.recipientCount || input.audience.recipientCount < 1) {
    issues.push({ section: 'audience', field: 'recipientCount', message: 'the frozen audience is empty' });
  }

  // Subject / content.
  requireText(input.content.subject, 'subject', 'subject', issues, 'subject is required');
  requireText(input.content.previewText, 'subject', 'previewText', issues, 'preview text is required — inboxes show it beside the subject');
  requireText(input.content.bodyTemplate, 'content', 'bodyTemplate', issues, 'body is required');
  if (input.content.bodyFormat !== 'text' && input.content.bodyFormat !== 'html') {
    issues.push({ section: 'content', field: 'bodyFormat', message: 'body format must be text or html' });
  }
  const steps = allStepContent(input.content);
  steps.forEach((step, index) => {
    const label = index === 0 ? 'step 1' : `step ${String(index + 1)}`;
    if (index > 0) {
      if (!step.subject.trim()) issues.push({ section: 'content', field: `${label}.subject`, message: 'follow-up subject is required' });
      if (!step.bodyTemplate.trim()) issues.push({ section: 'content', field: `${label}.body`, message: 'follow-up body is required' });
    }
    for (const field of unsupportedMergeFields(extractMergeFields(step.subject, step.previewText, step.bodyTemplate))) {
      issues.push({ section: 'content', field: `${label} {{${field}}}`, message: 'unknown merge field — it would ship literally to the recipient' });
    }
    for (const url of step.bodyTemplate.match(URL_IN_TEXT_RE) ?? []) {
      if (url.startsWith('http://')) {
        issues.push({ section: 'content', field: `${label} links`, message: `insecure link ${url}` });
      }
    }
  });

  // Tracking — attribution has to survive the click.
  requireText(input.tracking.utmSource, 'content', 'utmSource', issues, 'utm_source is required');
  requireText(input.tracking.utmMedium, 'content', 'utmMedium', issues, 'utm_medium is required');
  requireText(input.tracking.utmCampaign, 'content', 'utmCampaign', issues, 'utm_campaign is required');
  requireText(input.tracking.utmContent, 'content', 'utmContent', issues, 'utm_content is required');

  // Schedule — caps and windows are declared, not implied.
  requireText(input.schedule.timezone, 'schedule', 'timezone', issues, 'campaign timezone is required');
  if (input.schedule.sendWindowStartHour < 0 || input.schedule.sendWindowStartHour > 23
    || input.schedule.sendWindowEndHour < 1 || input.schedule.sendWindowEndHour > 24
    || input.schedule.sendWindowEndHour <= input.schedule.sendWindowStartHour) {
    issues.push({ section: 'schedule', field: 'sendWindow', message: 'send window must be a valid business-hours range' });
  }
  if (input.schedule.spacingMinutes < 1) {
    issues.push({ section: 'schedule', field: 'spacingMinutes', message: 'spacing must pace sends by at least one minute' });
  }
  if (input.schedule.dailyCap < 1) {
    issues.push({ section: 'schedule', field: 'dailyCap', message: 'a daily cap is required' });
  }
  if (input.schedule.maxSequenceSteps < 1 || input.schedule.maxSequenceSteps > 3) {
    issues.push({ section: 'schedule', field: 'maxSequenceSteps', message: 'the approved bounded sequence is at most three messages' });
  }
  if (input.schedule.sequenceDelaysDays.length !== input.schedule.maxSequenceSteps) {
    issues.push({ section: 'schedule', field: 'sequenceDelaysDays', message: 'declare one delay per sequence step' });
  }
  if (steps.length !== input.schedule.maxSequenceSteps) {
    issues.push({
      section: 'schedule',
      field: 'maxSequenceSteps',
      message: `${String(input.schedule.maxSequenceSteps)} steps are declared but ${String(steps.length)} message(s) are approved — the bounded sequence only runs when every step is written`,
    });
  }
  if (!input.schedule.startAt) {
    issues.push({ section: 'schedule', field: 'startAt', message: 'choose a first send time' });
  }
  if (input.audience.recipientCount && input.audience.recipientCount > input.schedule.dailyCap * input.schedule.maxSequenceSteps) {
    issues.push({ section: 'schedule', field: 'dailyCap', message: 'the frozen audience exceeds the declared cap' });
  }

  return issues;
}

// ── Section states ──────────────────────────────────────────────────────────────

export interface SectionStatus {
  readonly key: EmailCampaignSectionKey;
  readonly label: string;
  readonly state: SectionState;
  readonly detail: string;
}

const SECTION_LABELS: Record<EmailCampaignSectionKey, string> = {
  goal: 'Goal',
  sender: 'Sender',
  audience: 'Audience',
  subject: 'Subject & preview',
  content: 'Content',
  preview_test: 'Preview & test',
  schedule: 'Schedule',
  results: 'Results',
};

/**
 * One visible state per section: complete, needs attention, or unavailable. "Unavailable" means
 * the operator cannot fix it here — an unauthenticated sender needs DNS and a credential holder,
 * and results do not exist until the campaign runs. Showing those as "needs attention" would
 * send the operator hunting for a control that does not exist.
 */
export function deriveSectionStates(contract: EmailCampaignV1): SectionStatus[] {
  const issues = validateEmailCampaignV1(contract);
  const bySection = new Map<EmailCampaignSectionKey, ContractIssue[]>();
  for (const issue of issues) {
    bySection.set(issue.section, [...(bySection.get(issue.section) ?? []), issue]);
  }

  const statuses: SectionStatus[] = (['goal', 'sender', 'audience', 'subject', 'content'] as const).map((key) => {
    const sectionIssues = bySection.get(key) ?? [];
    if (key === 'sender' && !contract.sender.authenticated) {
      return {
        key,
        label: SECTION_LABELS[key],
        state: 'unavailable' as const,
        detail: 'No authenticated GEO-Pulse sending identity is configured yet. This needs DNS and a credential holder — it cannot be resolved from this page.',
      };
    }
    return {
      key,
      label: SECTION_LABELS[key],
      state: sectionIssues.length === 0 ? ('complete' as const) : ('needs_attention' as const),
      detail: sectionIssues.length === 0 ? 'Complete' : sectionIssues.map((issue) => `${issue.field}: ${issue.message}`).join(' · '),
    };
  });

  const contentReady = statuses.every((status) => status.state === 'complete');
  statuses.push({
    key: 'preview_test',
    label: SECTION_LABELS.preview_test,
    state: !contract.sender.authenticated
      ? 'unavailable'
      : contract.governance.testAcceptedAt && contract.governance.testVersionChecksum === versionChecksum(contract)
        ? 'complete'
        : 'needs_attention',
    detail: !contract.sender.authenticated
      ? 'An internal test cannot be delivered until a GEO-Pulse sender is authenticated.'
      : contract.governance.testAcceptedAt
        ? contract.governance.testVersionChecksum === versionChecksum(contract)
          ? `Internal test accepted ${contract.governance.testAcceptedAt}`
          : 'The campaign changed after the last accepted test. Re-test this exact version.'
        : 'Send one internal test to the configured allowlist.',
  });

  statuses.push({
    key: 'schedule',
    label: SECTION_LABELS.schedule,
    state: (bySection.get('schedule') ?? []).length > 0
      ? 'needs_attention'
      : !contentReady
        ? 'needs_attention'
        : contract.governance.scheduledAt
          ? 'complete'
          : 'needs_attention',
    detail: (bySection.get('schedule') ?? []).map((issue) => `${issue.field}: ${issue.message}`).join(' · ')
      || (contract.governance.scheduledAt ? `Scheduled ${contract.governance.scheduledAt}` : 'Every gate above must pass before scheduling.'),
  });

  statuses.push({
    key: 'results',
    label: SECTION_LABELS.results,
    state: LOCKED_STATES.has(contract.state) && contract.state !== 'scheduled' ? 'complete' : 'unavailable',
    detail: LOCKED_STATES.has(contract.state) && contract.state !== 'scheduled'
      ? 'Results reconcile against the send, reply, attribution, and subscription ledgers.'
      : 'Results appear once the campaign starts sending.',
  });

  return statuses;
}

export function isReadyToSchedule(contract: EmailCampaignV1): boolean {
  return deriveSectionStates(contract)
    .filter((status) => status.key !== 'schedule' && status.key !== 'results')
    .every((status) => status.state === 'complete');
}

// ── Versioning and immutability ─────────────────────────────────────────────────

/**
 * Identity of everything a recipient would experience. The internal test is bound to this value,
 * so changing the sender, subject, body, audience, or cadence invalidates a passed test instead
 * of silently carrying its approval onto different mail.
 */
export function versionChecksum(contract: EmailCampaignV1): string {
  const canonical = JSON.stringify([
    contract.interventionKey,
    contract.version,
    contract.sender.displayName,
    contract.sender.fromAddressRef,
    contract.sender.replyToRef,
    contract.audience.audienceId,
    contract.audience.checksum,
    contract.content.subject,
    contract.content.previewText,
    contract.content.bodyFormat,
    contract.content.bodyTemplate,
    contract.content.followUpSteps,
    contract.tracking.utmSource,
    contract.tracking.utmMedium,
    contract.tracking.utmCampaign,
    contract.tracking.utmContent,
    contract.tracking.utmTerm,
    contract.schedule.startAt,
    contract.schedule.spacingMinutes,
    contract.schedule.dailyCap,
    contract.schedule.maxSequenceSteps,
    contract.schedule.sequenceDelaysDays,
  ]);
  // Small, dependency-free FNV-1a: this is a change detector, not a security primitive.
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function isLocked(contract: EmailCampaignV1): boolean {
  return LOCKED_STATES.has(contract.state);
}

export type ContractEdit = {
  readonly goal?: Partial<EmailCampaignGoal>;
  readonly sender?: Partial<EmailCampaignSender>;
  readonly audience?: Partial<EmailCampaignAudience>;
  readonly content?: Partial<EmailCampaignContent>;
  readonly tracking?: Partial<EmailCampaignTracking>;
  readonly schedule?: Partial<EmailCampaignSchedule>;
  readonly governance?: Partial<EmailCampaignGovernance>;
  readonly state?: EmailCampaignPreparationState;
};

function merged(contract: EmailCampaignV1, edit: ContractEdit, nowIso: string): EmailCampaignV1 {
  return {
    ...contract,
    state: edit.state ?? contract.state,
    goal: { ...contract.goal, ...edit.goal },
    sender: { ...contract.sender, ...edit.sender },
    audience: { ...contract.audience, ...edit.audience },
    content: { ...contract.content, ...edit.content },
    tracking: { ...contract.tracking, ...edit.tracking },
    schedule: { ...contract.schedule, ...edit.schedule },
    governance: { ...contract.governance, ...edit.governance },
    updatedAt: nowIso,
  };
}

/**
 * Apply an edit. A locked version is never mutated: the edit lands on a NEW draft version so the
 * scheduled version keeps exactly what it promised to send.
 */
export function applyContractEdit(
  contract: EmailCampaignV1,
  edit: ContractEdit,
  nowIso = new Date().toISOString(),
): { readonly contract: EmailCampaignV1; readonly newVersion: boolean } {
  if (!isLocked(contract)) {
    return { contract: merged(contract, edit, nowIso), newVersion: false };
  }

  const candidate = merged(contract, edit, nowIso);
  if (versionChecksum(candidate) === versionChecksum(contract)) {
    // Nothing a recipient would experience changed. This is either bookkeeping (a stop reason, a
    // preflight result) or a forward lifecycle move — scheduled → running → evaluating →
    // completed/stopped. Both are legitimate on a locked version. What is NOT legitimate is
    // dropping back into an editable state, which would let a scheduled version be reopened and
    // rewritten in place.
    const requested = edit.state ?? contract.state;
    return {
      contract: { ...candidate, state: LOCKED_STATES.has(requested) ? requested : contract.state },
      newVersion: false,
    };
  }

  return {
    newVersion: true,
    contract: {
      ...candidate,
      version: contract.version + 1,
      state: 'draft',
      governance: {
        ...candidate.governance,
        // A new version has never been tested, preflighted, or scheduled. Carrying any of that
        // forward would let an edited campaign inherit approval it never earned.
        preflightPassedAt: null,
        preflightFailures: [],
        testAcceptedAt: null,
        testVersionChecksum: null,
        scheduledAt: null,
        lockedAt: null,
      },
    },
  };
}

export function createDraftContract(args: {
  readonly campaignId: string;
  readonly interventionId: string;
  readonly interventionKey: string;
  readonly goal: EmailCampaignGoal;
  readonly sender: EmailCampaignSender;
  readonly segment: string;
  readonly content: Omit<EmailCampaignContent, 'requiredMergeFields' | 'followUpSteps'> & {
    readonly followUpSteps?: readonly EmailCampaignStepContent[];
  };
  readonly tracking: EmailCampaignTracking;
  readonly schedule: EmailCampaignSchedule;
  readonly nowIso?: string;
}): EmailCampaignV1 {
  return {
    contract: EMAIL_CAMPAIGN_CONTRACT,
    campaignId: args.campaignId,
    interventionId: args.interventionId,
    interventionKey: args.interventionKey,
    version: 1,
    state: 'draft',
    goal: args.goal,
    sender: args.sender,
    audience: { segment: args.segment, audienceId: null, checksum: null, recipientCount: null, frozenAt: null, excludedCounts: {} },
    content: {
      ...args.content,
      followUpSteps: args.content.followUpSteps ?? [],
      requiredMergeFields: extractMergeFields(
        ...[
          args.content.subject,
          args.content.previewText,
          args.content.bodyTemplate,
          ...(args.content.followUpSteps ?? []).flatMap((step) => [step.subject, step.previewText, step.bodyTemplate]),
        ],
      ),
    },
    tracking: args.tracking,
    schedule: args.schedule,
    governance: {
      preflightPassedAt: null,
      preflightFailures: [],
      testAcceptedAt: null,
      testVersionChecksum: null,
      testRecipients: [],
      scheduledAt: null,
      lockedAt: null,
      stopReason: null,
    },
    updatedAt: args.nowIso ?? new Date().toISOString(),
  };
}
