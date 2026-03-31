'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { importPlaybookDrafts } from '@/lib/server/content-draft-import';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';
import { resolveContentDestinationAdapter } from '@/lib/server/content-destination-adapters';
import { evaluateContentDestinationHealth } from '@/lib/server/content-destination-health';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

export async function updateContentDestinationConfig(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const destinationId = String(formData.get('destinationId') ?? '').trim();
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  const availabilityStatus = String(formData.get('availabilityStatus') ?? '').trim();
  const availabilityReason = String(formData.get('availabilityReason') ?? '').trim();

  if (!destinationId) {
    throw new Error('Missing destination id.');
  }

  const allowedAvailabilityStatuses = new Set([
    'available',
    'not_configured',
    'plan_blocked',
    'api_unavailable',
    'disabled',
  ]);

  if (!allowedAvailabilityStatuses.has(availabilityStatus)) {
    throw new Error('Invalid availability status.');
  }

  const { error } = await actionContext.adminDb
    .from('content_distribution_destinations')
    .update({
      enabled,
      availability_status: availabilityStatus,
      availability_reason: availabilityReason || null,
      is_default: false,
    })
    .eq('id', destinationId);

  if (error) {
    throw error;
  }

  revalidatePath('/dashboard/content');
}

export async function importContentMachineDrafts() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  await importPlaybookDrafts(actionContext.adminDb, actionContext.user.id);
  revalidatePath('/dashboard/content');
}

export async function updateContentItem(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const contentId = String(formData.get('contentId') ?? '').trim();
  if (!contentId) {
    throw new Error('Missing content id.');
  }

  const title = String(formData.get('title') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const targetPersona = String(formData.get('targetPersona') ?? '').trim();
  const primaryProblem = String(formData.get('primaryProblem') ?? '').trim();
  const topicCluster = String(formData.get('topicCluster') ?? '').trim();
  const canonicalUrl = String(formData.get('canonicalUrl') ?? '').trim();
  const briefMarkdown = String(formData.get('briefMarkdown') ?? '');
  const draftMarkdown = String(formData.get('draftMarkdown') ?? '');

  const allowedStatuses = new Set([
    'idea',
    'brief',
    'draft',
    'review',
    'approved',
    'published',
    'archived',
  ]);

  if (!title || !slug) {
    throw new Error('Title and slug are required.');
  }

  if (!allowedStatuses.has(status)) {
    throw new Error('Invalid content status.');
  }

  const { error } = await actionContext.adminDb
    .from('content_items')
    .update({
      title,
      slug,
      status,
      target_persona: targetPersona || null,
      primary_problem: primaryProblem || null,
      topic_cluster: topicCluster || null,
      canonical_url: canonicalUrl || null,
      brief_markdown: briefMarkdown || null,
      draft_markdown: draftMarkdown || null,
    })
    .eq('content_id', contentId);

  if (error) {
    throw error;
  }

  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${contentId}`);
}

export async function pushContentItemToDestination(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const contentId = String(formData.get('contentId') ?? '').trim();
  const destinationId = String(formData.get('destinationId') ?? '').trim();

  if (!contentId || !destinationId) {
    throw new Error('Missing content item or destination.');
  }

  const [env, item, destination] = await Promise.all([
    getPaymentApiEnv(),
    createContentAdminData(actionContext.adminDb).getContentItemDetail(contentId),
    createContentDestinationAdminData(actionContext.adminDb).getDestinationById(destinationId),
  ]);

  if (!item) {
    throw new Error('Content item not found.');
  }

  if (!destination) {
    throw new Error('Destination not found.');
  }

  if (!destination.enabled) {
    throw new Error('Destination is disabled.');
  }

  if (!destination.supports_api_publish) {
    throw new Error('Destination does not support API publishing.');
  }

  const destinationHealth = evaluateContentDestinationHealth(destination, env);
  if (!destinationHealth.readyToPush) {
    structuredLog(
      'content_destination_push_blocked',
      {
        content_id: item.content_id,
        content_status: item.status,
        destination_key: destination.destination_key,
        destination_type: destination.destination_type,
        provider_name: destination.provider_name,
        availability_status: destinationHealth.availabilityStatus,
        availability_reason: destinationHealth.availabilityReason,
      },
      'warning'
    );
    throw new Error(
      destinationHealth.availabilityReason ?? 'Destination is not ready for draft pushes.'
    );
  }

  structuredLog(
    'content_destination_push_started',
    {
      content_id: item.content_id,
      content_status: item.status,
      destination_key: destination.destination_key,
      destination_type: destination.destination_type,
      provider_name: destination.provider_name,
    },
    'info'
  );

  try {
    const adapter = resolveContentDestinationAdapter(destination);
    const result = await adapter.publishDraft({
      item,
      destination,
      env,
    });

    const { error } = await actionContext.adminDb.from('content_distribution_deliveries').insert({
      content_item_id: item.id,
      destination_type: destination.destination_type,
      destination_name: destination.provider_name,
      status: result.status,
      destination_post_id: result.providerPublicationId,
      destination_url: result.destinationUrl,
      metadata: result.metadata,
      published_at: result.status === 'published' ? new Date().toISOString() : null,
    });

    if (error) {
      throw error;
    }

    structuredLog(
      'content_destination_push_succeeded',
      {
        content_id: item.content_id,
        content_status: item.status,
        destination_key: destination.destination_key,
        destination_type: destination.destination_type,
        provider_name: destination.provider_name,
        delivery_status: result.status,
        provider_publication_id: result.providerPublicationId,
      },
      'info'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown push failure';
    structuredError('content_destination_push_failed', {
      content_id: item.content_id,
      content_status: item.status,
      destination_key: destination.destination_key,
      destination_type: destination.destination_type,
      provider_name: destination.provider_name,
      message,
    });
    throw error;
  }

  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${contentId}`);
  revalidatePath('/dashboard/logs');
}
