import { ContentDestinationPublishError } from './content-destination-adapters';
import type {
  DistributionAccountRow,
  DistributionAssetMediaRow,
  DistributionAssetRow,
} from './distribution-engine-repository';
import { assertInstagramVisualSafety } from './instagram-visual-safety';

export type InstagramPublishResult = {
  readonly providerPublicationId: string;
  readonly destinationUrl: string | null;
  readonly status: 'published';
  readonly metadata: Record<string, unknown>;
};

type FetchLike = typeof fetch;

function graphBase(value: string | undefined): string {
  return (value?.trim() || 'https://graph.instagram.com/v25.0').replace(/\/+$/, '');
}

function readyMedia(rows: ReadonlyArray<DistributionAssetMediaRow>): DistributionAssetMediaRow[] {
  return rows
    .filter((row) => row.provider_ready_status === 'ready' || row.provider_ready_status === 'uploaded')
    .sort((a, b) => a.sort_order - b.sort_order);
}

function captionFor(asset: DistributionAssetRow): string {
  const base = asset.caption_text?.trim() || asset.body_plaintext?.trim() || asset.title?.trim() || '';
  const cta = asset.cta_url?.trim() || '';
  const combined = cta && !base.includes(cta) ? `${base}\n\n${cta}` : base;
  return combined.slice(0, 2200);
}

