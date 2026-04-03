import { describe, expect, it } from 'vitest';
import {
  buildArticleStructuredData,
  mergeArticleMetadata,
  parseArticleMetadata,
} from './content-article-metadata';

describe('content article metadata helpers', () => {
  it('parses author fields from metadata', () => {
    expect(
      parseArticleMetadata({
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        author_url: 'https://getgeopulse.com/about',
        hero_image_url: 'https://cdn.example.com/hero.jpg',
        hero_image_alt: 'Article hero image',
      })
    ).toEqual({
      authorName: 'Carine Tamon',
      authorRole: 'Founder',
      authorUrl: 'https://getgeopulse.com/about',
      heroImageUrl: 'https://cdn.example.com/hero.jpg',
      heroImageAlt: 'Article hero image',
      noIndex: false,
    });
  });

  it('merges author fields into metadata without dropping other keys', () => {
    expect(
      mergeArticleMetadata(
        { existing: true, author_name: 'Old Name' },
        {
          authorName: 'Carine Tamon',
          authorRole: 'Founder',
          authorUrl: null,
          heroImageUrl: 'https://cdn.example.com/hero.jpg',
          heroImageAlt: 'Article hero image',
          noIndex: true,
        }
      )
    ).toEqual({
      existing: true,
      author_name: 'Carine Tamon',
      author_role: 'Founder',
      hero_image_url: 'https://cdn.example.com/hero.jpg',
      hero_image_alt: 'Article hero image',
      noindex: true,
    });
  });

  it('builds article structured data', () => {
    expect(
      buildArticleStructuredData({
        title: 'How to Audit Your Site for AI Search Readiness',
        description: 'A practical audit walkthrough for operators.',
        canonicalUrl: 'https://getgeopulse.com/blog/ai-search-readiness-audit',
        publishedAt: '2026-03-31T12:00:00.000Z',
        updatedAt: '2026-03-31T13:00:00.000Z',
        authorName: 'Carine Tamon',
        authorRole: 'Founder',
        authorUrl: 'https://getgeopulse.com/about',
        heroImageUrl: 'https://cdn.example.com/hero.jpg',
      })
    ).toMatchObject({
      '@type': 'Article',
      headline: 'How to Audit Your Site for AI Search Readiness',
      image: ['https://cdn.example.com/hero.jpg'],
      author: {
        '@type': 'Person',
        name: 'Carine Tamon',
        description: 'Founder',
      },
      publisher: {
        '@type': 'Organization',
        name: 'GEO-Pulse',
      },
    });
  });
});
