import { describe, expect, it } from 'vitest';
import {
  buildBlogIndexStructuredData,
  buildBreadcrumbStructuredData,
  buildTopicPageStructuredData,
} from './content-structured-data';

describe('buildTopicPageStructuredData', () => {
  it('builds collection page structured data for topic hubs', () => {
    expect(
      buildTopicPageStructuredData({
        topicLabel: 'Ai Search Readiness',
        topicUrl: 'https://getgeopulse.com/blog/topic/ai_search_readiness',
        definition: 'Definition',
        whyItMatters: 'Why it matters',
        articleUrls: [
          'https://getgeopulse.com/blog/audit-your-site',
          'https://getgeopulse.com/blog/crawlable-not-extractable',
        ],
      })
    ).toMatchObject({
      '@type': 'CollectionPage',
      about: {
        '@type': 'Thing',
        name: 'Ai Search Readiness',
      },
      hasPart: [{ '@type': 'Article' }, { '@type': 'Article' }],
    });
  });
});

describe('buildBreadcrumbStructuredData', () => {
  it('builds breadcrumb list data in order', () => {
    expect(
      buildBreadcrumbStructuredData([
        { name: 'Blog', item: 'https://getgeopulse.com/blog' },
        { name: 'AI Search Readiness', item: 'https://getgeopulse.com/blog/topic/ai_search_readiness' },
      ])
    ).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Blog' },
        { '@type': 'ListItem', position: 2, name: 'AI Search Readiness' },
      ],
    });
  });
});

describe('buildBlogIndexStructuredData', () => {
  it('builds collection page data for blog index', () => {
    expect(
      buildBlogIndexStructuredData({
        blogUrl: 'https://getgeopulse.com/blog',
        description: 'Operator-grade articles about AI search readiness.',
        topicUrls: [
          'https://getgeopulse.com/blog/topic/ai_search_readiness',
          'https://getgeopulse.com/blog/topic/citation_readiness',
        ],
      })
    ).toMatchObject({
      '@type': 'CollectionPage',
      hasPart: [{ '@type': 'CollectionPage' }, { '@type': 'CollectionPage' }],
      publisher: {
        '@type': 'Organization',
        name: 'GEO-Pulse',
      },
    });
  });
});
