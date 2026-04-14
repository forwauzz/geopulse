import { describe, expect, it } from 'vitest';
import { buildSeededTopicPageItem, getTopicPageContent } from './content-topic-pages';

describe('content topic pages', () => {
  it('returns curated copy for known topics', () => {
    expect(getTopicPageContent('ai_search_readiness')).toEqual({
      definition:
        'AI search readiness is the practical state where a site is crawlable, structurally legible, and easy for language models to segment, summarize, and cite.',
      whyItMatters:
        'Teams often assume ranking, crawl access, or schema alone are enough, but AI visibility depends on whether systems can reliably extract and trust the page.',
      practicalTakeaway:
        'Start with pages that should explain the business clearly, then check whether the answer is direct, structured, and easy to quote without heavy interpretation.',
    });
  });

  it('falls back for unknown topics', () => {
    expect(getTopicPageContent('trust_signals')).toEqual({
      definition: 'This topic cluster groups GEO-Pulse articles about trust signals into one navigable path.',
      whyItMatters:
        'Topic pages should give readers and language models one stable place to understand how related articles connect.',
      practicalTakeaway:
        'Start with the definition here, then move into the linked articles for the more specific workflow, mistake, or explanation you need.',
    });
  });

  it('builds a seeded topic-page content item', () => {
    expect(buildSeededTopicPageItem('ai_search_readiness')).toEqual({
      content_id: 'topic-page-ai_search_readiness',
      slug: 'topic-ai_search_readiness',
      title: 'Topic page: Ai Search Readiness',
      status: 'published',
      content_type: 'research_note',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      metadata: {
        topic_page_definition:
          'AI search readiness is the practical state where a site is crawlable, structurally legible, and easy for language models to segment, summarize, and cite.',
        topic_page_why_it_matters:
          'Teams often assume ranking, crawl access, or schema alone are enough, but AI visibility depends on whether systems can reliably extract and trust the page.',
        topic_page_practical_takeaway:
          'Start with pages that should explain the business clearly, then check whether the answer is direct, structured, and easy to quote without heavy interpretation.',
        topic_page_seeded: true,
      },
    });
  });
});
