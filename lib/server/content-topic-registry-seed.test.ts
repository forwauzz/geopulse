import { describe, expect, it } from 'vitest';
import {
  buildTopicRegistrySeedItems,
  parseTopicRegistry,
} from './content-topic-registry-seed';

describe('content-topic-registry-seed', () => {
  it('parses registry and builds batch-specific seed items', () => {
    const registry = parseTopicRegistry(`{
      "version": "v1",
      "updated_at": "2026-04-03",
      "pillars": [
        {
          "pillar_id": "01",
          "pillar_slug": "ai-search-readiness-foundations",
          "pillar_title": "AI Search Readiness Foundations",
          "topics": [
            { "intent": "definition", "slug": "what-is-ai-search-readiness-for-b2b-sites", "status": "planned", "planned_batch": "batch_1" },
            { "intent": "implementation", "slug": "how-to-run-an-ai-search-readiness-baseline", "status": "planned", "planned_batch": "batch_2" },
            { "intent": "comparison", "slug": "ignore-me", "status": "done", "planned_batch": "batch_1" }
          ]
        }
      ]
    }`);

    const batchOneItems = buildTopicRegistrySeedItems(registry, 'batch_1');
    const batchTwoItems = buildTopicRegistrySeedItems(registry, 'batch_2');
    const firstBatchOne = batchOneItems[0]!;
    const firstBatchTwo = batchTwoItems[0]!;

    expect(batchOneItems).toHaveLength(1);
    expect(firstBatchOne).toEqual(
      expect.objectContaining({
        content_id: 'what-is-ai-search-readiness-for-b2b-sites-article',
        slug: 'what-is-ai-search-readiness-for-b2b-sites',
        title: 'What Is AI Search Readiness For B2b Sites',
        status: 'brief',
        content_type: 'article',
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        topic_cluster: 'ai_search_readiness_foundations',
        keyword_cluster: 'definition_batch_1',
      })
    );
    expect(firstBatchOne.brief_markdown).toContain('AI Search Readiness Foundations');
    expect(firstBatchOne.metadata).toMatchObject({
      seeded_from_topic_registry: true,
      topic_registry_intent: 'definition',
      topic_registry_batch: 'batch_1',
    });

    expect(batchTwoItems).toHaveLength(1);
    expect(firstBatchTwo.slug).toBe('how-to-run-an-ai-search-readiness-baseline');
  });

  it('throws on invalid registry payloads', () => {
    expect(() => parseTopicRegistry(`{"version":"v1","updated_at":"2026-04-03","pillars":"bad"}`))
      .toThrowError(/Invalid topic registry pillars/);
  });
});
