'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { resolveFirstRunAt } from '@/lib/server/montreal-time';
import {
  applyContractEdit,
  createDraftContract,
  extractMergeFields,
  type ContractEdit,
} from '@/lib/server/email-campaign-contract';
import { loadEmailCampaign, saveValidatedEmailCampaign } from '@/lib/server/email-campaign-store';
import { resolveCampaignSender } from '@/lib/server/email-campaign-sender';
import { withResolvedSender } from '@/lib/server/email-campaign-console';
import {
  freezeCampaignAudience,
  loadAudienceCandidates,
  loadAudienceEvidence,
  selectCampaignAudience,
} from '@/lib/server/campaign-audience';
import { structuredLog } from '@/lib/server/structured-log';

const CONSOLE_PATH = '/admin/campaigns/email';

function text(formData: FormData, key: string, fallback = ''): string {
  return String(formData.get(key) ?? '').trim() || fallback;
}

function integer(formData: FormData, key: string, fallback: number): number {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
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
  if (!interventionKey || !campaignId || !name || !segment) return;

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
    if (error || !inserted?.id) return;
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
      maxSequenceSteps: 3,
      sequenceDelaysDays: [0, 4, 10],
    },
  });

  await saveValidatedEmailCampaign(ctx.adminDb, contract);
  structuredLog('email_campaign_created', { interventionKey, segment }, 'info');
  revalidatePath(CONSOLE_PATH);
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

  const subject = text(formData, 'subject', current.content.subject);
  const previewText = text(formData, 'previewText', current.content.previewText);
  const bodyTemplate = String(formData.get('bodyTemplate') ?? current.content.bodyTemplate);
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
      subject,
      previewText,
      bodyFormat: text(formData, 'bodyFormat', current.content.bodyFormat) === 'html' ? 'html' : 'text',
      bodyTemplate,
      requiredMergeFields: extractMergeFields(subject, previewText, bodyTemplate),
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
