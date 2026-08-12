'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { listBrevoContacts, toContactProjection } from '@/lib/connectors/providers/brevo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBrevoConnectorRepository } from '@/lib/server/brevo-connector-repository';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

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
