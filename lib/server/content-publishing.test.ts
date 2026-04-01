import { describe, expect, it } from 'vitest';
import {
  buildCanonicalContentUrl,
  getContentPublishIssues,
  prepareContentForPublish,
} from './content-publishing';

describe('content publishing helpers', () => {
  it('derives the canonical blog URL for articles', () => {
    expect(buildCanonicalContentUrl('article', 'ai-search-readiness-audit')).toBe(
      '/blog/ai-search-readiness-audit'
    );
    expect(buildCanonicalContentUrl('newsletter', 'weekly-note')).toBeNull();
  });

  it('reports publish blockers for incomplete content', () => {
    expect(
      getContentPublishIssues({
        content_type: 'article',
        slug: '',
        title: '',
        status: 'approved',
        cta_goal: null,
        source_type: null,
        source_links: [],
        draft_markdown: '   ',
        canonical_url: null,
        published_at: null,
      })
    ).toEqual([
      'Title is required.',
      'Slug is required.',
      'Draft markdown is required.',
      'CTA goal is required.',
      'Source type is required.',
      'At least one source link is required.',
    ]);
  });

  it('prepares publish fields for a valid article', () => {
    const result = prepareContentForPublish({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: '# Article',
      canonical_url: null,
      published_at: '2026-03-31T12:00:00.000Z',
    });

    expect(result).toEqual({
      canonicalUrl: '/blog/ai-search-readiness-audit',
      publishedAt: '2026-03-31T12:00:00.000Z',
    });
  });

  it('rejects non-article publish attempts', () => {
    expect(() =>
      prepareContentForPublish({
        content_type: 'newsletter',
        slug: 'weekly-note',
        title: 'Weekly note',
        status: 'approved',
        cta_goal: 'free_scan',
        source_type: 'founder_input',
        source_links: ['https://example.com/research'],
        draft_markdown: '# Newsletter',
        canonical_url: null,
        published_at: null,
      })
    ).toThrow('Only article content items can be published to the public blog in this slice.');
  });
});
