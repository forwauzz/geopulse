'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { resolveFirstRunAt } from '@/lib/server/montreal-time';
import {
  applyContractEdit,
  createDraftContract,
  extractMergeFields,
  allStepContent,
  type ContractEdit,
} from '@/lib/server/email-campaign-contract';
import { loadEmailCampaign, saveValidatedEmailCampaign } from '@/lib/server/email-campaign-store';
import { resolveCampaignSender } from '@/lib/server/email-campaign-sender';
import { loadEmailCampaignDetail, withResolvedSender } from '@/lib/server/email-campaign-console';
import { scheduleCampaign, sendInternalTest, stopCampaign } from '@/lib/server/email-campaign-schedule';
import {
  freezeCampaignAudience,
  loadAudienceCandidates,
  loadAudienceEvidence,
  selectCampaignAudience,
} from '@/lib/server/campaign-audience';
import { structuredLog } from '@/lib/server/structured-log';
import { buildAuditCampaignContracts } from '@/lib/server/audit-campaign-readiness';
import {
  applyApolloMspPromotion,
  importContacts,
  loadApolloPromotionContacts,
  normalizeSegment,
  parseContactCsvImport,
  planApolloMspPromotion,
} from '@/lib/server/outreach-contacts';

const CONSOLE_PATH = '/admin/campaigns/email';

export async function createAuditEmailCampaignAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const campaignId = text(formData, 'campaignId');
  const segment = text(formData, 'segment');
  const interventionKey = 'audit-direct-business-2026q3-v1';
  if (!campaignId || !segment) redirect(`${CONSOLE_PATH}?error=missing_required_fields`);

  const { data: existing } = await ctx.adminDb
    .from('growth_campaign_interventions')
    .select('id')
    .eq('intervention_key', interventionKey)
    .maybeSingle();
  let interventionId = existing?.id ? String(existing.id) : null;
  if (!interventionId) {
    const { data: inserted, error } = await ctx.adminDb.from('growth_campaign_interventions').insert({
      campaign_id: campaignId,
      intervention_key: interventionKey,
      name: 'Personalized audit pilot',
      channel: 'email',
      status: 'planned',
      hypothesis: 'A prepared, prospect-branded audit with actionable fixes earns a qualified conversation.',
      meaningful_variable: 'personalized audit-led opening',
      success_condition: 'A qualified reply or full-report open from the bounded pilot.',
      stop_condition: 'Stop after the two-contact pilot if neither recipient replies nor opens the full report.',
      metadata: { owner: 'tamon', one_variable_only: true, bounded_pilot: true },
    }).select('id').single();
    if (error || !inserted?.id) redirect(`${CONSOLE_PATH}?error=intervention_create_failed`);
    interventionId = String(inserted.id);
  }

  const base = buildAuditCampaignContracts().directBusiness;
  const contract = createDraftContract({
    campaignId,
    interventionId,
    interventionKey,
    goal: base.goal,
    sender: resolveCampaignSender(ctx.env as unknown as Record<string, string | undefined>),
    segment,
    content: base.content,
    tracking: base.tracking,
    schedule: { ...base.schedule, dailyCap: 2 },
  });
  const saved = await saveValidatedEmailCampaign(ctx.adminDb, contract);
  if (!saved.ok) redirect(`${CONSOLE_PATH}?error=draft_save_failed`);
  structuredLog('audit_email_campaign_created', { interventionKey, segment }, 'info');
  revalidatePath(CONSOLE_PATH);
  redirect(`${CONSOLE_PATH}/${interventionKey}`);
}

function text(formData: FormData, key: string, fallback = ''): string {
  return String(formData.get(key) ?? '').trim() || fallback;
}

