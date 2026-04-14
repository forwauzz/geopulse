import { describe, expect, it } from 'vitest';
import { buildContentLaunchReadiness } from './content-launch-readiness';

describe('buildContentLaunchReadiness', () => {
  it('summarizes blog launch threshold and article failures', async () => {
    const listRows = {
      article: [
        {
          id: '1',
          content_id: 'a1',
          slug: 'article-1',
          title: 'Article 1',
          status: 'published',
          content_type: 'article',
          target_persona: null,
          primary_problem: null,
          topic_cluster: 'ai_search_readiness',
          cta_goal: 'free_scan',
          canonical_url: '/blog/article-1',
          published_at: '2026-03-31T00:00:00.000Z',
          created_at: '2026-03-31T00:00:00.000Z',
          updated_at: '2026-03-31T00:00:00.000Z',
          delivery_count: 0,
          published_delivery_count: 0,
          latest_delivery_destination: null,
          latest_delivery_status: null,
        },
        {
          id: '2',
          content_id: 'a2',
          slug: 'article-2',
          title: 'Article 2',
          status: 'published',
          content_type: 'article',
          target_persona: null,
          primary_problem: null,
          topic_cluster: 'ai_search_readiness',
          cta_goal: 'free_scan',
          canonical_url: '/blog/article-2',
          published_at: '2026-03-31T00:00:00.000Z',
          created_at: '2026-03-31T00:00:00.000Z',
          updated_at: '2026-03-31T00:00:00.000Z',
          delivery_count: 0,
          published_delivery_count: 0,
          latest_delivery_destination: null,
          latest_delivery_status: null,
        },
        {
          id: '3',
          content_id: 'a3',
          slug: 'article-3',
          title: 'Article 3',
          status: 'published',
          content_type: 'article',
          target_persona: null,
          primary_problem: null,
          topic_cluster: 'citation_readiness',
          cta_goal: 'free_scan',
          canonical_url: '/blog/article-3',
          published_at: '2026-03-31T00:00:00.000Z',
          created_at: '2026-03-31T00:00:00.000Z',
          updated_at: '2026-03-31T00:00:00.000Z',
          delivery_count: 0,
          published_delivery_count: 0,
          latest_delivery_destination: null,
          latest_delivery_status: null,
        },
      ],
      research_note: [
        {
          id: '4',
          content_id: 'topic-page-ai_search_readiness',
          slug: 'topic-ai_search_readiness',
          title: 'Topic page',
          status: 'published',
          content_type: 'research_note',
          target_persona: null,
          primary_problem: null,
          topic_cluster: 'ai_search_readiness',
          cta_goal: 'free_scan',
          canonical_url: null,
          published_at: '2026-03-31T00:00:00.000Z',
          created_at: '2026-03-31T00:00:00.000Z',
          updated_at: '2026-03-31T00:00:00.000Z',
          delivery_count: 0,
          published_delivery_count: 0,
          latest_delivery_destination: null,
          latest_delivery_status: null,
        },
      ],
    };

    const details: Record<string, any> = {
      a1: {
        content_id: 'a1',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'published',
        slug: 'article-1',
        topic_cluster: 'ai_search_readiness',
        draft_markdown:
          '# Title\n\nThis article explains the topic clearly enough for launch readiness and gives operators a usable opening.\n\n## What to check first\n\n- One\n- Two\n- Three\n\n## Why it matters\n\nMore context.',
        source_links: ['https://example.com'],
        cta_goal: 'free_scan',
      },
      a2: {
        content_id: 'a2',
        title: 'Why Schema Is Necessary but Not Sufficient',
        status: 'published',
        slug: 'article-2',
        topic_cluster: 'ai_search_readiness',
        draft_markdown:
          '# Title\n\nThis article also has a strong enough opening paragraph to pass launch checks for the first blog launch.\n\n## What to do\n\n- One\n- Two\n- Three',
        source_links: ['https://example.com'],
        cta_goal: 'free_scan',
      },
      a3: {
        content_id: 'a3',
        title: 'What Makes a Site Easy to Cite',
        status: 'published',
        slug: 'article-3',
        topic_cluster: 'citation_readiness',
        draft_markdown:
          '# Title\n\nThis article also has a strong enough opening paragraph to pass launch checks for the first blog launch.\n\n## What to do\n\n- One\n- Two\n- Three',
        source_links: ['https://example.com'],
        cta_goal: 'free_scan',
      },
    };

    const contentAdminData = {
      async getRecentContentItems(filters?: { contentType?: string | null; status?: string | null }) {
        return filters?.contentType === 'research_note' ? listRows.research_note : listRows.article;
      },
      async getContentItemDetail(contentId: string) {
        return details[contentId] ?? null;
      },
    };

    const result = await buildContentLaunchReadiness(contentAdminData as any);

    expect(result.summary).toEqual({
      publishedArticleCount: 3,
      publishedTopicPageCount: 1,
      connectedPublishedTopicCount: 1,
      readyArticleCount: 3,
      meetsLaunchThreshold: true,
    });
  });
});
