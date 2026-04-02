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
});
