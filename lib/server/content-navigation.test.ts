import { describe, expect, it } from 'vitest';
import {
  buildTopicAnchor,
  buildTopicHref,
  getArticlesForTopic,
  getRelatedArticles,
  groupArticlesByTopic,
} from './content-navigation';
import type { PublicContentListRow } from './public-content-data';

const ARTICLES: PublicContentListRow[] = [
  {
    id: '1',
    content_id: 'a',
    slug: 'audit-your-site',
    title: 'Audit your site',
    target_persona: 'SEO consultants',
    primary_problem: null,
    topic_cluster: 'ai_search_readiness',
    cta_goal: 'free_scan',
    canonical_url: '/blog/audit-your-site',
    published_at: '2026-03-31T12:00:00.000Z',
    updated_at: '2026-03-31T12:00:00.000Z',
    excerpt: 'One',
    metadata: {},
  },
  {
    id: '2',
    content_id: 'b',
    slug: 'crawlable-not-extractable',
    title: 'Crawlable not extractable',
    target_persona: 'SEO consultants',
    primary_problem: null,
    topic_cluster: 'ai_search_readiness',
    cta_goal: 'free_scan',
    canonical_url: '/blog/crawlable-not-extractable',
    published_at: '2026-03-31T12:00:00.000Z',
    updated_at: '2026-03-31T12:00:00.000Z',
    excerpt: 'Two',
    metadata: {},
  },
  {
    id: '3',
    content_id: 'c',
    slug: 'easy-to-cite',
    title: 'Easy to cite',
    target_persona: 'Founders',
    primary_problem: null,
    topic_cluster: 'citation_readiness',
    cta_goal: 'free_scan',
    canonical_url: '/blog/easy-to-cite',
    published_at: '2026-03-31T12:00:00.000Z',
    updated_at: '2026-03-31T12:00:00.000Z',
    excerpt: 'Three',
    metadata: {},
  },
];

describe('content navigation helpers', () => {
  it('groups articles by topic cluster', () => {
    expect(groupArticlesByTopic(ARTICLES)).toEqual([
      {
        topicKey: 'ai_search_readiness',
        topicLabel: 'Ai Search Readiness',
        articles: [ARTICLES[0], ARTICLES[1]],
      },
      {
        topicKey: 'citation_readiness',
        topicLabel: 'Citation Readiness',
        articles: [ARTICLES[2]],
      },
    ]);
  });

  it('builds stable topic anchors', () => {
    expect(buildTopicAnchor('ai_search_readiness')).toBe('topic-ai-search-readiness');
    expect(buildTopicAnchor(null)).toBe('topic-general');
  });

  it('builds topic hrefs', () => {
    expect(buildTopicHref('ai_search_readiness')).toBe('/blog/topic/ai_search_readiness');
    expect(buildTopicHref(null)).toBe('/blog/topic/general');
    expect(buildTopicHref('AI visibility reporting for agencies')).toBe(
      '/blog/topic/AI%20visibility%20reporting%20for%20agencies'
    );
    expect(buildTopicHref('What evidence should an MSP website provide for AI-assisted buyer questions?')).toBe(
      '/blog/topic/What%20evidence%20should%20an%20MSP%20website%20provide%20for%20AI-assisted%20buyer%20questions%3F'
    );
  });

  it('selects related articles from the same topic first', () => {
    expect(getRelatedArticles(ARTICLES, 'audit-your-site', 'ai_search_readiness', 2)).toEqual([
      ARTICLES[1],
      ARTICLES[2],
    ]);
  });

  it('filters articles for one topic', () => {
    expect(getArticlesForTopic(ARTICLES, 'ai_search_readiness')).toEqual([ARTICLES[0], ARTICLES[1]]);
    expect(getArticlesForTopic(ARTICLES, 'general')).toEqual([]);
  });
});
