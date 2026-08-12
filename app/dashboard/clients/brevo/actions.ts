'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  BREVO_SCOPES,
  BrevoApiError,
  getBrevoContact,
  listBrevoContacts,
  sendBrevoTransactionalEmail,
  syncBrevoReportProjection,
  toContactProjection,
} from '@/lib/connectors/providers/brevo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBrevoConnectorRepository } from '@/lib/server/brevo-connector-repository';
import { structuredError, structuredLog } from '@/lib/server/structured-log';
import { ensureAgencyClientBuyerIntelligenceSnapshot } from '@/lib/server/buyer-intelligence-snapshot-assembly';
import { createSupabaseBuyerIntelligenceGenerationRepository } from '@/lib/server/buyer-intelligence-generation-repository';
import { issueBuyerIntelligenceShareCapability } from '@/lib/server/buyer-intelligence-share-capability';
import { createBrevoReportDeliveryRepository } from '@/lib/server/brevo-report-delivery';
import { ctaButton, emailShell, escapeEmailHtml } from '@/lib/server/email-theme';

const contextSchema = z.object({ agencyAccountId: z.string().uuid() });

async function authorizedContext(agencyAccountId: string) {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/clients/brevo');
  const workspace = await loadCurrentAgencyWorkspace({ userId: user.id, supabase: session, selectedAccountId: agencyAccountId });
  if (!workspace || workspace.data.selectedAccountId !== agencyAccountId) return null;
  const { data: membership } = await workspace.admin.from('agency_users').select('role')
    .eq('agency_account_id', agencyAccountId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!membership || membership.role === 'viewer') return null;
  return { workspace, user };
}

export async function disconnectBrevoAction(formData: FormData): Promise<void> {
  const parsed = contextSchema.safeParse({ agencyAccountId: formData.get('agencyAccountId') });
  if (!parsed.success) return;
  const context = await authorizedContext(parsed.data.agencyAccountId);
  if (!context) return;
  await createBrevoConnectorRepository(context.workspace.admin).disconnect(parsed.data.agencyAccountId);
  structuredLog('brevo_connector_disconnected', {
    agency_account_id: parsed.data.agencyAccountId, user_id: context.user.id,
  });
  revalidatePath('/dashboard/clients/brevo');
  redirect(`/dashboard/clients/brevo?agencyAccount=${parsed.data.agencyAccountId}&brevo=disconnected`);
}

