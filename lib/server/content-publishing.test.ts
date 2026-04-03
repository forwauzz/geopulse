import { describe, expect, it } from 'vitest';
import {
  buildCanonicalContentUrl,
  evaluateContentPublishChecks,
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
        topic_cluster: null,
        cta_goal: null,
        source_type: null,
        source_links: [],
        draft_markdown: '   ',
        canonical_url: null,
        metadata: {},
        published_at: null,
      })
    ).toEqual([
      'Title is required.',
      'Slug is required.',
      'Topic cluster is required.',
      'Draft markdown is required.',
      'CTA goal is required.',
      'Source type is required.',
      'At least one source link is required.',
      'Author name is required.',
      'Author role is required.',
      'Hero image URL is required.',
      'Hero image alt text is required.',
    ]);
  });

  it('prepares publish fields for a valid article', () => {
    const result = prepareContentForPublish({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

Short intro paragraph that defines the topic and keeps language concrete for extraction.

## What crawlable but not extractable means

- One
- Two
- Three

## What to do first

Read [this related guide](/blog/internal-linking-guide) before rollout.
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Screenshot of AI answer panel',
      },
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
        topic_cluster: 'weekly',
        cta_goal: 'free_scan',
        source_type: 'founder_input',
        source_links: ['https://example.com/research'],
        draft_markdown: '# Newsletter',
        canonical_url: null,
        metadata: {
          author_name: 'Carine Tamon',
          author_role: 'Founder',
          hero_image_url: 'https://cdn.example.com/hero.png',
          hero_image_alt: 'Hero image',
        },
        published_at: null,
      })
    ).toThrow('Only article content items can be published to the public blog in this slice.');
  });

  it('blocks publish when noindex is enabled', () => {
    expect(
      getContentPublishIssues({
        content_type: 'article',
        slug: 'ai-search-readiness-audit',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'approved',
        topic_cluster: 'ai_search_readiness',
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: ['https://example.com/research'],
        draft_markdown: '# Article',
        canonical_url: null,
        metadata: {
          author_name: 'Carine Tamon',
          author_role: 'Founder',
          hero_image_url: 'https://cdn.example.com/hero.png',
          hero_image_alt: 'Hero image',
          noindex: true,
        },
        published_at: null,
      })
    ).toContain('Article cannot be published while noindex is enabled.');
  });

  it('blocks publish when hero image URL is not absolute', () => {
    expect(
      getContentPublishIssues({
        content_type: 'article',
        slug: 'ai-search-readiness-audit',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'approved',
        topic_cluster: 'ai_search_readiness',
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: ['https://example.com/research'],
        draft_markdown: '# Article',
        canonical_url: null,
        metadata: {
          author_name: 'Carine Tamon',
          author_role: 'Founder',
          hero_image_url: '/images/hero.png',
          hero_image_alt: 'Hero image',
        },
        published_at: null,
      })
    ).toContain('Hero image URL must be an absolute http(s) URL.');
  });

  it('blocks publish when headings are vague and no internal links exist', () => {
    const issues = getContentPublishIssues({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

This article gives practical advice.

## The future of discoverability

- One
- Two
- Three
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Hero image',
      },
      published_at: null,
    });

    expect(issues).toContain(
      'Replace vague heading "The future of discoverability" with concrete, extractable language.'
    );
    expect(issues).toContain(
      'At least one H2 heading should reflect a real question or decision.'
    );
    expect(issues).toContain(
      'Add at least one internal /blog link in the article body for topic graph clarity.'
    );
  });

  it('blocks publish when absolute performance claims are present', () => {
    const issues = getContentPublishIssues({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

This article gives practical advice.

## What to do first

- One
- Two
- Three

## How to scope baseline checks

Read [topic context](/blog/topic/ai_search_readiness).

This method is guaranteed rankings for every site.
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Hero image',
      },
      published_at: null,
    });

    expect(issues).toContain(
      'Remove absolute performance claims; keep recommendation language bounded to evidence.'
    );
  });

  it('returns structured checks for operator-facing publish review', () => {
    const checks = evaluateContentPublishChecks({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

Short intro paragraph that defines the topic.

## What crawlable but not extractable means

- One
- Two

## How to make this page easier to cite

Read [topic context](/blog/topic/ai_search_readiness).
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Hero image',
      },
      published_at: null,
    });

    expect(checks.some((check) => check.category === 'publish_contract')).toBe(true);
    expect(checks.some((check) => check.category === 'llm_readiness')).toBe(true);
    expect(checks.some((check) => check.category === 'claim_discipline')).toBe(true);
    expect(checks.some((check) => check.category === 'semantic_quality')).toBe(true);
    expect(checks.filter((check) => !check.passed)).toEqual([]);
  });

  it('blocks stale time-sensitive language and mixed terminology without clarification', () => {
    const issues = getContentPublishIssues({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

This article gives practical advice right now.

## What to do first

- One
- Two
- Three

## How to scope baseline checks

Read [topic context](/blog/topic/ai_search_readiness).

Today, GEO and AI SEO are both used throughout this guide.
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Hero image',
      },
      updated_at: '2025-01-01T00:00:00.000Z',
      published_at: null,
    });

    expect(issues).toContain(
      'Article uses time-sensitive phrasing but appears stale; update content date or remove time-bound wording.'
    );
    expect(issues).toContain(
      'Terminology is mixed without clarification; define one primary term and explain aliases once.'
    );
  });

  it('blocks quantified claims without external citation links', () => {
    const issues = getContentPublishIssues({
      content_type: 'article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'approved',
      topic_cluster: 'ai_search_readiness',
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['https://example.com/research'],
      draft_markdown: `# Article

This article gives practical advice.

## What to do first

- One
- Two
- Three

## How to scope baseline checks

Read [topic context](/blog/topic/ai_search_readiness).

Citation rate improved by 25% in 2026.
`,
      canonical_url: null,
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
        hero_image_url: 'https://cdn.example.com/hero.png',
        hero_image_alt: 'Hero image',
      },
      published_at: null,
    });

    expect(issues).toContain(
      'Add at least one external citation link in-body when making quantified/date-specific claims.'
    );
  });
});