async function graphRequest(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Error below includes the provider body when it is not JSON.
  }
  if (!response.ok) {
    throw new ContentDestinationPublishError({
      message: `Instagram API request failed (${response.status}): ${text}`,
      providerName: 'instagram',
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return json;
}

function readId(json: Record<string, unknown>, step: string): string {
  const id = typeof json['id'] === 'string' ? json['id'].trim() : '';
  if (!id) {
    throw new ContentDestinationPublishError({
      message: `Instagram ${step} returned no id.`,
      providerName: 'instagram',
      retryable: false,
    });
  }
  return id;
}

async function createContainer(args: {
  fetchImpl: FetchLike;
  baseUrl: string;
  instagramUserId: string;
  accessToken: string;
  fields: Record<string, string>;
}): Promise<string> {
  const form = new URLSearchParams(args.fields);
  form.set('access_token', args.accessToken);
  const json = await graphRequest(
    args.fetchImpl,
    `${args.baseUrl}/${encodeURIComponent(args.instagramUserId)}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }
  );
  return readId(json, 'container creation');
}

async function waitUntilReady(args: {
  fetchImpl: FetchLike;
  baseUrl: string;
  containerId: string;
  accessToken: string;
  sleep: (ms: number) => Promise<void>;
}): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const url = new URL(`${args.baseUrl}/${encodeURIComponent(args.containerId)}`);
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', args.accessToken);
    const json = await graphRequest(args.fetchImpl, url.toString());
    const status = String(json['status_code'] ?? '').toUpperCase();
    if (status === 'FINISHED' || status === 'PUBLISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new ContentDestinationPublishError({
        message: `Instagram media container entered ${status}: ${String(json['status'] ?? '')}`,
        providerName: 'instagram',
        retryable: false,
      });
    }
    await args.sleep(5_000);
  }
  throw new ContentDestinationPublishError({
    message: 'Instagram media container did not become ready before the publish timeout.',
    providerName: 'instagram',
    retryable: true,
  });
}

export async function publishInstagramAsset(args: {
  readonly account: DistributionAccountRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly accessToken: string;
  readonly graphBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<InstagramPublishResult> {
  assertInstagramVisualSafety(args.asset, args.mediaRows);
  const instagramUserId =
    args.account.external_account_id?.trim() ||
    (typeof args.account.metadata['instagram_user_id'] === 'string'
      ? String(args.account.metadata['instagram_user_id']).trim()
      : '');
  if (!instagramUserId) {
    throw new ContentDestinationPublishError({
      message: 'Instagram account is missing its provider user id. Reconnect Instagram.',
      providerName: 'instagram',
      retryable: false,
    });
  }
  const accessToken = args.accessToken.trim();
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'Instagram account is missing an access token.',
      providerName: 'instagram',
      retryable: false,
    });
  }

  const media = readyMedia(args.mediaRows);
  const baseUrl = graphBase(args.graphBaseUrl);
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const caption = captionFor(args.asset);
  let containerId: string;

  if (args.asset.asset_type === 'single_image_post') {
    const image = media.find((row) => row.media_kind === 'image');
    if (
      !image?.storage_url.startsWith('https://') ||
      (image.mime_type !== 'image/jpeg' && !/\.jpe?g(?:\?|$)/i.test(image.storage_url))
    ) {
      throw new ContentDestinationPublishError({
        message: 'Instagram image publishing requires one public HTTPS JPEG image.',
        providerName: 'instagram',
        retryable: false,
      });
    }
    containerId = await createContainer({
      fetchImpl,
      baseUrl,
      instagramUserId,
      accessToken,
      fields: { image_url: image.storage_url, caption },
    });
  } else if (args.asset.asset_type === 'carousel_post') {
    const slides = media.filter(
      (row) => row.media_kind === 'carousel_slide' || row.media_kind === 'image'
    );
    if (slides.length < 2 || slides.length > 10) {
      throw new ContentDestinationPublishError({
        message: 'Instagram carousel publishing requires 2-10 provider-ready images.',
        providerName: 'instagram',
        retryable: false,
      });
    }
    if (
      slides.some(
        (slide) =>
          slide.mime_type !== 'image/jpeg' && !/\.jpe?g(?:\?|$)/i.test(slide.storage_url)
      )
    ) {
      throw new ContentDestinationPublishError({
        message: 'Every Instagram carousel slide must be a JPEG image.',
        providerName: 'instagram',
        retryable: false,
      });
    }
    const childIds: string[] = [];
    for (const slide of slides) {
      childIds.push(
        await createContainer({
          fetchImpl,
          baseUrl,
          instagramUserId,
          accessToken,
          fields: { image_url: slide.storage_url, is_carousel_item: 'true' },
        })
      );
    }
    containerId = await createContainer({
      fetchImpl,
      baseUrl,
      instagramUserId,
      accessToken,
      fields: { media_type: 'CAROUSEL', children: childIds.join(','), caption },
    });
  } else if (args.asset.asset_type === 'short_video_post') {
    const video = media.find((row) => row.media_kind === 'video');
    if (!video?.storage_url.startsWith('https://')) {
      throw new ContentDestinationPublishError({
        message: 'Instagram Reel publishing requires one public HTTPS video.',
        providerName: 'instagram',
        retryable: false,
      });
    }
    containerId = await createContainer({
      fetchImpl,
      baseUrl,
      instagramUserId,
      accessToken,
      fields: {
        media_type: 'REELS',
        video_url: video.storage_url,
        caption,
        share_to_feed: 'true',
      },
    });
  } else {
    throw new ContentDestinationPublishError({
      message: `Instagram does not support asset type ${args.asset.asset_type} in this runtime.`,
      providerName: 'instagram',
      retryable: false,
    });
  }

  await waitUntilReady({ fetchImpl, baseUrl, containerId, accessToken, sleep });
  const publishForm = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });
  const published = await graphRequest(
    fetchImpl,
    `${baseUrl}/${encodeURIComponent(instagramUserId)}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishForm.toString(),
    }
  );
  const mediaId = readId(published, 'publish');
  const permalinkUrl = new URL(`${baseUrl}/${encodeURIComponent(mediaId)}`);
  permalinkUrl.searchParams.set('fields', 'permalink');
  permalinkUrl.searchParams.set('access_token', accessToken);
  const permalinkResponse = await graphRequest(fetchImpl, permalinkUrl.toString());
  const permalink =
    typeof permalinkResponse['permalink'] === 'string'
      ? permalinkResponse['permalink'].trim() || null
      : null;

  return {
    providerPublicationId: mediaId,
    destinationUrl: permalink,
    status: 'published',
    metadata: {
      provider: 'instagram',
      container_id: containerId,
      media_id: mediaId,
      permalink,
    },
  };
}
