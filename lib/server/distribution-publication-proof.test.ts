import { describe, expect, it } from 'vitest';
import { recordDistributionPublicationProof } from './distribution-publication-proof';

describe('recordDistributionPublicationProof', () => {
  it('marks the provider asset, canonical item, and SEO social derivative as published', async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

    const db = {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        let updatePayload: Record<string, unknown> | null = null;
        const query: any = {
          select() {
            return query;
          },
          update(payload: Record<string, unknown>) {
            updatePayload = payload;
            return query;
          },
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return query;
          },
          order() {
            return query;
          },
          limit() {
            if (table === 'content_distribution_deliveries') {
              return Promise.resolve({ data: [], error: null });
            }
            return query;
          },
          maybeSingle() {
            if (table === 'content_items') {
              return Promise.resolve({
                data: {
                  id: 'social-1',
                  content_id: 'seo-agent:topic:instagram',
                  content_type: 'social_post',
                  metadata: { seo_opportunity_id: 'opp-1' },
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: (value: unknown) => void) {
            if (updatePayload) {
              updates.push({ table, payload: updatePayload, filters });
            }
            resolve({ error: null });
          },
        };
        return query;
      },
    };

    const result = await recordDistributionPublicationProof({
      db,
      account: {
        id: 'account-1',
        account_id: 'instagram-main',
        provider_name: 'instagram',
        account_label: 'Instagram',
        external_account_id: null,
        status: 'connected',
        default_audience_id: null,
        metadata: {},
        connected_by_user_id: null,
        last_verified_at: null,
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
      },
      asset: {
        id: 'asset-1',
        asset_id: 'asset-one',
        content_item_id: 'article-1',
        source_type: 'content_item',
        source_key: null,
        asset_type: 'single_image_post',
        provider_family: 'instagram',
        title: 'Guide',
        body_markdown: null,
        body_plaintext: null,
        caption_text: 'Guide',
        status: 'approved',
        cta_url: null,
        metadata: {},
        created_by_user_id: null,
        approved_by_user_id: null,
        approved_at: null,
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
      },
      job: {
        id: 'job-1',
        job_id: 'job-one',
        distribution_asset_id: 'asset-1',
        distribution_account_id: 'account-1',
        publish_mode: 'publish_now',
        scheduled_for: null,
        status: 'processing',
        destination_url: null,
        provider_post_id: null,
        last_error: null,
        created_by_user_id: null,
        completed_at: null,
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
      },
      contentItem: {
        id: 'article-1',
        content_id: 'seo-agent:topic',
        content_type: 'article',
        metadata: { seo_opportunity_id: 'opp-1' },
      },
      destinationPostId: 'ig-post-1',
      destinationUrl: 'https://instagram.com/p/ig-post-1',
      publishedAt: '2026-07-26T12:00:00.000Z',
    });

    expect(result).toEqual({ contentItemsPublished: 1 });
    expect(updates.filter((row) => row.table === 'content_items')).toHaveLength(1);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'distribution_assets',
        payload: { status: 'published' },
      }),
      expect.objectContaining({
        table: 'content_items',
        payload: expect.objectContaining({ status: 'published' }),
      }),
    ]));
    expect(inserts.filter((row) => row.table === 'content_distribution_deliveries')).toHaveLength(2);
  });
});
