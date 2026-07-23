import { describe, expect, it, vi } from 'vitest';
import { publishInstagramAsset } from './instagram-publisher';

function response(body: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const account = {
  id: 'account-row',
  account_id: 'instagram_geopulse',
  provider_name: 'instagram',
  account_label: 'GEO-Pulse Instagram',
  external_account_id: 'ig-user-1',
  status: 'connected',
  default_audience_id: null,
  metadata: {},
  connected_by_user_id: null,
  last_verified_at: null,
  created_at: '2026-07-23T00:00:00Z',
  updated_at: '2026-07-23T00:00:00Z',
} as const;

const asset = {
  id: 'asset-row',
  asset_id: 'asset-1',
  content_item_id: 'content-1',
  source_type: 'content_item',
  source_key: 'source-1',
  asset_type: 'single_image_post',
  provider_family: 'instagram',
  title: 'AI visibility guide',
  body_markdown: null,
  body_plaintext: null,
  caption_text: 'A practical guide.',
  status: 'approved',
  cta_url: 'https://getgeopulse.com/?utm_source=instagram',
  metadata: {},
  created_by_user_id: null,
  approved_by_user_id: null,
  approved_at: null,
  created_at: '2026-07-23T00:00:00Z',
  updated_at: '2026-07-23T00:00:00Z',
} as const;

describe('Instagram publisher', () => {
  it('creates, waits for, publishes, and records a single image permalink', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-1' }))
      .mockResolvedValueOnce(response({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'media-1' }))
      .mockResolvedValueOnce(response({ permalink: 'https://www.instagram.com/p/media-1/' }));

    const result = await publishInstagramAsset({
      account: account as never,
      asset: asset as never,
      mediaRows: [
        {
          id: 'media-row',
          distribution_asset_id: 'asset-row',
          media_kind: 'image',
          storage_url: 'https://cdn.example.com/hero.jpg',
          mime_type: 'image/jpeg',
          alt_text: 'Clean GEO guide hero',
          caption: null,
          sort_order: 0,
          provider_ready_status: 'ready',
          metadata: {},
          created_at: '2026-07-23T00:00:00Z',
          updated_at: '2026-07-23T00:00:00Z',
        },
      ],
      accessToken: 'token',
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result).toMatchObject({
      providerPublicationId: 'media-1',
      destinationUrl: 'https://www.instagram.com/p/media-1/',
      status: 'published',
    });
    const createBody = String(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(createBody).toContain('image_url=https%3A%2F%2Fcdn.example.com%2Fhero.jpg');
    expect(createBody).toContain('utm_source%3Dinstagram');
  });
});
