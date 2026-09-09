import { describe, expect, it } from 'vitest';
import {
  buildArticleStructuredData,
  mergeArticleMetadata,
  parseArticleMetadata,
  resolvePublicArticleDescription,
} from './content-article-metadata';

describe('content article metadata helpers', () => {
  it('parses author fields from metadata', () => {
    expect(
      parseArticleMetadata({
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        author_url: 'https://getgeopulse.com/about',
        meta_description: 'A practical audit walkthrough for operators.',
        seo_title: 'AI Visibility Audit Checklist: 10 Practical Checks',
        seo_h1: 'AI Visibility Audit Checklist',
        hero_image_url: 'https://cdn.example.com/hero.jpg',
        hero_image_alt: 'Article hero image',
      })
    ).toEqual({
      authorName: 'Carine Tamon',
      authorRole: 'Founder',
      authorUrl: 'https://getgeopulse.com/about',
      metaDescription: 'A practical audit walkthrough for operators.',
      seoTitle: 'AI Visibility Audit Checklist: 10 Practical Checks',
      seoHeading: 'AI Visibility Audit Checklist',
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
          metaDescription: 'A practical audit walkthrough for operators.',
          seoTitle: 'AI Visibility Audit Checklist: 10 Practical Checks',
          seoHeading: 'AI Visibility Audit Checklist',
          heroImageUrl: 'https://cdn.example.com/hero.jpg',
          heroImageAlt: 'Article hero image',
          noIndex: true,
        }
      )
    ).toEqual({
      existing: true,
      author_name: 'Carine Tamon',
      author_role: 'Founder',
      meta_description: 'A practical audit walkthrough for operators.',
      seo_title: 'AI Visibility Audit Checklist: 10 Practical Checks',
      seo_h1: 'AI Visibility Audit Checklist',
      hero_image_url: 'https://cdn.example.com/hero.jpg',
      hero_image_alt: 'Article hero image',
      noindex: true,
    });
  });

  it('uses the article title when no safe public description exists', () => {
    expect(
      resolvePublicArticleDescription({
        metadata: { meta_description: 'Position #2 with 100 impressions.' },
        markdown: '# Heading only',
        title: 'MSP AI Search Audit',
      })
    ).toBe('Practical guidance on MSP AI Search Audit for teams improving AI search readiness.');
  });

  it('never exposes internal search-performance notes as article descriptions', () => {
    expect(
      resolvePublicArticleDescription({
        metadata: { meta_description: 'ahrefs.com ranks #2; getgeopulse.com is outside the measured top 10.' },
        markdown: 'A practical AI visibility audit separates page readiness from observed answer visibility.',
      })
    ).toBe('A practical AI visibility audit separates page readiness from observed answer visibility.');
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
        url: 'https://getgeopulse.com/',
      },
    });
  });
});
