'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { importPlaybookDrafts } from '@/lib/server/content-draft-import';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { assertEditorialReadyForLaunch } from '@/lib/server/content-editorial-readiness';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';
import { resolveContentDestinationAdapter } from '@/lib/server/content-destination-adapters';
import { evaluateContentDestinationHealth } from '@/lib/server/content-destination-health';
import { mergeArticleMetadata } from '@/lib/server/content-article-metadata';
import { appendContentPublishCheckSnapshot } from '@/lib/server/content-publish-check-history';
import { seedTopicPageItems } from '@/lib/server/content-topic-page-admin';
import { seedTopicRegistryBatch } from '@/lib/server/content-topic-registry-seed';
import { evaluateContentPublishChecks, prepareContentForPublish } from '@/lib/server/content-publishing';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

function mergeTopicPageMetadata(
  metadata: Record<string, unknown>,
  fields: {
    readonly definition: string;
    readonly whyItMatters: string;
    readonly practicalTakeaway: string;
  }
): Record<string, unknown> {
  const next = { ...metadata };

  if (fields.definition.trim()) next['topic_page_definition'] = fields.definition.trim();
  else delete next['topic_page_definition'];

  if (fields.whyItMatters.trim()) next['topic_page_why_it_matters'] = fields.whyItMatters.trim();
  else delete next['topic_page_why_it_matters'];

  if (fields.practicalTakeaway.trim()) {
    next['topic_page_practical_takeaway'] = fields.practicalTakeaway.trim();
  } else {
    delete next['topic_page_practical_takeaway'];
  }

  return next;
}

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

export async function seedTopicPagesFromClusters() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const result = await seedTopicPageItems(actionContext.adminDb, actionContext.user.id);
  revalidatePath('/dashboard/content');
  revalidatePath('/blog');
  for (const topicKey of result.topicKeys) {
    revalidatePath(`/blog/topic/${topicKey}`);
  }
}

export async function seedTopicRegistryBatchOne() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  await seedTopicRegistryBatch(actionContext.adminDb, 'batch_1', actionContext.user.id);
  revalidatePath('/dashboard/content');
}

export async function seedTopicRegistryBatchTwo() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  await seedTopicRegistryBatch(actionContext.adminDb, 'batch_2', actionContext.user.id);
  revalidatePath('/dashboard/content');
}

export async function seedTopicRegistryBatchThree() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  await seedTopicRegistryBatch(actionContext.adminDb, 'batch_3', actionContext.user.id);
  revalidatePath('/dashboard/content');
}

