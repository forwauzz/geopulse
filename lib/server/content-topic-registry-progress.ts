import { loadTopicRegistryFromDisk } from './content-topic-registry-seed';

type SupabaseLike = {
  from(table: string): any;
};

type TopicBatch = 'batch_1' | 'batch_2' | 'batch_3';

type TopicRegistryPlannedTopic = {
  readonly slug: string;
  readonly planned_batch: TopicBatch;
  readonly status: string;
};

type ContentTopicRow = {
  readonly slug: string;
  readonly status: string;
};

export type TopicRegistryBatchProgress = {
  readonly batch: TopicBatch;
  readonly planned_count: number;
  readonly seeded_count: number;
  readonly published_count: number;
  readonly ready_count: number;
  readonly remaining_count: number;
  readonly seed_progress_percent: number;
  readonly publish_progress_percent: number;
};

export type TopicRegistryProgressSummary = {
  readonly total_planned: number;
  readonly total_seeded: number;
  readonly total_published: number;
  readonly total_ready: number;
  readonly total_remaining: number;
  readonly batches: TopicRegistryBatchProgress[];
};

const TOPIC_BATCH_ORDER: readonly TopicBatch[] = ['batch_1', 'batch_2', 'batch_3'] as const;

function roundPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function isReadyStatus(status: string): boolean {
  return status === 'approved' || status === 'published';
}

export function buildTopicRegistryProgressSummary(
  plannedTopics: readonly TopicRegistryPlannedTopic[],
  contentRows: readonly ContentTopicRow[]
): TopicRegistryProgressSummary {
  const bySlug = new Map<string, ContentTopicRow>();
  for (const row of contentRows) {
    if (!row.slug) continue;
    bySlug.set(row.slug, row);
  }

  const batches = TOPIC_BATCH_ORDER.map((batch) => {
    const planned = plannedTopics.filter((topic) => topic.planned_batch === batch);
    const seededRows = planned
      .map((topic) => bySlug.get(topic.slug))
      .filter((row): row is ContentTopicRow => Boolean(row));
    const publishedCount = seededRows.filter((row) => row.status === 'published').length;
    const readyCount = seededRows.filter((row) => isReadyStatus(row.status)).length;

    return {
      batch,
      planned_count: planned.length,
      seeded_count: seededRows.length,
      published_count: publishedCount,
      ready_count: readyCount,
      remaining_count: Math.max(planned.length - seededRows.length, 0),
      seed_progress_percent: roundPercent(seededRows.length, planned.length),
      publish_progress_percent: roundPercent(publishedCount, planned.length),
    } satisfies TopicRegistryBatchProgress;
  });

  const totalPlanned = batches.reduce((sum, batch) => sum + batch.planned_count, 0);
  const totalSeeded = batches.reduce((sum, batch) => sum + batch.seeded_count, 0);
  const totalPublished = batches.reduce((sum, batch) => sum + batch.published_count, 0);
  const totalReady = batches.reduce((sum, batch) => sum + batch.ready_count, 0);
  const totalRemaining = batches.reduce((sum, batch) => sum + batch.remaining_count, 0);

  return {
    total_planned: totalPlanned,
    total_seeded: totalSeeded,
    total_published: totalPublished,
    total_ready: totalReady,
    total_remaining: totalRemaining,
    batches,
  };
}

export async function getTopicRegistryProgressSummary(
  supabase: SupabaseLike
): Promise<TopicRegistryProgressSummary> {
  const registry = await loadTopicRegistryFromDisk();
  const plannedTopics: TopicRegistryPlannedTopic[] = registry.pillars.flatMap((pillar) =>
    pillar.topics
      .filter((topic) => topic.status === 'planned')
      .map((topic) => ({
        slug: topic.slug,
        planned_batch: topic.planned_batch,
        status: topic.status,
      }))
  );

  if (plannedTopics.length === 0) {
    return buildTopicRegistryProgressSummary([], []);
  }

  const topicSlugs = plannedTopics.map((topic) => topic.slug);
  const { data, error } = await supabase
    .from('content_items')
    .select('slug,status')
    .in('slug', topicSlugs)
    .eq('content_type', 'article');

  if (error) throw error;

  const contentRows = ((data ?? []) as Array<{ slug?: unknown; status?: unknown }>)
    .map((row) => ({
      slug: typeof row.slug === 'string' ? row.slug : '',
      status: typeof row.status === 'string' ? row.status : '',
    }))
    .filter((row) => row.slug);

  return buildTopicRegistryProgressSummary(plannedTopics, contentRows);
}
