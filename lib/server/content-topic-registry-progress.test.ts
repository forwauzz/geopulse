import { describe, expect, it } from 'vitest';
import { buildTopicRegistryProgressSummary } from './content-topic-registry-progress';

describe('buildTopicRegistryProgressSummary', () => {
  it('computes per-batch and total seeded/published progress', () => {
    const plannedTopics = [
      { slug: 'a', planned_batch: 'batch_1', status: 'planned' },
      { slug: 'b', planned_batch: 'batch_1', status: 'planned' },
      { slug: 'c', planned_batch: 'batch_2', status: 'planned' },
      { slug: 'd', planned_batch: 'batch_3', status: 'planned' },
    ] as const;

    const contentRows = [
      { slug: 'a', status: 'brief' },
      { slug: 'c', status: 'published' },
      { slug: 'd', status: 'approved' },
    ] as const;

    const summary = buildTopicRegistryProgressSummary(plannedTopics, contentRows);
    const batch1 = summary.batches.find((batch) => batch.batch === 'batch_1')!;
    const batch2 = summary.batches.find((batch) => batch.batch === 'batch_2')!;
    const batch3 = summary.batches.find((batch) => batch.batch === 'batch_3')!;

    expect(summary).toMatchObject({
      total_planned: 4,
      total_seeded: 3,
      total_published: 1,
      total_ready: 2,
      total_remaining: 1,
    });

    expect(batch1).toMatchObject({
      planned_count: 2,
      seeded_count: 1,
      published_count: 0,
      ready_count: 0,
      remaining_count: 1,
      seed_progress_percent: 50,
      publish_progress_percent: 0,
    });

    expect(batch2).toMatchObject({
      planned_count: 1,
      seeded_count: 1,
      published_count: 1,
      ready_count: 1,
      remaining_count: 0,
      seed_progress_percent: 100,
      publish_progress_percent: 100,
    });

    expect(batch3).toMatchObject({
      planned_count: 1,
      seeded_count: 1,
      published_count: 0,
      ready_count: 1,
      remaining_count: 0,
      seed_progress_percent: 100,
      publish_progress_percent: 0,
    });
  });
});
