import { describe, expect, it } from 'vitest';
import { titleTagCheck } from './checks/check-title';

describe('titleTagCheck', () => {
  it('uses a readable title-length range in failed guidance', async () => {
    const result = await titleTagCheck.run({
      signals: {
        title: 'X'.repeat(85),
        metaDescription: null,
        canonicalHref: null,
        robotsMetaContent: null,
        ogTitle: null,
        ogDescription: null,
        jsonLdSnippetCount: 0,
        jsonLdTypes: [],
        h1Count: 1,
        h2Count: 0,
        hasViewportMeta: true,
        htmlCharLength: 1000,
        internalLinkCount: 0,
        externalLinkCount: 0,
        hasAuthorSignal: false,
        hasAboutLink: false,
        hasSnippetRestriction: false,
        totalImages: 0,
        imagesWithoutAlt: 0,
        publishedDate: null,
        modifiedDate: null,
      },
      finalUrl: 'https://example.com/',
      textSample: '',
      robotsTxtContent: '',
      llmsTxtContent: '',
      responseHeaders: {},
    });

    expect(result.finding).toContain('aim for 10-70');
    expect(result.finding).not.toContain('1070');
  });
});