function integer(formData: FormData, key: string, fallback: number): number {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Save a provider CSV into the contact bank without enrolling or sending. Apollo Verified rows
 * are automatically promoted only when the strict Quebec MSP, business-identity, decision-maker,
 * and suppression checks all pass. Every ambiguous row remains held with a machine-readable reason.
 */
export async function importCampaignContactsAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const file = formData.get('file');
  const segment = normalizeSegment(text(formData, 'segment'));
  if (!(file instanceof File) || file.size === 0 || !segment) {
    redirect(`${CONSOLE_PATH}?contactsError=missing_file_or_segment#import-contacts`);
  }
  if (file.size > 5_000_000) {
    redirect(`${CONSOLE_PATH}?contactsError=file_too_large#import-contacts`);
  }

  const csvText = await file.text();
  const parsed = parseContactCsvImport(csvText);
  const tags = text(formData, 'tags')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const sourceFile = file.name.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'contacts.csv';
  const result = await importContacts(ctx.adminDb, parsed.rows, {
    segment,
    tags,
    source: 'provider-csv',
    sourceFile,
    sourceFileSha256: await sha256Hex(csvText),
  });

  let promotionError: string | null = null;
  let promotionPlan: ReturnType<typeof planApolloMspPromotion> | null = null;
  let promotionResult: Awaited<ReturnType<typeof applyApolloMspPromotion>> | null = null;
  if (!result.error) {
    try {
      const [contacts, evidence] = await Promise.all([
        loadApolloPromotionContacts(ctx.adminDb, parsed.rows.map((row) => row.email)),
        loadAudienceEvidence(ctx.adminDb),
      ]);
      promotionPlan = planApolloMspPromotion({ rows: parsed.rows, contacts, evidence });
      promotionResult = await applyApolloMspPromotion(ctx.adminDb, promotionPlan);
      if (promotionResult.errors.length > 0) {
        promotionError = `promotion_failed_for_${String(promotionResult.errors.length)}_contacts`;
      }
    } catch (error) {
      promotionError = error instanceof Error ? error.message : 'apollo_promotion_failed';
    }
  }

  structuredLog('campaign_contacts_imported_and_qualified', {
    segment,
    sourceFile,
    imported: result.imported,
    skippedExisting: result.skippedExisting,
    invalid: parsed.invalid.length,
    providerVerified: promotionPlan?.counts.providerVerified ?? 0,
    eligibleMsp: promotionPlan?.counts.eligibleMsp ?? 0,
    held: promotionPlan?.counts.held ?? parsed.rows.length,
    suppressed: promotionPlan?.counts.suppressed ?? 0,
    converted: promotionPlan?.counts.converted ?? 0,
    terminalPreserved: promotionPlan?.counts.terminalPreserved ?? 0,
    promotionUpdated: promotionResult?.updated ?? 0,
    promotionStale: promotionResult?.stale ?? 0,
    sendState: 'not_enrolled',
  }, result.error || promotionError ? 'warning' : 'info');
  revalidatePath(CONSOLE_PATH);
  revalidatePath('/admin/outreach');
  const error = result.error ?? promotionError;
  redirect(
    `${CONSOLE_PATH}?contactsEligible=${String(promotionPlan?.counts.eligibleMsp ?? 0)}&contactsHeld=${String(promotionPlan?.counts.held ?? parsed.rows.length)}&contactsSuppressed=${String(promotionPlan?.counts.suppressed ?? 0)}&contactsSkipped=${String(result.skippedExisting)}&contactsInvalid=${String(parsed.invalid.length)}${error ? `&contactsError=${encodeURIComponent(error.slice(0, 120))}` : ''}#import-contacts`,
  );
}

/**
 * Create the first draft of an email campaign against an existing growth campaign. The
 * intervention row is the company-wide record; the `email_campaign_v1` payload is the detailed
 * preparation state that hangs off it.
 */