export async function updateContentQueueAssignment(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const contentId = String(formData.get('contentId') ?? '').trim();
  const queueOwner = String(formData.get('queueOwner') ?? '').trim();
  const queueTargetWeek = String(formData.get('queueTargetWeek') ?? '').trim();

  if (!contentId) {
    throw new Error('Missing content id.');
  }

  const existingItem = await createContentAdminData(actionContext.adminDb).getContentItemDetail(contentId);
  if (!existingItem) {
    throw new Error('Content item not found.');
  }

  const metadata = { ...(existingItem.metadata ?? {}) };
  if (queueOwner) metadata['queue_owner'] = queueOwner;
  else delete metadata['queue_owner'];

  if (queueTargetWeek) metadata['queue_target_week'] = queueTargetWeek;
  else delete metadata['queue_target_week'];

  const { error } = await actionContext.adminDb
    .from('content_items')
    .update({ metadata })
    .eq('content_id', contentId);

  if (error) throw error;

  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${contentId}`);
}

type QueueStatus = 'brief' | 'draft' | 'review' | 'approved';

function readQueueStatus(value: FormDataEntryValue | null): QueueStatus | null {
  const text = String(value ?? '').trim();
  if (text === 'brief' || text === 'draft' || text === 'review' || text === 'approved') {
    return text;
  }
  return null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

export async function bulkAdvanceContentQueueStatus(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const fromStatus = readQueueStatus(formData.get('fromStatus'));
  const toStatus = readQueueStatus(formData.get('toStatus'));
  const queueOwner = String(formData.get('queueOwner') ?? '').trim().toLowerCase();
  const queueWeek = String(formData.get('queueWeek') ?? '').trim();
  const maxItemsRaw = Number.parseInt(String(formData.get('maxItems') ?? '25'), 10);
  const maxItems = Number.isFinite(maxItemsRaw)
    ? Math.max(1, Math.min(maxItemsRaw, 100))
    : 25;

  const allowedTransitions = new Set(['brief:draft', 'draft:review', 'review:approved']);
  const transitionKey = `${fromStatus ?? ''}:${toStatus ?? ''}`;
  if (!allowedTransitions.has(transitionKey)) {
    throw new Error('Invalid queue transition.');
  }

  const { data, error } = await actionContext.adminDb
    .from('content_items')
    .select('content_id,status,metadata')
    .eq('content_type', 'article')
    .eq('status', fromStatus)
    .order('updated_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const rows = ((data ?? []) as Array<{
    content_id?: unknown;
    status?: unknown;
    metadata?: unknown;
  }>)
    .map((row) => ({
      content_id: typeof row.content_id === 'string' ? row.content_id : '',
      status: typeof row.status === 'string' ? row.status : '',
      metadata:
        typeof row.metadata === 'object' && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
    }))
    .filter((row) => row.content_id);

  const filteredRows = rows.filter((row) => {
    if (queueOwner) {
      const owner = readMetadataString(row.metadata, 'queue_owner')?.toLowerCase() ?? '';
      if (!owner.includes(queueOwner)) return false;
    }
    if (queueWeek) {
      const week = readMetadataString(row.metadata, 'queue_target_week') ?? '';
      if (week !== queueWeek) return false;
    }
    return true;
  });

  const targets = filteredRows.slice(0, maxItems);
  for (const row of targets) {
    const { error: updateError } = await actionContext.adminDb
      .from('content_items')
      .update({ status: toStatus })
      .eq('content_id', row.content_id);
    if (updateError) throw updateError;
  }

  revalidatePath('/dashboard/content');
}

export async function publishApprovedBlogWave(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const queueOwner = String(formData.get('queueOwner') ?? '').trim().toLowerCase();
  const queueWeek = String(formData.get('queueWeek') ?? '').trim();
  const maxItemsRaw = Number.parseInt(String(formData.get('maxItems') ?? '25'), 10);
  const maxItems = Number.isFinite(maxItemsRaw)
    ? Math.max(1, Math.min(maxItemsRaw, 100))
    : 25;

  const { data, error } = await actionContext.adminDb
    .from('content_items')
    .select(
      'content_id,slug,title,status,content_type,topic_cluster,cta_goal,source_type,source_links,draft_markdown,canonical_url,metadata,published_at,updated_at'
    )
    .eq('content_type', 'article')
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  const candidates = ((data ?? []) as Array<{
    content_id: string;
    slug: string | null;
    title: string | null;
    status: string | null;
    content_type: string;
    cta_goal: string | null;
    source_type: string | null;
    source_links: string[] | null;
    draft_markdown: string | null;
    canonical_url: string | null;
    metadata: Record<string, unknown> | null;
    published_at: string | null;
    updated_at: string | null;
    topic_cluster: string | null;
  }>).filter((row) => {
    if (queueOwner) {
      const owner =
        typeof row.metadata?.['queue_owner'] === 'string'
          ? String(row.metadata?.['queue_owner']).toLowerCase()
          : '';
      if (!owner.includes(queueOwner)) return false;
    }
    if (queueWeek) {
      const week =
        typeof row.metadata?.['queue_target_week'] === 'string'
          ? String(row.metadata?.['queue_target_week'])
          : '';
      if (week !== queueWeek) return false;
    }
    return true;
  });

  const selected = candidates.slice(0, maxItems);
  for (const row of selected) {
    try {
      const publishChecks = evaluateContentPublishChecks({
        content_type: row.content_type,
        slug: row.slug,
        title: row.title,
        status: row.status,
        topic_cluster: row.topic_cluster,
        cta_goal: row.cta_goal,
        source_type: row.source_type,
        source_links: Array.isArray(row.source_links) ? row.source_links : [],
        draft_markdown: row.draft_markdown,
        canonical_url: row.canonical_url,
        metadata: row.metadata,
        published_at: row.published_at,
        updated_at: row.updated_at,
      });
      const metadataWithSnapshot = appendContentPublishCheckSnapshot(row.metadata, publishChecks);

      assertEditorialReadyForLaunch({
        title: row.title ?? '',
        draftMarkdown: row.draft_markdown,
        sourceLinks: Array.isArray(row.source_links) ? row.source_links : [],
        ctaGoal: row.cta_goal,
      });

      const publishFields = prepareContentForPublish({
        content_type: row.content_type,
        slug: row.slug,
        title: row.title,
        status: row.status,
        topic_cluster: row.topic_cluster,
        cta_goal: row.cta_goal,
        source_type: row.source_type,
        source_links: Array.isArray(row.source_links) ? row.source_links : [],
        draft_markdown: row.draft_markdown,
        canonical_url: row.canonical_url,
        metadata: row.metadata,
        published_at: row.published_at,
      });

      const { error: updateError } = await actionContext.adminDb
        .from('content_items')
        .update({
          status: 'published',
          canonical_url: publishFields.canonicalUrl,
          published_at: publishFields.publishedAt,
          metadata: metadataWithSnapshot,
        })
        .eq('content_id', row.content_id);
      if (updateError) throw updateError;
    } catch (publishError) {
      structuredLog(
        'content_publish_wave_item_blocked',
        {
          actor_user_id: actionContext.user.id,
          content_id: row.content_id,
          slug: row.slug,
          queue_owner:
            typeof row.metadata?.['queue_owner'] === 'string'
              ? String(row.metadata?.['queue_owner'])
              : null,
          queue_target_week:
            typeof row.metadata?.['queue_target_week'] === 'string'
              ? String(row.metadata?.['queue_target_week'])
              : null,
          reason: publishError instanceof Error ? publishError.message : String(publishError),
        },
        'warning'
      );
    }
  }

  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard/content/launch');
  revalidatePath('/blog');
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
  const authorName = String(formData.get('authorName') ?? '').trim();
  const authorRole = String(formData.get('authorRole') ?? '').trim();
  const authorUrl = String(formData.get('authorUrl') ?? '').trim();
  const heroImageUrl = String(formData.get('heroImageUrl') ?? '').trim();
  const heroImageAlt = String(formData.get('heroImageAlt') ?? '').trim();
  const topicPageDefinition = String(formData.get('topicPageDefinition') ?? '');
  const topicPageWhyItMatters = String(formData.get('topicPageWhyItMatters') ?? '');
  const topicPagePracticalTakeaway = String(formData.get('topicPagePracticalTakeaway') ?? '');

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

  const existingItem = await createContentAdminData(actionContext.adminDb).getContentItemDetail(contentId);
  if (!existingItem) {
    throw new Error('Content item not found.');
  }

  if (status === 'published' && existingItem.content_type === 'article') {
    assertEditorialReadyForLaunch({
      title,
      draftMarkdown,
      sourceLinks: existingItem.source_links,
      ctaGoal: existingItem.cta_goal,
    });
  }

  const articleMetadata = mergeArticleMetadata(existingItem.metadata, {
    authorName: authorName || null,
    authorRole: authorRole || null,
    authorUrl: authorUrl || null,
    heroImageUrl: heroImageUrl || null,
    heroImageAlt: heroImageAlt || null,
    noIndex: existingItem.metadata?.['noindex'] === true,
  });

  const publishFields =
    status === 'published' && existingItem.content_type === 'article'
      ? prepareContentForPublish({
          content_type: existingItem.content_type,
          slug,
          title,
          status,
          topic_cluster: topicCluster || existingItem.topic_cluster,
          cta_goal: existingItem.cta_goal,
          source_type: existingItem.source_type,
          source_links: existingItem.source_links,
          draft_markdown: draftMarkdown,
          canonical_url: existingItem.canonical_url,
          metadata: articleMetadata,
          published_at: existingItem.published_at,
        })
      : null;

  const publishCheckMetadata =
    existingItem.content_type === 'article'
      ? appendContentPublishCheckSnapshot(
          articleMetadata,
          evaluateContentPublishChecks({
            content_type: existingItem.content_type,
            slug,
            title,
            status,
            topic_cluster: topicCluster || existingItem.topic_cluster,
            cta_goal: existingItem.cta_goal,
            source_type: existingItem.source_type,
            source_links: existingItem.source_links,
            draft_markdown: draftMarkdown,
            canonical_url: existingItem.canonical_url,
            metadata: articleMetadata,
            published_at: existingItem.published_at,
            updated_at: existingItem.updated_at,
          })
        )
      : articleMetadata;

  let metadata = publishCheckMetadata;

  if (existingItem.content_type === 'research_note' && existingItem.slug?.startsWith('topic-')) {
    metadata = mergeTopicPageMetadata(metadata, {
      definition: topicPageDefinition,
      whyItMatters: topicPageWhyItMatters,
      practicalTakeaway: topicPagePracticalTakeaway,
    });
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
      canonical_url: publishFields?.canonicalUrl ?? (canonicalUrl || null),
      brief_markdown: briefMarkdown || null,
      draft_markdown: draftMarkdown || null,
      metadata,
      published_at: publishFields?.publishedAt ?? existingItem.published_at,
    })
    .eq('content_id', contentId);

  if (error) {
    throw error;
  }

  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${contentId}`);
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  if (existingItem.content_type === 'research_note' && existingItem.topic_cluster) {
    revalidatePath(`/blog/topic/${existingItem.topic_cluster}`);
  }
}

