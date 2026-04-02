import { describe, expect, it } from 'vitest';
import { buildTopicPageStructuredData } from './content-structured-data';

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