export async function createEmailCampaignAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  const campaignId = text(formData, 'campaignId');
  const name = text(formData, 'name');
  const segment = text(formData, 'segment');
  if (!interventionKey || !campaignId || !name || !segment) {
    redirect(`${CONSOLE_PATH}?error=missing_required_fields`);
  }

  const meaningfulVariable = text(formData, 'meaningfulVariable');
  const successCondition = text(formData, 'successCondition');
  const stopCondition = text(formData, 'stopCondition');

  const { data: existing } = await ctx.adminDb
    .from('growth_campaign_interventions')
    .select('id')
    .eq('intervention_key', interventionKey)
    .maybeSingle();

  let interventionId = existing?.id ? String(existing.id) : null;
  if (!interventionId) {
    const { data: inserted, error } = await ctx.adminDb
      .from('growth_campaign_interventions')
      .insert({
        campaign_id: campaignId,
        intervention_key: interventionKey,
        name,
        channel: 'email',
        status: 'planned',
        hypothesis: text(formData, 'hypothesis', 'Declared before the first send.'),
        meaningful_variable: meaningfulVariable,
        success_condition: successCondition,
        stop_condition: stopCondition,
        metadata: { owner: text(formData, 'owner', 'elena'), one_variable_only: true },
      })
      .select('id')
      .single();
    if (error || !inserted?.id) redirect(`${CONSOLE_PATH}?error=intervention_create_failed`);
    interventionId = String(inserted.id);
  }

  const sender = resolveCampaignSender(ctx.env as unknown as Record<string, string | undefined>);
  const subject = text(formData, 'subject');
  const previewText = text(formData, 'previewText');
  const bodyTemplate = String(formData.get('bodyTemplate') ?? '');

  const contract = createDraftContract({
    campaignId,
    interventionId,
    interventionKey,
    goal: {
      objective: text(formData, 'objective'),
      buyer: text(formData, 'buyer'),
      offerKey: text(formData, 'offerKey'),
      ctaGoal: text(formData, 'ctaGoal'),
      owner: text(formData, 'owner', 'elena'),
      meaningfulVariable,
      successCondition,
      stopCondition,
      closureCondition: text(formData, 'closureCondition'),
      retryPolicy: text(formData, 'retryPolicy', 'Three attempts per step, then stop and record the reason.'),
    },
    sender,
    segment,
    content: {
      templateId: null,
      templateVersion: 1,
      subject,
      previewText,
      bodyFormat: text(formData, 'bodyFormat') === 'html' ? 'html' : 'text',
      bodyTemplate,
    },
    tracking: {
      tags: ['vci-8', 'email'],
      utmSource: 'outreach',
      utmMedium: 'email',
      utmCampaign: interventionKey,
      utmContent: text(formData, 'utmContent', 'agency-reporting'),
      utmTerm: null,
    },
    schedule: {
      timezone: 'America/Toronto',
      sendWindowStartHour: integer(formData, 'sendWindowStartHour', 9),
      sendWindowEndHour: integer(formData, 'sendWindowEndHour', 17),
      startAt: null,
      spacingMinutes: integer(formData, 'spacingMinutes', 60),
      dailyCap: integer(formData, 'dailyCap', 25),
      maxSequenceSteps: 1,
      sequenceDelaysDays: [0],
    },
  });

  const saved = await saveValidatedEmailCampaign(ctx.adminDb, contract);
  if (!saved.ok) redirect(`${CONSOLE_PATH}?error=draft_save_failed`);
  structuredLog('email_campaign_created', { interventionKey, segment }, 'info');
  revalidatePath(CONSOLE_PATH);
  redirect(`${CONSOLE_PATH}/${encodeURIComponent(interventionKey)}`);
}

/**
 * Save composer edits. A locked (scheduled or later) version is never mutated — `applyContractEdit`
 * produces a new draft version instead, so the version that was reviewed and scheduled keeps the
 * exact sender, audience, subject, body, timing, and rules it promised.
 */
export async function saveEmailCampaignDraftAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  if (!interventionKey) return;
  const record = await loadEmailCampaign(ctx.adminDb, interventionKey);
  if (!record) return;

  const sender = resolveCampaignSender(ctx.env as unknown as Record<string, string | undefined>);
  const current = withResolvedSender(record.contract, sender);

  const sequenceStep = Math.max(1, Math.min(
    current.schedule.maxSequenceSteps,
    integer(formData, 'sequenceStep', 1),
  ));
  const selected = sequenceStep === 1
    ? { subject: current.content.subject, previewText: current.content.previewText, bodyTemplate: current.content.bodyTemplate }
    : current.content.followUpSteps[sequenceStep - 2]!;
  const subject = text(formData, 'subject', selected.subject);
  const previewText = text(formData, 'previewText', selected.previewText);
  const bodyTemplate = String(formData.get('bodyTemplate') ?? selected.bodyTemplate);
  const followUpSteps = [...current.content.followUpSteps];
  if (sequenceStep > 1) followUpSteps[sequenceStep - 2] = { subject, previewText, bodyTemplate };
  const nextContent = {
    ...current.content,
    ...(sequenceStep === 1 ? { subject, previewText, bodyTemplate } : {}),
    followUpSteps,
  };
  const requiredMergeFields = extractMergeFields(
    ...allStepContent(nextContent).flatMap((step) => [step.subject, step.previewText, step.bodyTemplate]),
  );
  const startAtRaw = text(formData, 'startAt');

  const edit: ContractEdit = {
    goal: {
      objective: text(formData, 'objective', current.goal.objective),
      buyer: text(formData, 'buyer', current.goal.buyer),
      offerKey: text(formData, 'offerKey', current.goal.offerKey),
      ctaGoal: text(formData, 'ctaGoal', current.goal.ctaGoal),
      owner: text(formData, 'owner', current.goal.owner),
      meaningfulVariable: text(formData, 'meaningfulVariable', current.goal.meaningfulVariable),
      successCondition: text(formData, 'successCondition', current.goal.successCondition),
      stopCondition: text(formData, 'stopCondition', current.goal.stopCondition),
      closureCondition: text(formData, 'closureCondition', current.goal.closureCondition),
      retryPolicy: text(formData, 'retryPolicy', current.goal.retryPolicy),
    },
    content: {
      subject: nextContent.subject,
      previewText: nextContent.previewText,
      bodyFormat: text(formData, 'bodyFormat', current.content.bodyFormat) === 'html' ? 'html' : 'text',
      bodyTemplate: nextContent.bodyTemplate,
      followUpSteps,
      requiredMergeFields,
    },
    schedule: {
      startAt: startAtRaw ? resolveFirstRunAt(startAtRaw, Date.now()) : current.schedule.startAt,
      spacingMinutes: integer(formData, 'spacingMinutes', current.schedule.spacingMinutes),
      dailyCap: integer(formData, 'dailyCap', current.schedule.dailyCap),
      sendWindowStartHour: integer(formData, 'sendWindowStartHour', current.schedule.sendWindowStartHour),
      sendWindowEndHour: integer(formData, 'sendWindowEndHour', current.schedule.sendWindowEndHour),
    },
  };

  const { contract, newVersion } = applyContractEdit(current, edit);
  await saveValidatedEmailCampaign(ctx.adminDb, contract);
  structuredLog('email_campaign_saved', { interventionKey, version: contract.version, newVersion }, 'info');
  revalidatePath(`${CONSOLE_PATH}/${interventionKey}`);
}

/**
 * Deliver one internal test to the configured allowlist. The test never enrols a prospect,
 * advances a sequence, or contributes to campaign metrics — its only lasting effect is evidence
 * bound to this exact version checksum, which the preflight then requires.
 */
export async function sendInternalTestAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  const recipient = text(formData, 'recipient');
  const sequenceStep = integer(formData, 'sequenceStep', 1);
  if (!interventionKey || !recipient) return;

  const env = ctx.env as unknown as Record<string, string | undefined>;
  const detail = await loadEmailCampaignDetail({ supabase: ctx.adminDb, env, interventionKey });
  if (!detail) return;

  await sendInternalTest({
    supabase: ctx.adminDb,
    env,
    contract: detail.contract,
    recipient,
    sampleContact: detail.previewContacts[0] ?? null,
    nowMs: Date.now(),
    sequenceStep,
    save: async (contract) => saveValidatedEmailCampaign(ctx.adminDb, contract),
  });
  revalidatePath(`${CONSOLE_PATH}/${interventionKey}`);
}