export async function publishContentItem(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const contentId = String(formData.get('contentId') ?? '').trim();
  if (!contentId) {
    throw new Error('Missing content id.');
  }

  const item = await createContentAdminData(actionContext.adminDb).getContentItemDetail(contentId);
  if (!item) {
    throw new Error('Content item not found.');
  }

  const publishChecks = evaluateContentPublishChecks(item);
  const metadataWithSnapshot = appendContentPublishCheckSnapshot(item.metadata, publishChecks);

  assertEditorialReadyForLaunch({
    title: item.title,
    draftMarkdown: item.draft_markdown,
    sourceLinks: item.source_links,
    ctaGoal: item.cta_goal,
  });

  const publishFields = prepareContentForPublish(item);

  const { error } = await actionContext.adminDb
    .from('content_items')
    .update({
      status: 'published',
      canonical_url: publishFields.canonicalUrl,
      published_at: publishFields.publishedAt,
      metadata: metadataWithSnapshot,
    })
    .eq('content_id', contentId);

  if (error) {
    throw error;
  }

  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${contentId}`);
  revalidatePath('/blog');
  revalidatePath(`/blog/${item.slug}`);
}

export async function publishReadyArticles() {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const { data, error } = await actionContext.adminDb
    .from('content_items')
    .select(
      'content_id,slug,title,status,content_type,topic_cluster,cta_goal,source_type,source_links,draft_markdown,canonical_url,metadata,published_at'
    )
    .eq('content_type', 'article')
    .neq('status', 'published');

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as Array<{
    content_id: string;
    slug: string | null;
    title: string | null;
    status: string | null;
    content_type: string;
    cta_goal: string | null;
    source_type: string | null;
    source_links: string[] | null;
    draft_markdown: string | null;
    canonical_url: string | null;
    metadata: Record<string, unknown> | null;
    published_at: string | null;
    topic_cluster: string | null;
  }>) {
    try {
      assertEditorialReadyForLaunch({
        title: row.title ?? '',
        draftMarkdown: row.draft_markdown,
        sourceLinks: Array.isArray(row.source_links) ? row.source_links : [],
        ctaGoal: row.cta_goal,
      });

      const publishFields = prepareContentForPublish({
        content_type: row.content_type,
        slug: row.slug,
        title: row.title,
        status: row.status,
        topic_cluster: row.topic_cluster,
        cta_goal: row.cta_goal,
        source_type: row.source_type,
        source_links: Array.isArray(row.source_links) ? row.source_links : [],
        draft_markdown: row.draft_markdown,
        canonical_url: row.canonical_url,
        metadata: row.metadata ?? {},
        published_at: row.published_at,
      });

      const checks = evaluateContentPublishChecks({
        content_type: row.content_type,
        slug: row.slug,
        title: row.title,
        status: row.status,
        topic_cluster: row.topic_cluster,
        cta_goal: row.cta_goal,
        source_type: row.source_type,
        source_links: Array.isArray(row.source_links) ? row.source_links : [],
        draft_markdown: row.draft_markdown,
        canonical_url: row.canonical_url,
        metadata: row.metadata ?? {},
        published_at: row.published_at,
      });
      const metadataWithSnapshot = appendContentPublishCheckSnapshot(row.metadata ?? {}, checks);

      const { error: updateError } = await actionContext.adminDb
        .from('content_items')
        .update({
          status: 'published',
          canonical_url: publishFields.canonicalUrl,
          published_at: publishFields.publishedAt,
          metadata: metadataWithSnapshot,
        })
        .eq('content_id', row.content_id);

      if (updateError) {
        throw updateError;
      }
    } catch {
      continue;
    }
  }

  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard/content/launch');
  revalidatePath('/blog');
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
