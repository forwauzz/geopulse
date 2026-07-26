import type {
  DistributionAccountRow,
  DistributionAssetRow,
  DistributionJobRow,
} from './distribution-engine-repository';
import { createDistributionEngineRepository } from './distribution-engine-repository';

type Db = { from(table: string): any };

type PublishedContent = {
  id: string;
  content_id: string;
  content_type: string;
  metadata: Record<string, unknown>;
};

function isNewsletterProvider(provider: string): boolean {
  return provider === 'buttondown' || provider === 'kit' || provider === 'ghost';
}

async function upsertDelivery(args: {
  db: Db;
  contentItemId: string;
  destinationType: 'newsletter' | 'social';
  destinationName: string;
  destinationPostId: string | null;
  destinationUrl: string | null;
  publishedAt: string;
  jobId: string;
}): Promise<void> {
  const { data: existingRows, error: existingError } = await args.db
    .from('content_distribution_deliveries')
    .select('id')
    .eq('content_item_id', args.contentItemId)
    .eq('destination_type', args.destinationType)
    .eq('destination_name', args.destinationName)
    .order('created_at', { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const existing = existingRows?.[0] ?? null;
  const payload = {
    status: 'published',
    destination_post_id: args.destinationPostId,
    destination_url: args.destinationUrl,
    published_at: args.publishedAt,
    metadata: {
      distribution_job_id: args.jobId,
      verification: 'provider_publish_succeeded',
    },
  };
  if (existing?.id) {
    const { error } = await args.db
      .from('content_distribution_deliveries')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await args.db.from('content_distribution_deliveries').insert({
    content_item_id: args.contentItemId,
    destination_type: args.destinationType,
    destination_name: args.destinationName,
    ...payload,
  });
  if (error) throw error;
}

async function publishContentItem(args: {
  db: Db;
  item: PublishedContent;
  account: DistributionAccountRow;
  job: DistributionJobRow;
  destinationPostId: string | null;
  destinationUrl: string | null;
  publishedAt: string;
}): Promise<void> {
  const destinationType = isNewsletterProvider(args.account.provider_name)
    ? 'newsletter'
    : 'social';
  await upsertDelivery({
    db: args.db,
    contentItemId: args.item.id,
    destinationType,
    destinationName: args.account.provider_name,
    destinationPostId: args.destinationPostId,
    destinationUrl: args.destinationUrl,
    publishedAt: args.publishedAt,
    jobId: args.job.id,
  });
  if (args.item.content_type === 'article') {
    return;
  }
  const { error } = await args.db
    .from('content_items')
    .update({
      status: 'published',
      published_at: args.publishedAt,
      metadata: {
        ...(args.item.metadata ?? {}),
        publication_proof: {
          provider: args.account.provider_name,
          distribution_job_id: args.job.id,
          destination_url: args.destinationUrl,
          verified_at: args.publishedAt,
        },
      },
    })
    .eq('id', args.item.id);
  if (error) throw error;
}

export async function recordDistributionPublicationProof(args: {
  db: Db;
  account: DistributionAccountRow;
  asset: DistributionAssetRow;
  job: DistributionJobRow;
  contentItem: PublishedContent;
  destinationPostId: string | null;
  destinationUrl: string | null;
  publishedAt?: string;
}): Promise<{ contentItemsPublished: number }> {
  const publishedAt = args.publishedAt ?? new Date().toISOString();
  const { error: assetError } = await args.db
    .from('distribution_assets')
    .update({ status: 'published' })
    .eq('id', args.asset.id);
  if (assetError) throw assetError;

  await publishContentItem({
    db: args.db,
    item: args.contentItem,
    account: args.account,
    job: args.job,
    destinationPostId: args.destinationPostId,
    destinationUrl: args.destinationUrl,
    publishedAt,
  });
  let contentItemsPublished = args.contentItem.content_type === 'article' ? 0 : 1;

  const opportunityId = String(args.contentItem.metadata?.['seo_opportunity_id'] ?? '');
  if (!isNewsletterProvider(args.account.provider_name) && opportunityId) {
    const { data: derivative, error } = await args.db
      .from('content_items')
      .select('id,content_id,content_type,metadata')
      .eq('content_type', 'social_post')
      .eq('metadata->>seo_opportunity_id', opportunityId)
      .maybeSingle();
    if (error) throw error;
    if (derivative?.id && derivative.id !== args.contentItem.id) {
      await publishContentItem({
        db: args.db,
        item: derivative as PublishedContent,
        account: args.account,
        job: args.job,
        destinationPostId: args.destinationPostId,
        destinationUrl: args.destinationUrl,
        publishedAt,
      });
      contentItemsPublished += 1;
    }
  }

  return { contentItemsPublished };
}

export async function reconcilePublishedDistributionProofs(args: {
  db: Db;
  limit?: number;
}): Promise<{ checked: number; repaired: number; failed: number }> {
  const { data, error } = await args.db
    .from('distribution_jobs')
    .select('id,completed_at')
    .eq('status', 'published')
    .order('completed_at', { ascending: false })
    .limit(args.limit ?? 20);
  if (error) throw error;

  const repo = createDistributionEngineRepository(args.db as never);
  let checked = 0;
  let repaired = 0;
  let failed = 0;
  for (const row of data ?? []) {
    checked += 1;
    try {
      const job = await repo.getJobById(String(row.id));
      if (!job) continue;
      const [asset, account] = await Promise.all([
        repo.getAssetById(job.distribution_asset_id),
        repo.getAccountById(job.distribution_account_id),
      ]);
      if (!asset?.content_item_id || !account) continue;
      const { data: item, error: itemError } = await args.db
        .from('content_items')
        .select('id,content_id,content_type,metadata')
        .eq('id', asset.content_item_id)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) continue;
      await recordDistributionPublicationProof({
        db: args.db,
        account,
        asset,
        job,
        contentItem: item as PublishedContent,
        destinationPostId: job.provider_post_id,
        destinationUrl: job.destination_url,
        publishedAt: job.completed_at ?? row.completed_at ?? undefined,
      });
      repaired += 1;
    } catch {
      failed += 1;
    }
  }
  return { checked, repaired, failed };
}