/**
 * Schedule. Every gate in the preflight must pass; a failure records the exact failing gates on
 * the contract and writes nothing. A success writes enrollments and staggered prospect rows — it
 * does not send: the existing hourly outreach sweep delivers at each `next_run_at`.
 */
export async function scheduleEmailCampaignAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  if (!interventionKey) return;

  const env = ctx.env as unknown as Record<string, string | undefined>;
  const detail = await loadEmailCampaignDetail({ supabase: ctx.adminDb, env, interventionKey });
  if (!detail) return;

  await scheduleCampaign({
    supabase: ctx.adminDb,
    env,
    contract: detail.contract,
    nowMs: Date.now(),
    save: async (contract) => saveValidatedEmailCampaign(ctx.adminDb, contract),
  });
  revalidatePath(`${CONSOLE_PATH}/${interventionKey}`);
}

/** Stop: disable every enrolled prospect and close the enrollments. No further step can send. */
export async function stopEmailCampaignAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  const reason = text(formData, 'reason', 'operator stopped the campaign');
  if (!interventionKey) return;

  const env = ctx.env as unknown as Record<string, string | undefined>;
  const detail = await loadEmailCampaignDetail({ supabase: ctx.adminDb, env, interventionKey });
  if (!detail?.contract.audience.audienceId) return;

  await stopCampaign({
    supabase: ctx.adminDb,
    contract: detail.contract,
    reason,
    nowMs: Date.now(),
    save: async (contract) => saveValidatedEmailCampaign(ctx.adminDb, contract),
  });
  revalidatePath(`${CONSOLE_PATH}/${interventionKey}`);
}

/**
 * Freeze the recipient list for this version. After this the audience is evidence: a later import
 * into the same segment cannot change who this campaign mails.
 */
export async function freezeEmailCampaignAudienceAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const interventionKey = text(formData, 'interventionKey');
  if (!interventionKey) return;
  const record = await loadEmailCampaign(ctx.adminDb, interventionKey);
  if (!record) return;

  const sender = resolveCampaignSender(ctx.env as unknown as Record<string, string | undefined>);
  const current = withResolvedSender(record.contract, sender);
  if (current.audience.audienceId) return; // already frozen for this version

  const [candidates, evidence] = await Promise.all([
    loadAudienceCandidates(ctx.adminDb, current.audience.segment),
    loadAudienceEvidence(ctx.adminDb),
  ]);
  const limit = integer(formData, 'recipientCap', current.schedule.dailyCap);
  const selection = selectCampaignAudience({ candidates, evidence, limit });

  const frozen = await freezeCampaignAudience({
    supabase: ctx.adminDb,
    campaignId: current.campaignId,
    interventionId: current.interventionId,
    interventionKey,
    campaignVersion: current.version,
    sourceSegment: current.audience.segment,
    selection,
    selectionReason: text(
      formData,
      'selectionReason',
      `${String(selection.members.length)} strongest eligible contacts in ${current.audience.segment}`,
    ),
  });
  if (!frozen.ok) return;

  const { contract } = applyContractEdit(current, {
    audience: {
      audienceId: frozen.audience.id,
      checksum: frozen.audience.checksum,
      recipientCount: frozen.audience.recipientCount,
      frozenAt: new Date().toISOString(),
      excludedCounts: selection.excludedCounts as Record<string, number>,
    },
    state: current.state === 'draft' ? 'audience_ready' : current.state,
  });
  await saveValidatedEmailCampaign(ctx.adminDb, contract);
  structuredLog('email_campaign_audience_frozen', {
    interventionKey,
    version: contract.version,
    recipients: frozen.audience.recipientCount,
  }, 'info');
  revalidatePath(`${CONSOLE_PATH}/${interventionKey}`);
}
