import { describe, expect, it } from 'vitest';
import { createContentAdminData } from './content-admin-data';

describe('createContentAdminData', () => {
  it('hydrates delivery counts and latest downstream state', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'content_items') {
          return {
            select() {
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
                    content_id: 'cm-001',
                    slug: 'ai-search-readiness-audit',
                    title: 'How to Audit Your Site for AI Search Readiness',
                    status: 'draft',
                    content_type: 'article',
                    target_persona: 'seo_consultants',
                    primary_problem: 'Teams do not know what to audit first.',
                    topic_cluster: 'ai_search_readiness',
                    cta_goal: 'free_scan',
                    canonical_url: null,
                    published_at: null,
                    created_at: '2026-03-31T10:00:00.000Z',
                    updated_at: '2026-03-31T12:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
            eq() {
              return this;
            },
            in() {
              return this;
            },
          };
        }

        if (table === 'content_distribution_deliveries') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'delivery-2',
                    content_item_id: 'item-1',
                    destination_type: 'newsletter',
                    destination_name: 'kit',
                    status: 'queued',
                    published_at: null,
                    created_at: '2026-03-31T13:00:00.000Z',
                  },
                  {
                    id: 'delivery-1',
                    content_item_id: 'item-1',
                    destination_type: 'newsletter',
                    destination_name: 'kit',
                    status: 'published',
                    published_at: '2026-03-31T11:00:00.000Z',
                    created_at: '2026-03-31T11:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    } as any;

    const rows = await createContentAdminData(supabase).getRecentContentItems();

    expect(rows).toEqual([
      {
        id: 'item-1',
        content_id: 'cm-001',
        slug: 'ai-search-readiness-audit',
        title: 'How to Audit Your Site for AI Search Readiness',
        status: 'draft',
        content_type: 'article',
        target_persona: 'seo_consultants',
        primary_problem: 'Teams do not know what to audit first.',
        topic_cluster: 'ai_search_readiness',
        cta_goal: 'free_scan',
        canonical_url: null,
        published_at: null,
        created_at: '2026-03-31T10:00:00.000Z',
        updated_at: '2026-03-31T12:00:00.000Z',
        delivery_count: 2,
        published_delivery_count: 1,
        latest_delivery_destination: 'kit',
        latest_delivery_status: 'queued',
      },
    ]);
  });

  it('loads one content item detail with deliveries', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'content_items') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'item-1',
                      content_id: 'ai-search-readiness-audit-article',
                      slug: 'ai-search-readiness-audit',
                      title: 'How to Audit Your Site for AI Search Readiness',
                      status: 'draft',
                      content_type: 'article',
                      target_persona: 'SEO consultants',
                      primary_problem: 'Teams do not know what to audit first.',
                      topic_cluster: 'ai_search_readiness',
                      keyword_cluster: null,
                      cta_goal: 'free_scan',
                      source_type: 'internal_plus_research',
                      source_links: ['PLAYBOOK/content-machine-drafts/article.md'],
                      brief_markdown: '# brief',
                      draft_markdown: '# article',
                      canonical_url: null,
                      metadata: null,
                      published_at: null,
                      created_at: '2026-03-31T10:00:00.000Z',
                      updated_at: '2026-03-31T12:00:00.000Z',
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'content_distribution_deliveries') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'delivery-1',
                    content_item_id: 'item-1',
                    destination_type: 'newsletter',
                    destination_name: 'kit',
                    status: 'queued',
                    published_at: null,
                    created_at: '2026-03-31T13:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    } as any;

    const row = await createContentAdminData(supabase).getContentItemDetail(
      'ai-search-readiness-audit-article'
    );

    expect(row).toEqual({
      id: 'item-1',
      content_id: 'ai-search-readiness-audit-article',
      slug: 'ai-search-readiness-audit',
      title: 'How to Audit Your Site for AI Search Readiness',
      status: 'draft',
      content_type: 'article',
      target_persona: 'SEO consultants',
      primary_problem: 'Teams do not know what to audit first.',
      topic_cluster: 'ai_search_readiness',
      keyword_cluster: null,
      cta_goal: 'free_scan',
      source_type: 'internal_plus_research',
      source_links: ['PLAYBOOK/content-machine-drafts/article.md'],
      brief_markdown: '# brief',
      draft_markdown: '# article',
      canonical_url: null,
      metadata: {},
      published_at: null,
      created_at: '2026-03-31T10:00:00.000Z',
      updated_at: '2026-03-31T12:00:00.000Z',
      deliveries: [
        {
          id: 'delivery-1',
          content_item_id: 'item-1',
          destination_type: 'newsletter',
          destination_name: 'kit',
          status: 'queued',
          published_at: null,
          created_at: '2026-03-31T13:00:00.000Z',
        },
      ],
    });
  });

  it('normalizes null text fields from legacy content rows', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'content_items') {
          return {
            select() {
              return this;
            },
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: 'item-2',
                      content_id: 'legacy-item',
                      slug: null,
                      title: null,
                      status: null,
                      content_type: 'research_note',
                      target_persona: null,
                      primary_problem: null,
                      topic_cluster: null,
                      keyword_cluster: null,
                      cta_goal: null,
                      source_type: null,
                      source_links: null,
                      brief_markdown: null,
                      draft_markdown: null,
                      canonical_url: null,
                      metadata: null,
                      published_at: null,
                      created_at: null,
                      updated_at: null,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (table === 'content_distribution_deliveries') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    } as any;

    const row = await createContentAdminData(supabase).getContentItemDetail('legacy-item');

    expect(row).toMatchObject({
      content_id: 'legacy-item',
      slug: '',
      title: '',
      status: '',
      cta_goal: '',
      source_type: '',
      brief_markdown: null,
      draft_markdown: null,
      created_at: '',
      updated_at: '',
      source_links: [],
      metadata: {},
    });
  });

  it('builds bounded blog drafting queue buckets', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'content_items') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  content_id: 'a1',
                  slug: 'topic-a-1',
                  title: 'Topic A 1',
                  status: 'brief',
                  topic_cluster: 'topic_a',
                  updated_at: '2026-04-03T10:00:00.000Z',
                },
                {
                  content_id: 'a2',
                  slug: 'topic-a-2',
                  title: 'Topic A 2',
                  status: 'brief',
                  topic_cluster: 'topic_a',
                  updated_at: '2026-04-03T09:00:00.000Z',
                },
                {
                  content_id: 'd1',
                  slug: 'topic-d-1',
                  title: 'Topic D 1',
                  status: 'draft',
                  topic_cluster: 'topic_d',
                  updated_at: '2026-04-03T08:00:00.000Z',
                },
                {
                  content_id: 'r1',
                  slug: 'topic-r-1',
                  title: 'Topic R 1',
                  status: 'review',
                  topic_cluster: 'topic_r',
                  updated_at: '2026-04-03T07:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const queue = await createContentAdminData(supabase).getArticleDraftQueue(1);

    expect(queue).toEqual({
      brief: [
        expect.objectContaining({
          content_id: 'a1',
          status: 'brief',
        }),
      ],
      draft: [
        expect.objectContaining({
          content_id: 'd1',
          status: 'draft',
        }),
      ],
      review: [
        expect.objectContaining({
          content_id: 'r1',
          status: 'review',
        }),
      ],
    });
  });

  it('filters drafting queue by owner and target week', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'content_items') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  content_id: 'a1',
                  slug: 'topic-a-1',
                  title: 'Topic A 1',
                  status: 'brief',
                  topic_cluster: 'topic_a',
                  metadata: { queue_owner: 'carine', queue_target_week: '2026-W14' },
                  updated_at: '2026-04-03T10:00:00.000Z',
                },
                {
                  content_id: 'a2',
                  slug: 'topic-a-2',
                  title: 'Topic A 2',
                  status: 'brief',
                  topic_cluster: 'topic_a',
                  metadata: { queue_owner: 'other', queue_target_week: '2026-W14' },
                  updated_at: '2026-04-03T09:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const queue = await createContentAdminData(supabase).getArticleDraftQueue(10, {
      owner: 'carine',
      targetWeek: '2026-W14',
    });

    expect(queue.brief).toHaveLength(1);
    expect(queue.brief[0]).toMatchObject({
      content_id: 'a1',
      queue_owner: 'carine',
      queue_target_week: '2026-W14',
    });
  });

  it('builds approved queue preview with owner/week filters', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'content_items') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  content_id: 'p1',
                  slug: 'post-1',
                  title: 'Post 1',
                  status: 'approved',
                  topic_cluster: 'topic_a',
                  metadata: { queue_owner: 'carine', queue_target_week: '2026-W14' },
                  updated_at: '2026-04-03T10:00:00.000Z',
                },
                {
                  content_id: 'p2',
                  slug: 'post-2',
                  title: 'Post 2',
                  status: 'approved',
                  topic_cluster: 'topic_b',
                  metadata: { queue_owner: 'other', queue_target_week: '2026-W14' },
                  updated_at: '2026-04-03T09:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const preview = await createContentAdminData(supabase).getApprovedArticleQueue(25, {
      owner: 'carine',
      targetWeek: '2026-W14',
    });

    expect(preview.totalFilteredCount).toBe(1);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      content_id: 'p1',
      status: 'approved',
      queue_owner: 'carine',
      queue_target_week: '2026-W14',
    });
  });
});
