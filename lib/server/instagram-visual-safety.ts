import { ContentDestinationPublishError } from './content-destination-adapters';
import type {
  DistributionAssetMediaRow,
  DistributionAssetRow,
} from './distribution-engine-repository';

export type InstagramVisualSafetyResult =
  | { readonly safe: true }
  | { readonly safe: false; readonly reason: string };

function numberFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reels are fail-closed because Instagram shows the same 9:16 source through
 * multiple crops. Dimensions alone cannot prove that the feed/profile previews
 * are safe, so a real Meta Business Suite preview approval is also required.
 */
export function validateInstagramVisualSafety(
  asset: DistributionAssetRow,
  mediaRows: ReadonlyArray<DistributionAssetMediaRow>
): InstagramVisualSafetyResult {
  if (asset.asset_type !== 'short_video_post') return { safe: true };

  const video = mediaRows.find(
    (row) =>
      row.media_kind === 'video' &&
      (row.provider_ready_status === 'ready' || row.provider_ready_status === 'uploaded')
  );
  if (!video) return { safe: false, reason: 'reel_video_missing' };

  const width = numberFrom(video.metadata['width']);
  const height = numberFrom(video.metadata['height']);
  if (!width || !height || width < 1080 || height < 1920) {
    return { safe: false, reason: 'reel_requires_1080x1920' };
  }
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) > 0.01) {
    return { safe: false, reason: 'reel_requires_9x16' };
  }
  if (stringFrom(video.metadata['safe_area_contract']) !== 'reel_9x16_center_safe') {
    return { safe: false, reason: 'reel_safe_area_unverified' };
  }
  if (
    video.metadata['meta_preview_approved'] !== true ||
    stringFrom(video.metadata['meta_preview_approved_at']) === ''
  ) {
    return { safe: false, reason: 'meta_preview_approval_required' };
  }
  return { safe: true };
}

export function assertInstagramVisualSafety(
  asset: DistributionAssetRow,
  mediaRows: ReadonlyArray<DistributionAssetMediaRow>
): void {
  const result = validateInstagramVisualSafety(asset, mediaRows);
  if (result.safe) return;
  throw new ContentDestinationPublishError({
    message: `Instagram visual safety gate blocked publishing: ${result.reason}.`,
    providerName: 'instagram',
    retryable: false,
  });
}
