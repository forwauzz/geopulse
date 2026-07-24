import { describe, expect, it } from 'vitest';
import { validateInstagramVisualSafety } from './instagram-visual-safety';

function asset(assetType: 'single_image_post' | 'short_video_post') {
  return { asset_type: assetType } as never;
}

function reel(metadata: Record<string, unknown>) {
  return {
    media_kind: 'video',
    provider_ready_status: 'ready',
    metadata,
  } as never;
}

describe('Instagram visual safety', () => {
  it('does not add a preview requirement to normal feed images', () => {
    expect(validateInstagramVisualSafety(asset('single_image_post'), [])).toEqual({ safe: true });
  });

  it('blocks Reels until both the 9:16 contract and real Meta preview are approved', () => {
    expect(
      validateInstagramVisualSafety(
        asset('short_video_post'),
        [reel({ width: 1080, height: 1920, safe_area_contract: 'reel_9x16_center_safe' })]
      )
    ).toEqual({ safe: false, reason: 'meta_preview_approval_required' });
  });

  it('blocks a preview-approved Reel with unsafe dimensions', () => {
    expect(
      validateInstagramVisualSafety(
        asset('short_video_post'),
        [
          reel({
            width: 1080,
            height: 1350,
            safe_area_contract: 'reel_9x16_center_safe',
            meta_preview_approved: true,
            meta_preview_approved_at: '2026-07-24T01:00:00Z',
          }),
        ]
      )
    ).toEqual({ safe: false, reason: 'reel_requires_1080x1920' });
  });

  it('allows a full-size Reel only after the Meta preview approval is recorded', () => {
    expect(
      validateInstagramVisualSafety(
        asset('short_video_post'),
        [
          reel({
            width: 1080,
            height: 1920,
            safe_area_contract: 'reel_9x16_center_safe',
            meta_preview_approved: true,
            meta_preview_approved_at: '2026-07-24T01:00:00Z',
          }),
        ]
      )
    ).toEqual({ safe: true });
  });
});
