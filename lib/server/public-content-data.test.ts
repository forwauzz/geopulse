import { describe, expect, it } from 'vitest';
import { createPublicContentData } from './public-content-data';

describe('createPublicContentData', () => {
  it('returns published articles with derived excerpts', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('content_items');
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'item-1',
                  content_id: 'ai-search-readiness-audit-article',
                  slug: 'ai-search-readiness-audit',
                  title: 'How to Audit Your Site for AI Search Readiness',
                  target_persona: 'SEO consultants',
                  primary_problem: 'Teams do not know what to audit first.',
                  topic_cluster: 'ai_search_readiness',
                  cta_goal: 'free_scan',
                  canonical_url: '/blog/ai-search-readiness-audit',
                  published_at: '2026-03-31T12:00:00.000Z',
                  updated_at: '2026-03-31T12:30:00.000Z',
                  draft_markdown: '# Heading\n\nThis is the article body.',
                  metadata: {
                    hero_image_url: 'https://cdn.example.com/hero.jpg',
                  },
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const rows = await createPublicContentData(supabase).getPublishedArticles();

    expect(rows).toEqual([
      {
        id: 'item-1',
        content_id: 'ai-search-readiness-audit-article',
        slug: 'ai-search-readiness-audit',
        title: 'How to Audit Your Site for AI Search Readiness',
        target_persona: 'SEO consultants',
        primary_problem: 'Teams do not know what to audit first.',
        topic_cluster: 'ai_search_readiness',
        cta_goal: 'free_scan',
        canonical_url: '/blog/ai-search-readiness-audit',
        published_at: '2026-03-31T12:00:00.000Z',
        updated_at: '2026-03-31T12:30:00.000Z',
        excerpt: 'Heading This is the article body.',
        metadata: {
          hero_image_url: 'https://cdn.example.com/hero.jpg',
        },
      },
    ]);
  });

  it('returns one published article detail by slug', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('content_items');
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'item-1',
                content_id: 'ai-search-readiness-audit-article',
                slug: 'ai-search-readiness-audit',
                title: 'How to Audit Your Site for AI Search Readiness',
                target_persona: 'SEO consultants',
                primary_problem: 'Teams do not know what to audit first.',
                topic_cluster: 'ai_search_readiness',
                keyword_cluster: null,
                cta_goal: 'free_scan',
                source_links: ['https://example.com/source'],
                draft_markdown: '# Heading\n\nThis is the article body.',
                canonical_url: '/blog/ai-search-readiness-audit',
                metadata: {
                  author_name: 'Carine Tamon',
                  author_role: 'Founder',
                },
                published_at: '2026-03-31T12:00:00.000Z',
                updated_at: '2026-03-31T12:30:00.000Z',
              },
              error: null,
            });
          },
        };
      },
    } as any;

    const row = await createPublicContentData(supabase).getPublishedArticleBySlug(
      'ai-search-readiness-audit'
    );

    expect(row).toEqual({
      id: 'item-1',
      content_id: 'ai-search-readiness-audit-article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      target_persona: 'SEO consultants',
      primary_problem: 'Teams do not know what to audit first.',
      topic_cluster: 'ai_search_readiness',
      keyword_cluster: null,
      cta_goal: 'free_scan',
      source_links: ['https://example.com/source'],
      draft_markdown: '# Heading\n\nThis is the article body.',
      canonical_url: '/blog/ai-search-readiness-audit',
      metadata: {
        author_name: 'Carine Tamon',
        author_role: 'Founder',
      },
      published_at: '2026-03-31T12:00:00.000Z',
      updated_at: '2026-03-31T12:30:00.000Z',
    });
  });
});
