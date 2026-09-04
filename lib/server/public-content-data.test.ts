import { describe, expect, it, vi } from 'vitest';
import { createPublicContentData } from './public-content-data';

describe('createPublicContentData', () => {
  it('keeps older published articles across multiple database pages', async () => {
    const articles = Array.from({ length: 101 }, (_, index) => ({
      id: `item-${index}`, content_id: `article-${index}`, slug: `article-${index}`,
      title: `Article ${index}`, cta_goal: 'free_scan',
      topic_cluster: index >= 50 ? 'older_topic' : 'newer_topic',
      published_at: '2026-09-03T12:00:00Z', updated_at: '2026-09-03T12:00:00Z',
      draft_markdown: 'Published article body', metadata: {},
    }));
    const range = vi.fn(async (from: number, to: number) => ({
      data: articles.slice(from, to + 1), error: null,
    }));
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range,
      limit: (count: number) => Promise.resolve({ data: articles.slice(0, count), error: null }),
    };
    const rows = await createPublicContentData({ from: () => query } as any).getPublishedArticles();
    expect(rows.map((row) => row.id)).toEqual(articles.map((row) => row.id));
    expect(rows.at(-1)?.topic_cluster).toBe('older_topic');
    expect(range.mock.calls).toEqual([[0, 49], [50, 99], [100, 149]]);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(query.eq).toHaveBeenCalledWith('status', 'published');
    expect(query.eq).toHaveBeenCalledWith('content_type', 'article');
  });

  it('fails rather than emitting a partial inventory when a later page fails', async () => {
    const error = new Error('inventory page unavailable');
    const range = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 50 }, () => ({})), error: null })
      .mockResolvedValueOnce({ data: null, error });
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    await expect(createPublicContentData({ from: () => query } as any).getPublishedArticles())
      .rejects.toThrow('inventory page unavailable');
  });

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
          range() {
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

  it('returns deterministic fixture rows when E2E_BLOG_FIXTURE is enabled', async () => {
    const previous = process.env['E2E_BLOG_FIXTURE'];
    process.env['E2E_BLOG_FIXTURE'] = '1';

    try {
      const supabase = {
        from() {
          throw new Error('fixture mode should not query supabase');
        },
      } as any;

      const data = createPublicContentData(supabase);
      const rows = await data.getPublishedArticles();
      const detail = await data.getPublishedArticleBySlug('e2e-blog-dark-theme');

      expect(rows).toHaveLength(1);
      expect(rows[0]?.slug).toBe('e2e-blog-dark-theme');
      expect(detail?.title).toBe('E2E Blog Dark Theme Fixture');
      expect(detail?.topic_cluster).toBe('ai_search_readiness');
    } finally {
      if (typeof previous === 'string') {
        process.env['E2E_BLOG_FIXTURE'] = previous;
      } else {
        delete process.env['E2E_BLOG_FIXTURE'];
      }
    }
  });
});
