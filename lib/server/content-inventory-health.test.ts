import { describe, expect, it } from 'vitest';
import {
  contentInventoryLookahead,
  evaluateContentInventoryHealth,
  REQUIRED_CONTENT_FORMATS,
  requiredContentFormatsForConnectedProviders,
} from './content-inventory-health';

describe('content inventory health', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
  const assets = REQUIRED_CONTENT_FORMATS
    .filter((format) => format !== 'blog:article')
    .map((format, index) => {
      const [provider_family, asset_type] = format.split(':');
      return { id: `asset-${index}`, provider_family, asset_type };
    });

  it('is healthy only with the full deliberate mix and a near-14-day horizon', () => {
    const jobs = assets.map((asset, index) => ({
      distribution_asset_id: asset.id,
      scheduled_for: index === assets.length - 1
        ? '2026-08-25T00:00:00.000Z'
        : '2026-08-13T00:00:00.000Z',
    }));
    expect(evaluateContentInventoryHealth({ now, jobs, assets, recentPublishedArticles: 1 }))
      .toMatchObject({ healthy: true, missingFormats: [] });
  });

  it('surfaces missing formats instead of blessing a nonempty queue', () => {
    expect(evaluateContentInventoryHealth({
      now,
      jobs: [{ distribution_asset_id: assets[0]!.id, scheduled_for: '2026-08-25T00:00:00.000Z' }],
      assets,
      recentPublishedArticles: 0,
    })).toMatchObject({
      healthy: false,
      reason: expect.stringContaining('missing_required_formats'),
    });
  });

  it('requires formats only for connected social providers plus the blog', () => {
    expect(requiredContentFormatsForConnectedProviders(['instagram'])).toEqual([
      'instagram:short_video_post',
      'instagram:carousel_post',
      'instagram:single_image_post',
      'blog:article',
    ]);
    expect(requiredContentFormatsForConnectedProviders(['instagram', 'linkedin']))
      .toEqual(REQUIRED_CONTENT_FORMATS);
  });

  it('queries beyond the 12-day floor by one full cadence interval', () => {
    expect(contentInventoryLookahead(now)).toBe('2026-08-28T00:00:00.000Z');
  });
});
