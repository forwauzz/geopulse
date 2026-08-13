import { describe, expect, it } from 'vitest';
import {
  findRepeatedInstagramMedia,
  INSTAGRAM_REEL_VALIDATION_VERSION,
  validateInstagramVisualSafety,
} from './instagram-visual-safety';

function asset(assetType: 'single_image_post' | 'short_video_post', ctaUrl = 'https://getgeopulse.com/?utm_source=instagram') {
  return { asset_type: assetType, cta_url: ctaUrl } as never;
}

function reel(metadata: Record<string, unknown>) {
  return {
    media_kind: 'video',
    provider_ready_status: 'ready',
    metadata,
  } as never;
}

const completeMetadata = {
  width: 1080,
  height: 1920,
  safe_area_contract: 'reel_9x16_center_safe',
  has_audio: true,
  audio_track_count: 1,
  duration_seconds: 15,
  mobile_text_legible: true,
  spelling_checked: true,
  feed_preview_safe: true,
  grid_preview_safe: true,
  feed_preview_url: 'https://cdn.example/feed.jpg',
  grid_preview_url: 'https://cdn.example/grid.jpg',
  cta_checked: true,
  privacy_checked: true,
  factual_claims_checked: true,
  duplicate_media_checked: true,
  duplicate_media_match: false,
  template_rotation_checked: true,
  meta_preview_approved: true,
  meta_preview_approved_at: '2026-07-24T01:00:00Z',
  validation_version: INSTAGRAM_REEL_VALIDATION_VERSION,
  validated_at: '2026-07-24T01:00:00Z',
  validated_by: 'founder',
};

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
          reel(completeMetadata),
        ]
      )
    ).toEqual({ safe: true });
  });

  it('allows Jordan CI renders only after the deterministic crop suite passes', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({
          ...completeMetadata,
          meta_preview_approved: false,
          meta_preview_approved_at: '',
          renderer: 'github_actions_hyperframes',
          reels_preview_safe: true,
          crop_safe_zone_checked: true,
          automated_crop_suite_approved: true,
          automated_crop_suite_version: 'jordan-crop-suite-v2',
          production_validation_version: 'jordan-reel-v2',
        }),
      ])
    ).toEqual({ safe: true });
  });

  it('accepts the 26–30 second pacing contract produced by the Jordan CI renderer', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({
          ...completeMetadata,
          duration_seconds: 28,
          meta_preview_approved: false,
          meta_preview_approved_at: '',
          renderer: 'github_actions_hyperframes',
          reels_preview_safe: true,
          crop_safe_zone_checked: true,
          automated_crop_suite_approved: true,
          automated_crop_suite_version: 'jordan-crop-suite-v2',
          production_validation_version: 'jordan-reel-v2',
        }),
      ])
    ).toEqual({ safe: true });
  });

  it('does not extend the manual Reel pacing window without the CI attestation', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({ ...completeMetadata, duration_seconds: 28 }),
      ])
    ).toEqual({ safe: false, reason: 'reel_pacing_unverified' });
  });

  it('does not treat a generic automated renderer claim as Meta approval', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({
          ...completeMetadata,
          meta_preview_approved: false,
          meta_preview_approved_at: '',
          renderer: 'unknown',
          reels_preview_safe: true,
          crop_safe_zone_checked: true,
          automated_crop_suite_approved: true,
          automated_crop_suite_version: 'jordan-crop-suite-v2',
          production_validation_version: 'jordan-reel-v2',
        }),
      ])
    ).toEqual({ safe: false, reason: 'meta_preview_approval_required' });
  });

  it('blocks silent reels even when every visual preview passed', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({ ...completeMetadata, has_audio: false, audio_track_count: 0 }),
      ])
    ).toEqual({ safe: false, reason: 'reel_audio_required' });
  });

  it('blocks Reels that are too fast to read', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({ ...completeMetadata, duration_seconds: 9 }),
      ])
    ).toEqual({ safe: false, reason: 'reel_pacing_unverified' });
  });

  it('blocks unverified claims, privacy, CTA, and repetitive media', () => {
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({ ...completeMetadata, privacy_checked: false }),
      ])
    ).toEqual({ safe: false, reason: 'reel_content_safety_unverified' });
    expect(
      validateInstagramVisualSafety(asset('short_video_post'), [
        reel({ ...completeMetadata, duplicate_media_match: true }),
      ])
    ).toEqual({ safe: false, reason: 'reel_repetition_check_required' });
  });

  it('detects repeated media and overused templates', () => {
    expect(
      findRepeatedInstagramMedia(
        { mediaFingerprint: 'same', templateId: 'new' },
        [{ mediaFingerprint: 'same', templateId: 'old' }]
      )
    ).toBe('media');
    expect(
      findRepeatedInstagramMedia(
        { mediaFingerprint: 'fresh', templateId: 'template-a' },
        [
          { mediaFingerprint: 'one', templateId: 'template-a' },
          { mediaFingerprint: 'two', templateId: 'template-a' },
        ]
      )
    ).toBe('template');
  });
});