export async function createBrevoHeldBatchAction(formData: FormData): Promise<void> {
  const selectedValues = formData.getAll('providerContactId');
  const accountOnly = contextSchema.safeParse({ agencyAccountId: formData.get('agencyAccountId') });
  if (accountOnly.success && (selectedValues.length < 1 || selectedValues.length > 10)) {
    redirect(`/dashboard/clients/brevo?agencyAccount=${accountOnly.data.agencyAccountId}&brevo=selection-invalid`);
  }
  const parsed = z.object({
    agencyAccountId: z.string().uuid(), connectorAccountId: z.string().uuid(),
    listId: z.string().trim().min(1).max(80), offset: z.coerce.number().int().min(0).max(100_000),
    providerContactIds: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  }).safeParse({
    agencyAccountId: formData.get('agencyAccountId'),
    connectorAccountId: formData.get('connectorAccountId'),
    listId: formData.get('listId'), offset: formData.get('offset') ?? 0,
    providerContactIds: selectedValues,
  });
  if (!parsed.success) return;
  const context = await authorizedContext(parsed.data.agencyAccountId);
  if (!context) return;
  const env = await getScanApiEnv();
  if (!env.BREVO_OAUTH_CLIENT_ID || !env.BREVO_OAUTH_CLIENT_SECRET || !env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY) {
    redirect(`/dashboard/clients/brevo?agencyAccount=${parsed.data.agencyAccountId}&brevo=configuration-error`);
  }
  const repository = createBrevoConnectorRepository(context.workspace.admin);
  let createdBatchId = '';
  try {
    const token = await repository.accessToken({
      agencyAccountId: parsed.data.agencyAccountId,
      clientId: env.BREVO_OAUTH_CLIENT_ID,
      clientSecret: env.BREVO_OAUTH_CLIENT_SECRET,
      encryptionKey: env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
    });
    if (token.account.accountId !== parsed.data.connectorAccountId) throw new Error('brevo_connector_mismatch');
    const page = await listBrevoContacts({
      accessToken: token.accessToken, listId: parsed.data.listId, offset: parsed.data.offset,
    });
    const selectedIds = new Set(parsed.data.providerContactIds);
    const candidates = page.contacts.filter((contact) => selectedIds.has(contact.providerContactId));
    if (candidates.length !== selectedIds.size) throw new Error('brevo_contact_page_changed');
    const contacts = candidates.map((candidate) => toContactProjection({
      accountId: token.account.accountId, agencyAccountId: parsed.data.agencyAccountId, candidate,
    }));
    createdBatchId = await repository.createHeldBatch({
      agencyAccountId: parsed.data.agencyAccountId,
      connectorAccountId: token.account.accountId,
      userId: context.user.id,
      contacts,
    });
    structuredLog('brevo_held_batch_created', {
      agency_account_id: parsed.data.agencyAccountId, batch_id: createdBatchId,
      contact_count: contacts.length, user_id: context.user.id,
    });
  } catch (error) {
    structuredError('brevo_held_batch_failed', {
      agency_account_id: parsed.data.agencyAccountId,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    redirect(`/dashboard/clients/brevo?agencyAccount=${parsed.data.agencyAccountId}&brevo=batch-failed`);
  }
  if (createdBatchId) {
    revalidatePath('/dashboard/clients/brevo');
    redirect(`/dashboard/clients/brevo?agencyAccount=${parsed.data.agencyAccountId}&brevo=batch-held`);
  }
}

export async function prepareBrevoProspectPreviewAction(formData: FormData): Promise<void> {
  const parsed = z.object({
    agencyAccountId: z.string().uuid(), batchId: z.string().uuid(),
    providerContactId: z.string().trim().min(1).max(80),
  }).safeParse({
    agencyAccountId: formData.get('agencyAccountId'), batchId: formData.get('batchId'),
    providerContactId: formData.get('providerContactId'),
  });
  if (!parsed.success) return;
  const context = await authorizedContext(parsed.data.agencyAccountId);
  if (!context) return;
  const repository = createBrevoConnectorRepository(context.workspace.admin);
  let previewPath = '';
  try {
    const contact = await repository.loadHeldContact(parsed.data);
    if (!contact) throw new Error('brevo_held_contact_not_found');
    const { data: client } = await context.workspace.admin.from('agency_clients')
      .select('id,canonical_domain').eq('agency_account_id', parsed.data.agencyAccountId)
      .eq('canonical_domain', contact.canonicalDomain).eq('status', 'active').maybeSingle();
    if (!client?.id || client.canonical_domain !== contact.canonicalDomain) {
      throw new Error('brevo_prospect_client_not_ready');
    }
    const result = await ensureAgencyClientBuyerIntelligenceSnapshot({
      supabase: context.workspace.admin as never,
      agencyAccountId: parsed.data.agencyAccountId,
      agencyClientId: String(client.id),
      canonicalDomain: contact.canonicalDomain,
    });
    structuredLog('brevo_prospect_preview_prepared', {
      agency_account_id: parsed.data.agencyAccountId, batch_id: parsed.data.batchId,
      provider_contact_id: parsed.data.providerContactId, agency_client_id: String(client.id),
      snapshot_id: result.snapshot.snapshotId, created: result.created, user_id: context.user.id,
    });
    previewPath = `/dashboard/clients/${client.id}/buyer-intelligence?agencyAccount=${parsed.data.agencyAccountId}&snapshot=${encodeURIComponent(result.snapshot.snapshotId)}&view=prospect_preview&batch=${parsed.data.batchId}&contact=${encodeURIComponent(parsed.data.providerContactId)}`;
  } catch (error) {
    structuredError('brevo_prospect_preview_failed', {
      agency_account_id: parsed.data.agencyAccountId, batch_id: parsed.data.batchId,
      provider_contact_id: parsed.data.providerContactId,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    redirect(`/dashboard/clients/brevo?agencyAccount=${parsed.data.agencyAccountId}&brevo=preview-failed`);
  }
  redirect(previewPath);
}

const deliverySchema = z.object({
  agencyAccountId: z.string().uuid(), agencyClientId: z.string().uuid(), batchId: z.string().uuid(),
  providerContactId: z.string().trim().min(1).max(80), generationId: z.string().uuid(),
});

function partnerAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function deliveryRedirect(input: z.infer<typeof deliverySchema>, status: string): string {
  return `/dashboard/clients/${input.agencyClientId}/buyer-intelligence?agencyAccount=${input.agencyAccountId}&view=prospect_preview&batch=${input.batchId}&contact=${encodeURIComponent(input.providerContactId)}&brevoDelivery=${status}`;
}

function senderAddress(raw: string | undefined): { email: string; name: string } | null {
  const value = raw?.trim() ?? '';
  const bracket = value.match(/^(.*?)\s*<([^>]+)>$/);
  const email = (bracket?.[2] ?? value).trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return null;
  return { email, name: bracket?.[1]?.trim() || 'GEO-Pulse' };
}

async function deliveryContext(formData: FormData) {
  const parsed = deliverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return null;
  const auth = await authorizedContext(parsed.data.agencyAccountId);
  if (!auth) return null;
  const connector = createBrevoConnectorRepository(auth.workspace.admin);
  const [contact, generation, connection, clientResult] = await Promise.all([
    connector.loadHeldContact({ agencyAccountId: parsed.data.agencyAccountId, batchId: parsed.data.batchId, providerContactId: parsed.data.providerContactId }),
    createSupabaseBuyerIntelligenceGenerationRepository(auth.workspace.admin).load(
      parsed.data.generationId, parsed.data.agencyAccountId, parsed.data.agencyClientId,
    ),
    connector.load(parsed.data.agencyAccountId),
    auth.workspace.admin.from('agency_clients').select('id,canonical_domain,status').eq('id', parsed.data.agencyClientId)
      .eq('agency_account_id', parsed.data.agencyAccountId).maybeSingle(),
  ]);
  const client = clientResult.data;
  if (!contact || !generation || generation.status !== 'succeeded' || generation.viewKind !== 'prospect_preview'
    || !connection || connection.account.status !== 'connected' || !client || client.status !== 'active'
    || client.canonical_domain !== contact.canonicalDomain) return null;
  return { input: parsed.data, auth, connector, contact, generation, connection };
}

export async function syncBrevoReportAction(formData: FormData): Promise<void> {
  const context = await deliveryContext(formData);
  if (!context) return;
  const env = await getScanApiEnv();
  const allowed = partnerAllowlist(env.BREVO_PARTNER_TEST_RECIPIENTS);
  if (allowed.size !== 1 || !allowed.has(context.contact.email.toLowerCase())) {
    redirect(deliveryRedirect(context.input, 'allowlist-failed'));
  }
  if (BREVO_SCOPES.some((scope) => !context.connection.account.scopes.includes(scope))) {
    redirect(deliveryRedirect(context.input, 'reconnect-required'));
  }
  if (!env.AUDIT_REPORT_CAPABILITY_SECRET || !env.NEXT_PUBLIC_APP_URL || !env.BREVO_OAUTH_CLIENT_ID
    || !env.BREVO_OAUTH_CLIENT_SECRET || !env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY) {
    redirect(deliveryRedirect(context.input, 'configuration-error'));
  }
  const issuedAt = Date.parse(context.generation.completedAt ?? context.generation.createdAt);
  const token = issueBuyerIntelligenceShareCapability({
    secret: env.AUDIT_REPORT_CAPABILITY_SECRET, nowMs: issuedAt,
    expiresAtMs: issuedAt + 90 * 24 * 60 * 60 * 1000,
    generationId: context.generation.id, agencyAccountId: context.input.agencyAccountId,
    agencyClientId: context.input.agencyClientId, providerContactId: context.input.providerContactId,
    recipientEmail: context.contact.email, recipientFirstName: context.contact.firstName || 'Uzziel',
    recipientCompany: context.contact.companyName, domain: context.contact.canonicalDomain,
  });
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const reportUrl = `${appUrl}/api/buyer-intelligence/share/${encodeURIComponent(token)}`;
  const thumbnailUrl = `${appUrl}/api/buyer-intelligence/thumbnail/${encodeURIComponent(token)}`;
  const deliveries = createBrevoReportDeliveryRepository(context.auth.workspace.admin);
  let delivery = await deliveries.prepare({
    agencyAccountId: context.input.agencyAccountId, connectorAccountId: context.connection.account.accountId,
    batchId: context.input.batchId, providerContactId: context.input.providerContactId,
    generationId: context.input.generationId, reportUrl, thumbnailUrl,
    recipientEmail: context.contact.email, userId: context.auth.user.id,
  });
  if (delivery.status === 'delivered' || delivery.status === 'synced') {
    redirect(deliveryRedirect(context.input, delivery.status));
  }
  try {
    const tokenResult = await context.connector.accessToken({
      agencyAccountId: context.input.agencyAccountId, clientId: env.BREVO_OAUTH_CLIENT_ID,
      clientSecret: env.BREVO_OAUTH_CLIENT_SECRET, encryptionKey: env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
    });
    await syncBrevoReportProjection({
      accessToken: tokenResult.accessToken, providerContactId: context.input.providerContactId,
      reportUrl: delivery.reportUrl, thumbnailUrl: delivery.thumbnailUrl,
      generatedAt: context.generation.completedAt ?? context.generation.createdAt,
    });
    delivery = await deliveries.markSynced(delivery.id, context.input.agencyAccountId) ?? delivery;
    structuredLog('brevo_report_projection_synced', { delivery_id: delivery.id, provider_contact_id: context.input.providerContactId });
  } catch (error) {
    structuredError('brevo_report_projection_failed', { delivery_id: delivery.id, error_message: error instanceof Error ? error.message : 'unknown' });
    redirect(deliveryRedirect(context.input, 'sync-failed'));
  }
  revalidatePath(`/dashboard/clients/${context.input.agencyClientId}/buyer-intelligence`);
  redirect(deliveryRedirect(context.input, 'synced'));
}

export async function sendBrevoReportCanaryAction(formData: FormData): Promise<void> {
  const context = await deliveryContext(formData);
  if (!context) return;
  const env = await getScanApiEnv();
  const allowed = partnerAllowlist(env.BREVO_PARTNER_TEST_RECIPIENTS);
  if (allowed.size !== 1 || !allowed.has(context.contact.email.toLowerCase())) {
    redirect(deliveryRedirect(context.input, 'allowlist-failed'));
  }
  const sender = senderAddress(env.GEOPULSE_CAMPAIGN_FROM_EMAIL) ?? { email: 'reports@getgeopulse.com', name: 'GEO-Pulse' };
  if (!env.BREVO_OAUTH_CLIENT_ID || !env.BREVO_OAUTH_CLIENT_SECRET || !env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY) {
    redirect(deliveryRedirect(context.input, 'configuration-error'));
  }
  const deliveries = createBrevoReportDeliveryRepository(context.auth.workspace.admin);
  const delivery = await deliveries.load({ agencyAccountId: context.input.agencyAccountId, batchId: context.input.batchId,
    providerContactId: context.input.providerContactId, generationId: context.input.generationId });
  if (!delivery || !['synced', 'failed'].includes(delivery.status)) {
    redirect(deliveryRedirect(context.input, delivery?.status ?? 'sync-required'));
  }
  const tokenResult = await context.connector.accessToken({
    agencyAccountId: context.input.agencyAccountId, clientId: env.BREVO_OAUTH_CLIENT_ID,
    clientSecret: env.BREVO_OAUTH_CLIENT_SECRET, encryptionKey: env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
  });
  const fresh = await getBrevoContact({
    accessToken: tokenResult.accessToken, providerContactId: context.input.providerContactId,
    selectedListId: context.contact.sourceListIds[0] ?? '',
  });
  if (fresh.email !== context.contact.email.toLowerCase() || fresh.suppressionState !== 'eligible' || fresh.selectionBlockReason) {
    redirect(deliveryRedirect(context.input, 'suppressed'));
  }
  const claimed = await deliveries.claimSend(delivery);
  if (!claimed) redirect(deliveryRedirect(context.input, 'duplicate-blocked'));
  const firstName = context.contact.firstName?.trim() || 'Uzziel';
  const html = emailShell({
    kicker: 'Your private buyer-intelligence report', sender: 'elena', mastheadNote: 'Prepared for Alie',
    previewText: `A private, actionable report for ${context.contact.companyName}.`,
    bodyHtml: [
      `<p style="margin:0 0 16px;">Hello ${escapeEmailHtml(firstName)},</p>`,
      `<p style="margin:0 0 16px;">We prepared a private buyer-intelligence report for <strong>${escapeEmailHtml(context.contact.companyName)}</strong>.</p>`,
      `<a href="${delivery.reportUrl}" style="display:block;text-decoration:none;"><img src="${delivery.thumbnailUrl}" width="536" alt="Preview of the report prepared for ${escapeEmailHtml(context.contact.companyName)}" style="display:block;width:100%;max-width:536px;height:auto;border:1px solid #E5E9E9;border-radius:8px;" /></a>`,
      '<p style="margin:18px 0 8px;font-weight:700;">Inside the report:</p>',
      '<ul style="margin:0 0 16px;padding-left:22px;"><li>What AI buyers can and cannot verify about your business</li><li>The evidence behind each finding</li><li>Prioritized fixes your team can assign and verify</li></ul>',
      ctaButton('Open the private report', delivery.reportUrl),
      '<p style="margin:0;color:#586162;font-size:13px;">This link opens the report in your browser. You can download the PDF from there.</p>',
    ].join(''),
    signoff: 'Regards,', confidentialityNotice: true,
  });
  try {
    const messageId = await sendBrevoTransactionalEmail({
      accessToken: tokenResult.accessToken, sender,
      ...(env.GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL ? { replyTo: { email: env.GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL, name: 'GEO-Pulse team' } } : {}),
      recipient: { email: context.contact.email, name: `${firstName} ${context.contact.companyName}` },
      subject: `${firstName}, your ${context.contact.companyName} buyer-intelligence report is ready`, htmlContent: html,
    });
    await deliveries.markDelivered(claimed.id, context.input.agencyAccountId, messageId);
    structuredLog('brevo_report_canary_delivered', { delivery_id: claimed.id, provider_message_id: messageId, recipient: context.contact.email });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'brevo_send_unknown';
    if (error instanceof BrevoApiError && error.status < 500) await deliveries.markFailed(claimed.id, context.input.agencyAccountId, code);
    else await deliveries.markUncertain(claimed.id, context.input.agencyAccountId, code);
    structuredError('brevo_report_canary_failed', { delivery_id: claimed.id, error_message: code });
    redirect(deliveryRedirect(context.input, error instanceof BrevoApiError && error.status < 500 ? 'send-failed' : 'send-uncertain'));
  }
  revalidatePath(`/dashboard/clients/${context.input.agencyClientId}/buyer-intelligence`);
  redirect(deliveryRedirect(context.input, 'delivered'));
}
