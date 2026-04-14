import type { PaymentApiEnv } from '@/lib/server/cf-env';
import {
  ContentDestinationPublishError,
  resolveContentDestinationAdapter,
} from '@/lib/server/content-destination-adapters';
import { refreshSocialOAuthToken } from '@/lib/server/distribution-social-oauth';
import { structuredError, structuredLog } from '@/lib/server/structured-log';
import {
  createDistributionEngineRepository,
  type DistributionAccountRow,
  type DistributionAccountTokenRow,
  type DistributionAssetRow,
  type DistributionAssetMediaRow,
  type DistributionJobRow,
} from '@/lib/server/distribution-engine-repository';

type SupabaseLike = {
  from(table: string): any;
};

type DispatchSummary = {
  readonly scanned: number;
  readonly dispatched: number;
  readonly succeeded: number;
  readonly failed: number;
};

export type { DispatchSummary };

type DispatchFailureDetails = {
  readonly message: string;
  readonly retryable: boolean;
  readonly providerStatusCode: number | null;
  readonly retryAfterMs: number | null;
};

type DispatchDependencies = {
  readonly createRepository?: typeof createDistributionEngineRepository;
  readonly resolveAdapter?: typeof resolveContentDestinationAdapter;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
  readonly publishXSingleImagePost?: typeof publishXSingleImagePost;
  readonly publishXShortVideoPost?: typeof publishXShortVideoPost;
  readonly publishXLongVideoPost?: typeof publishXLongVideoPost;
  readonly publishLinkedInSingleImagePost?: typeof publishLinkedInSingleImagePost;
  readonly publishLinkedInCarouselPost?: typeof publishLinkedInCarouselPost;
  readonly publishLinkedInShortVideoPost?: typeof publishLinkedInShortVideoPost;
  readonly publishLinkedInLongVideoPost?: typeof publishLinkedInLongVideoPost;
};

type DispatchableContentRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly keyword_cluster: string | null;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly source_links: string[];
  readonly brief_markdown: string | null;
  readonly draft_markdown: string | null;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deliveries: unknown[];
};

type PublishResult = {
  readonly providerPublicationId: string;
  readonly destinationUrl: string | null;
  readonly status: 'drafted' | 'published' | 'queued';
  readonly metadata: Record<string, unknown>;
};

function buildSyntheticDestination(account: DistributionAccountRow) {
  const destinationType =
    account.provider_name === 'buttondown' || account.provider_name === 'kit' || account.provider_name === 'ghost'
      ? 'newsletter'
      : 'social';

  return {
    id: account.id,
    destination_key: `${account.provider_name}_${account.account_id}`,
    destination_type: destinationType,
    provider_name: account.provider_name,
    display_name: account.account_label,
    enabled: true,
    is_default: false,
    requires_paid_plan: false,
    supports_api_publish: true,
    supports_scheduling: true,
    supports_public_archive: false,
    plan_tier: null,
    availability_status: 'available',
    availability_reason: null,
    metadata: account.metadata ?? {},
    created_at: account.created_at,
    updated_at: account.updated_at,
  } as const;
}

function classifyDispatchError(error: unknown): DispatchFailureDetails {
  if (error instanceof ContentDestinationPublishError) {
    return {
      message: error.message,
      retryable: error.retryable,
      providerStatusCode: error.statusCode,
      retryAfterMs: null,
    };
  }

  if (error instanceof TypeError) {
    return {
      message: error.message || 'Network failure during distribution dispatch.',
      retryable: true,
      providerStatusCode: null,
      retryAfterMs: null,
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown dispatch failure';
  return {
    message,
    retryable: false,
    providerStatusCode: null,
    retryAfterMs: null,
  };
}

export function isRetryableDistributionDispatchError(error: unknown): boolean {
  return classifyDispatchError(error).retryable;
}

async function getDispatchableContentItem(
  supabase: SupabaseLike,
  distributionAsset: DistributionAssetRow
): Promise<DispatchableContentRow | null> {
  if (!distributionAsset.content_item_id) return null;

  const { data, error } = await supabase
    .from('content_items')
    .select(
      'id,content_id,slug,title,status,content_type,target_persona,primary_problem,topic_cluster,keyword_cluster,cta_goal,source_type,source_links,brief_markdown,draft_markdown,canonical_url,metadata,published_at,created_at,updated_at'
    )
    .eq('id', distributionAsset.content_item_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...(data as Omit<DispatchableContentRow, 'source_links' | 'metadata' | 'deliveries'>),
    source_links: Array.isArray((data as Record<string, unknown>).source_links)
      ? ((data as Record<string, unknown>).source_links as string[])
      : [],
    metadata:
      (data as Record<string, unknown>).metadata &&
      typeof (data as Record<string, unknown>).metadata === 'object' &&
      !Array.isArray((data as Record<string, unknown>).metadata)
        ? ((data as Record<string, unknown>).metadata as Record<string, unknown>)
        : {},
    deliveries: [],
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickPreferredToken(
  tokens: ReadonlyArray<DistributionAccountTokenRow>
): DistributionAccountTokenRow | null {
  if (tokens.length === 0) return null;
  const order: Record<string, number> = {
    oauth: 0,
    bearer_token: 1,
    api_key: 2,
    session_token: 3,
  };

  const sorted = [...tokens].sort((a, b) => {
    const left = order[a.token_type] ?? 99;
    const right = order[b.token_type] ?? 99;
    if (left !== right) return left - right;
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });

  return sorted[0] ?? null;
}

function resolveProviderRuntimeEnv(
  env: PaymentApiEnv,
  account: DistributionAccountRow,
  token: DistributionAccountTokenRow | null
): PaymentApiEnv {
  if (!token) return env;

  const accessToken = readString(token.access_token_encrypted);
  const metadata = token.metadata ?? {};
  const accountMetadata = account.metadata ?? {};

  if (account.provider_name === 'x') {
    return {
      ...env,
      X_ACCESS_TOKEN: accessToken ?? env.X_ACCESS_TOKEN,
    };
  }

  if (account.provider_name === 'linkedin') {
    const metadataAuthorUrn = readString((metadata as Record<string, unknown>)['author_urn']);
    const accountAuthorUrn = readString((accountMetadata as Record<string, unknown>)['author_urn']);
    return {
      ...env,
      LINKEDIN_ACCESS_TOKEN: accessToken ?? env.LINKEDIN_ACCESS_TOKEN,
      LINKEDIN_AUTHOR_URN: metadataAuthorUrn ?? accountAuthorUrn ?? env.LINKEDIN_AUTHOR_URN,
    };
  }

  return env;
}

function requiresTokenRuntime(providerName: DistributionAccountRow['provider_name']): boolean {
  return providerName === 'x' || providerName === 'linkedin';
}

function requiresMediaAttachments(assetType: DistributionAssetRow['asset_type']): boolean {
  return (
    assetType === 'single_image_post' ||
    assetType === 'carousel_post' ||
    assetType === 'short_video_post' ||
    assetType === 'long_video_post'
  );
}

function hasProviderReadyMedia(mediaRows: ReadonlyArray<DistributionAssetMediaRow>): boolean {
  return mediaRows.some(
    (media) => media.provider_ready_status === 'ready' || media.provider_ready_status === 'uploaded'
  );
}

function pickProviderReadyMedia(
  mediaRows: ReadonlyArray<DistributionAssetMediaRow>
): DistributionAssetMediaRow[] {
  return mediaRows.filter(
    (media) => media.provider_ready_status === 'ready' || media.provider_ready_status === 'uploaded'
  );
}

function trimToLength(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return maxChars > 1 ? `${value.slice(0, maxChars - 1).trimEnd()}…` : value.slice(0, maxChars);
}

function buildLinkedInCaption(item: DispatchableContentRow): string {
  const parts = [item.title, item.canonical_url ?? ''].filter((part) => part.trim().length > 0);
  return trimToLength(parts.join('\n\n').trim(), 3000);
}

function isRetryableLinkedInFailure(status: number, errorText: string): boolean {
  if (status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  const normalized = errorText.trim().toLowerCase();
  return (
    normalized.includes('rate limit') ||
    normalized.includes('throttle') ||
    normalized.includes('too many requests')
  );
}

function isRetryableXFailure(status: number, errorText: string): boolean {
  if (status === 429 || status >= 500) return true;
  const normalized = errorText.trim().toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('too many requests');
}

function buildXPostText(item: DispatchableContentRow, asset: DistributionAssetRow): string {
  const title = (asset.title ?? item.title).trim();
  const canonical = (item.canonical_url ?? '').trim();
  const combined = [title, canonical].filter((part) => part.length > 0).join('\n\n');
  return trimToLength(combined, 280);
}

async function publishXSingleImagePost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  const accessToken = args.env.X_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'X_ACCESS_TOKEN is missing.',
      providerName: 'x',
      retryable: false,
    });
  }

  const readyMedia = pickProviderReadyMedia(args.mediaRows).find((media) => media.media_kind === 'image') ?? null;
  if (!readyMedia) {
    throw new ContentDestinationPublishError({
      message: 'X single-image publish requires at least one provider-ready image media row.',
      providerName: 'x',
      retryable: false,
    });
  }

  const mediaResponse = await fetch(readyMedia.storage_url);
  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new ContentDestinationPublishError({
      message: `X media fetch failed (${mediaResponse.status}): ${errorText}`,
      providerName: 'x',
      statusCode: mediaResponse.status,
      retryable: mediaResponse.status >= 500,
    });
  }
  const mediaBuffer = await mediaResponse.arrayBuffer();
  const mediaContentType = readyMedia.mime_type?.trim() || mediaResponse.headers.get('content-type') || 'image/png';

  const apiBase = (args.env.X_API_BASE_URL?.trim() || 'https://api.x.com').replace(/\/+$/, '');
  const uploadResponse = await fetch(`${apiBase}/2/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mediaContentType,
    },
    body: mediaBuffer,
  });
  const uploadText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `X media upload failed (${uploadResponse.status}): ${uploadText}`,
      providerName: 'x',
      statusCode: uploadResponse.status,
      retryable: isRetryableXFailure(uploadResponse.status, uploadText),
    });
  }

  let mediaId = '';
  if (uploadText.trim().length > 0) {
    try {
      const json = JSON.parse(uploadText) as Record<string, unknown>;
      const fromTop = json['media_id_string'];
      const fromData = (json['data'] as Record<string, unknown> | undefined)?.['id'];
      mediaId =
        typeof fromTop === 'string'
          ? fromTop.trim()
          : typeof fromData === 'string'
            ? fromData.trim()
            : '';
    } catch {
      mediaId = '';
    }
  }
  if (!mediaId) {
    throw new ContentDestinationPublishError({
      message: 'X media upload succeeded but no media id was returned.',
      providerName: 'x',
      retryable: false,
    });
  }

  const postResponse = await fetch(`${apiBase}/2/tweets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      text: buildXPostText(args.item, args.asset),
      media: { media_ids: [mediaId] },
    }),
  });
  const postText = await postResponse.text();
  if (!postResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `X publish failed (${postResponse.status}): ${postText}`,
      providerName: 'x',
      statusCode: postResponse.status,
      retryable: isRetryableXFailure(postResponse.status, postText),
    });
  }

  let tweetId = '';
  if (postText.trim().length > 0) {
    try {
      const json = JSON.parse(postText) as Record<string, unknown>;
      const data = json['data'] as Record<string, unknown> | undefined;
      tweetId = typeof data?.['id'] === 'string' ? String(data['id']).trim() : '';
    } catch {
      tweetId = '';
    }
  }
  if (!tweetId) {
    throw new ContentDestinationPublishError({
      message: 'X publish succeeded but no tweet id was returned.',
      providerName: 'x',
      retryable: false,
    });
  }

  return {
    providerPublicationId: tweetId,
    destinationUrl: `https://x.com/i/web/status/${tweetId}`,
    status: 'published',
    metadata: {
      provider: 'x',
      media_id: mediaId,
      media_storage_url: readyMedia.storage_url,
    },
  };
}

async function publishXShortVideoPost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  const accessToken = args.env.X_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'X_ACCESS_TOKEN is missing.',
      providerName: 'x',
      retryable: false,
    });
  }

  const readyVideo = pickProviderReadyMedia(args.mediaRows).find((media) => media.media_kind === 'video') ?? null;
  if (!readyVideo) {
    throw new ContentDestinationPublishError({
      message: 'X short-video publish requires at least one provider-ready video media row.',
      providerName: 'x',
      retryable: false,
    });
  }

  const mediaResponse = await fetch(readyVideo.storage_url);
  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new ContentDestinationPublishError({
      message: `X media fetch failed (${mediaResponse.status}): ${errorText}`,
      providerName: 'x',
      statusCode: mediaResponse.status,
      retryable: mediaResponse.status >= 500,
    });
  }
  const mediaBuffer = await mediaResponse.arrayBuffer();
  const mediaContentType = readyVideo.mime_type?.trim() || mediaResponse.headers.get('content-type') || 'video/mp4';

  const apiBase = (args.env.X_API_BASE_URL?.trim() || 'https://api.x.com').replace(/\/+$/, '');
  const uploadResponse = await fetch(`${apiBase}/2/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mediaContentType,
    },
    body: mediaBuffer,
  });
  const uploadText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `X media upload failed (${uploadResponse.status}): ${uploadText}`,
      providerName: 'x',
      statusCode: uploadResponse.status,
      retryable: isRetryableXFailure(uploadResponse.status, uploadText),
    });
  }

  let mediaId = '';
  if (uploadText.trim().length > 0) {
    try {
      const json = JSON.parse(uploadText) as Record<string, unknown>;
      const fromTop = json['media_id_string'];
      const fromData = (json['data'] as Record<string, unknown> | undefined)?.['id'];
      mediaId =
        typeof fromTop === 'string'
          ? fromTop.trim()
          : typeof fromData === 'string'
            ? fromData.trim()
            : '';
    } catch {
      mediaId = '';
    }
  }
  if (!mediaId) {
    throw new ContentDestinationPublishError({
      message: 'X media upload succeeded but no media id was returned.',
      providerName: 'x',
      retryable: false,
    });
  }

  const postResponse = await fetch(`${apiBase}/2/tweets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      text: buildXPostText(args.item, args.asset),
      media: { media_ids: [mediaId] },
    }),
  });
  const postText = await postResponse.text();
  if (!postResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `X publish failed (${postResponse.status}): ${postText}`,
      providerName: 'x',
      statusCode: postResponse.status,
      retryable: isRetryableXFailure(postResponse.status, postText),
    });
  }

  let tweetId = '';
  if (postText.trim().length > 0) {
    try {
      const json = JSON.parse(postText) as Record<string, unknown>;
      const data = json['data'] as Record<string, unknown> | undefined;
      tweetId = typeof data?.['id'] === 'string' ? String(data['id']).trim() : '';
    } catch {
      tweetId = '';
    }
  }
  if (!tweetId) {
    throw new ContentDestinationPublishError({
      message: 'X publish succeeded but no tweet id was returned.',
      providerName: 'x',
      retryable: false,
    });
  }

  return {
    providerPublicationId: tweetId,
    destinationUrl: `https://x.com/i/web/status/${tweetId}`,
    status: 'published',
    metadata: {
      provider: 'x',
      media_id: mediaId,
      media_storage_url: readyVideo.storage_url,
      media_kind: 'video',
    },
  };
}

async function publishXLongVideoPost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  return publishXShortVideoPost(args);
}

async function publishLinkedInSingleImagePost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  const accessToken = args.env.LINKEDIN_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_ACCESS_TOKEN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }
  const authorUrn = args.env.LINKEDIN_AUTHOR_URN?.trim() ?? '';
  if (!authorUrn) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_AUTHOR_URN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const readyMedia = pickProviderReadyMedia(args.mediaRows)[0] ?? null;
  if (!readyMedia) {
    throw new ContentDestinationPublishError({
      message:
        'LinkedIn single-image publish requires at least one provider-ready media row.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const mediaResponse = await fetch(readyMedia.storage_url);
  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new ContentDestinationPublishError({
      message: `LinkedIn media fetch failed (${mediaResponse.status}): ${errorText}`,
      providerName: 'linkedin',
      statusCode: mediaResponse.status,
      retryable: mediaResponse.status >= 500,
    });
  }
  const mediaBuffer = await mediaResponse.arrayBuffer();
  const mediaContentType = readyMedia.mime_type?.trim() || mediaResponse.headers.get('content-type') || 'application/octet-stream';

  const apiBase = (args.env.LINKEDIN_API_BASE_URL?.trim() || 'https://api.linkedin.com').replace(
    /\/+$/,
    ''
  );

  const registerResponse = await fetch(`${apiBase}/v2/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
        supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
      },
    }),
  });
  const registerText = await registerResponse.text();
  if (!registerResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn media register failed (${registerResponse.status}): ${registerText}`,
      providerName: 'linkedin',
      statusCode: registerResponse.status,
      retryable: isRetryableLinkedInFailure(registerResponse.status, registerText),
    });
  }

  const registerJson = JSON.parse(registerText) as Record<string, unknown>;
  const uploadMechanism = (registerJson['value'] as Record<string, unknown>)?.[
    'uploadMechanism'
  ] as Record<string, unknown> | undefined;
  const httpRequest = (uploadMechanism?.[
    'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
  ] as Record<string, unknown>) ?? null;
  const uploadUrl = typeof httpRequest?.['uploadUrl'] === 'string' ? String(httpRequest['uploadUrl']) : '';
  const assetUrn = typeof (registerJson['value'] as Record<string, unknown>)?.['asset'] === 'string'
    ? String((registerJson['value'] as Record<string, unknown>)['asset'])
    : '';

  if (!uploadUrl || !assetUrn) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn media register succeeded but upload URL or asset URN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mediaContentType,
    },
    body: mediaBuffer,
  });
  const uploadText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn media upload failed (${uploadResponse.status}): ${uploadText}`,
      providerName: 'linkedin',
      statusCode: uploadResponse.status,
      retryable: isRetryableLinkedInFailure(uploadResponse.status, uploadText),
    });
  }

  const postResponse = await fetch(`${apiBase}/v2/ugcPosts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: buildLinkedInCaption(args.item) },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              media: assetUrn,
              title: { text: trimToLength(args.asset.title ?? args.item.title, 200) },
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  });
  const postText = await postResponse.text();
  if (!postResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn publish failed (${postResponse.status}): ${postText}`,
      providerName: 'linkedin',
      statusCode: postResponse.status,
      retryable: isRetryableLinkedInFailure(postResponse.status, postText),
    });
  }

  let postId = postResponse.headers.get('x-restli-id')?.trim() ?? '';
  if (!postId && postText.trim().length > 0) {
    try {
      const json = JSON.parse(postText) as Record<string, unknown>;
      postId = typeof json['id'] === 'string' ? String(json['id']).trim() : '';
    } catch {
      postId = '';
    }
  }
  if (!postId) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn publish succeeded but no post id was returned.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  return {
    providerPublicationId: postId,
    destinationUrl: null,
    status: 'published',
    metadata: {
      provider: 'linkedin',
      media_asset_urn: assetUrn,
      media_storage_url: readyMedia.storage_url,
    },
  };
}

async function publishLinkedInCarouselPost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  const accessToken = args.env.LINKEDIN_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_ACCESS_TOKEN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }
  const authorUrn = args.env.LINKEDIN_AUTHOR_URN?.trim() ?? '';
  if (!authorUrn) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_AUTHOR_URN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const readyMedia = pickProviderReadyMedia(args.mediaRows).filter(
    (media) => media.media_kind === 'carousel_slide' || media.media_kind === 'image'
  );
  if (readyMedia.length < 2) {
    throw new ContentDestinationPublishError({
      message:
        'LinkedIn carousel publish requires at least two provider-ready image/carousel-slide media rows.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const apiBase = (args.env.LINKEDIN_API_BASE_URL?.trim() || 'https://api.linkedin.com').replace(
    /\/+$/,
    ''
  );

  const uploadedMedia: Array<{ assetUrn: string; storageUrl: string }> = [];
  for (const media of readyMedia) {
    const mediaResponse = await fetch(media.storage_url);
    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      throw new ContentDestinationPublishError({
        message: `LinkedIn media fetch failed (${mediaResponse.status}): ${errorText}`,
        providerName: 'linkedin',
        statusCode: mediaResponse.status,
        retryable: mediaResponse.status >= 500,
      });
    }
    const mediaBuffer = await mediaResponse.arrayBuffer();
    const mediaContentType =
      media.mime_type?.trim() || mediaResponse.headers.get('content-type') || 'application/octet-stream';

    const registerResponse = await fetch(`${apiBase}/v2/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          owner: authorUrn,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
          supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
        },
      }),
    });
    const registerText = await registerResponse.text();
    if (!registerResponse.ok) {
      throw new ContentDestinationPublishError({
        message: `LinkedIn media register failed (${registerResponse.status}): ${registerText}`,
        providerName: 'linkedin',
        statusCode: registerResponse.status,
        retryable: isRetryableLinkedInFailure(registerResponse.status, registerText),
      });
    }

    const registerJson = JSON.parse(registerText) as Record<string, unknown>;
    const uploadMechanism = (registerJson['value'] as Record<string, unknown>)?.[
      'uploadMechanism'
    ] as Record<string, unknown> | undefined;
    const httpRequest = (uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ] as Record<string, unknown>) ?? null;
    const uploadUrl = typeof httpRequest?.['uploadUrl'] === 'string' ? String(httpRequest['uploadUrl']) : '';
    const assetUrn =
      typeof (registerJson['value'] as Record<string, unknown>)?.['asset'] === 'string'
        ? String((registerJson['value'] as Record<string, unknown>)['asset'])
        : '';

    if (!uploadUrl || !assetUrn) {
      throw new ContentDestinationPublishError({
        message: 'LinkedIn media register succeeded but upload URL or asset URN is missing.',
        providerName: 'linkedin',
        retryable: false,
      });
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mediaContentType,
      },
      body: mediaBuffer,
    });
    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) {
      throw new ContentDestinationPublishError({
        message: `LinkedIn media upload failed (${uploadResponse.status}): ${uploadText}`,
        providerName: 'linkedin',
        statusCode: uploadResponse.status,
        retryable: isRetryableLinkedInFailure(uploadResponse.status, uploadText),
      });
    }

    uploadedMedia.push({
      assetUrn,
      storageUrl: media.storage_url,
    });
  }

  const postResponse = await fetch(`${apiBase}/v2/ugcPosts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: buildLinkedInCaption(args.item) },
          shareMediaCategory: 'IMAGE',
          media: uploadedMedia.map((media, index) => ({
            status: 'READY',
            media: media.assetUrn,
            title: {
              text: trimToLength(
                index === 0 ? args.asset.title ?? args.item.title : `${args.asset.title ?? args.item.title} ${index + 1}`,
                200
              ),
            },
          })),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  });
  const postText = await postResponse.text();
  if (!postResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn publish failed (${postResponse.status}): ${postText}`,
      providerName: 'linkedin',
      statusCode: postResponse.status,
      retryable: isRetryableLinkedInFailure(postResponse.status, postText),
    });
  }

  let postId = postResponse.headers.get('x-restli-id')?.trim() ?? '';
  if (!postId && postText.trim().length > 0) {
    try {
      const json = JSON.parse(postText) as Record<string, unknown>;
      postId = typeof json['id'] === 'string' ? String(json['id']).trim() : '';
    } catch {
      postId = '';
    }
  }
  if (!postId) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn publish succeeded but no post id was returned.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  return {
    providerPublicationId: postId,
    destinationUrl: null,
    status: 'published',
    metadata: {
      provider: 'linkedin',
      media_asset_urns: uploadedMedia.map((media) => media.assetUrn),
      media_storage_urls: uploadedMedia.map((media) => media.storageUrl),
    },
  };
}

async function publishLinkedInShortVideoPost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  const accessToken = args.env.LINKEDIN_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_ACCESS_TOKEN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }
  const authorUrn = args.env.LINKEDIN_AUTHOR_URN?.trim() ?? '';
  if (!authorUrn) {
    throw new ContentDestinationPublishError({
      message: 'LINKEDIN_AUTHOR_URN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const readyVideoMedia = pickProviderReadyMedia(args.mediaRows).filter(
    (media) => media.media_kind === 'video'
  );
  const videoMedia = readyVideoMedia[0] ?? null;
  if (!videoMedia) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn short-video publish requires at least one provider-ready video media row.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const mediaResponse = await fetch(videoMedia.storage_url);
  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    throw new ContentDestinationPublishError({
      message: `LinkedIn media fetch failed (${mediaResponse.status}): ${errorText}`,
      providerName: 'linkedin',
      statusCode: mediaResponse.status,
      retryable: mediaResponse.status >= 500,
    });
  }
  const mediaBuffer = await mediaResponse.arrayBuffer();
  const mediaContentType =
    videoMedia.mime_type?.trim() || mediaResponse.headers.get('content-type') || 'video/mp4';

  const apiBase = (args.env.LINKEDIN_API_BASE_URL?.trim() || 'https://api.linkedin.com').replace(
    /\/+$/,
    ''
  );

  const registerResponse = await fetch(`${apiBase}/v2/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
        supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
      },
    }),
  });
  const registerText = await registerResponse.text();
  if (!registerResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn media register failed (${registerResponse.status}): ${registerText}`,
      providerName: 'linkedin',
      statusCode: registerResponse.status,
      retryable: isRetryableLinkedInFailure(registerResponse.status, registerText),
    });
  }

  const registerJson = JSON.parse(registerText) as Record<string, unknown>;
  const uploadMechanism = (registerJson['value'] as Record<string, unknown>)?.[
    'uploadMechanism'
  ] as Record<string, unknown> | undefined;
  const httpRequest = (uploadMechanism?.[
    'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
  ] as Record<string, unknown>) ?? null;
  const uploadUrl = typeof httpRequest?.['uploadUrl'] === 'string' ? String(httpRequest['uploadUrl']) : '';
  const assetUrn =
    typeof (registerJson['value'] as Record<string, unknown>)?.['asset'] === 'string'
      ? String((registerJson['value'] as Record<string, unknown>)['asset'])
      : '';

  if (!uploadUrl || !assetUrn) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn media register succeeded but upload URL or asset URN is missing.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mediaContentType,
    },
    body: mediaBuffer,
  });
  const uploadText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn media upload failed (${uploadResponse.status}): ${uploadText}`,
      providerName: 'linkedin',
      statusCode: uploadResponse.status,
      retryable: isRetryableLinkedInFailure(uploadResponse.status, uploadText),
    });
  }

  const postResponse = await fetch(`${apiBase}/v2/ugcPosts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: buildLinkedInCaption(args.item) },
          shareMediaCategory: 'VIDEO',
          media: [
            {
              status: 'READY',
              media: assetUrn,
              title: { text: trimToLength(args.asset.title ?? args.item.title, 200) },
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  });
  const postText = await postResponse.text();
  if (!postResponse.ok) {
    throw new ContentDestinationPublishError({
      message: `LinkedIn publish failed (${postResponse.status}): ${postText}`,
      providerName: 'linkedin',
      statusCode: postResponse.status,
      retryable: isRetryableLinkedInFailure(postResponse.status, postText),
    });
  }

  let postId = postResponse.headers.get('x-restli-id')?.trim() ?? '';
  if (!postId && postText.trim().length > 0) {
    try {
      const json = JSON.parse(postText) as Record<string, unknown>;
      postId = typeof json['id'] === 'string' ? String(json['id']).trim() : '';
    } catch {
      postId = '';
    }
  }
  if (!postId) {
    throw new ContentDestinationPublishError({
      message: 'LinkedIn publish succeeded but no post id was returned.',
      providerName: 'linkedin',
      retryable: false,
    });
  }

  return {
    providerPublicationId: postId,
    destinationUrl: null,
    status: 'published',
    metadata: {
      provider: 'linkedin',
      media_asset_urn: assetUrn,
      media_storage_url: videoMedia.storage_url,
      media_kind: 'video',
    },
  };
}

async function publishLinkedInLongVideoPost(args: {
  readonly item: DispatchableContentRow;
  readonly asset: DistributionAssetRow;
  readonly mediaRows: ReadonlyArray<DistributionAssetMediaRow>;
  readonly env: PaymentApiEnv;
}): Promise<PublishResult> {
  return publishLinkedInShortVideoPost(args);
}

function pickBackoffWindowMs(
  providerName: DistributionAccountRow['provider_name'] | undefined,
  providerStatusCode: number | null,
  attemptNumber: number,
  options?: {
    readonly profile?: 'default' | 'aggressive' | 'conservative';
    readonly multiplier?: number | null;
  }
): number {
  const defaultWindows = [2 * 60_000, 5 * 60_000, 10 * 60_000, 20 * 60_000];
  const xRateLimitedWindows = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
  const xServerWindows = [2 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
  const linkedInRateWindows = [10 * 60_000, 20 * 60_000, 40 * 60_000, 60 * 60_000];
  const linkedInServerWindows = [3 * 60_000, 10 * 60_000, 20 * 60_000, 45 * 60_000];

  const idx = Math.max(0, attemptNumber - 1);
  const status = providerStatusCode ?? 0;

  let baseWindowMs =
    defaultWindows[idx] ?? defaultWindows[defaultWindows.length - 1]!;

  if (providerName === 'x') {
    if (status === 429) {
      baseWindowMs = xRateLimitedWindows[idx] ?? xRateLimitedWindows[xRateLimitedWindows.length - 1]!;
    } else if (status >= 500 || status === 0) {
      baseWindowMs = xServerWindows[idx] ?? xServerWindows[xServerWindows.length - 1]!;
    }
  }

  if (providerName === 'linkedin') {
    if (status === 429 || status === 403) {
      baseWindowMs = linkedInRateWindows[idx] ?? linkedInRateWindows[linkedInRateWindows.length - 1]!;
    } else if (status >= 500 || status === 0) {
      baseWindowMs = linkedInServerWindows[idx] ?? linkedInServerWindows[linkedInServerWindows.length - 1]!;
    }
  }

  const profileFactor =
    options?.profile === 'aggressive' ? 0.7 : options?.profile === 'conservative' ? 1.5 : 1;
  const multiplier =
    typeof options?.multiplier === 'number' && Number.isFinite(options.multiplier) && options.multiplier > 0
      ? Math.min(options.multiplier, 5)
      : 1;
  const adjusted = Math.round(baseWindowMs * profileFactor * multiplier);
  return Math.max(30_000, adjusted);
}

function readBackoffProfile(
  account: DistributionAccountRow | null
): 'default' | 'aggressive' | 'conservative' {
  const value = account?.metadata?.['retry_backoff_profile'];
  if (value === 'aggressive' || value === 'conservative') return value;
  return 'default';
}

function readBackoffMultiplier(account: DistributionAccountRow | null): number | null {
  const value = account?.metadata?.['retry_backoff_multiplier'];
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5) : null;
}

function parseTokenExpiryMs(token: DistributionAccountTokenRow | null): number | null {
  if (!token?.expires_at) return null;
  const parsed = Date.parse(token.expires_at);
  return Number.isFinite(parsed) ? parsed : null;
}

async function markAccountTokenExpired(
  repo: ReturnType<typeof createDistributionEngineRepository>,
  account: DistributionAccountRow,
  reason: string
): Promise<void> {
  await repo.upsertAccount({
    accountId: account.account_id,
    providerName: account.provider_name,
    accountLabel: account.account_label,
    externalAccountId: account.external_account_id,
    status: 'token_expired',
    defaultAudienceId: account.default_audience_id,
    connectedByUserId: account.connected_by_user_id,
    lastVerifiedAt: account.last_verified_at,
    metadata: {
      ...account.metadata,
      oauth_refresh_state: 'token_expired',
      oauth_refresh_failure_reason: reason,
      oauth_refresh_failed_at: new Date().toISOString(),
    },
  });
}

async function ensureActiveProviderToken(
  repo: ReturnType<typeof createDistributionEngineRepository>,
  env: PaymentApiEnv,
  account: DistributionAccountRow,
  token: DistributionAccountTokenRow | null
): Promise<DistributionAccountTokenRow | null> {
  if (!token || !requiresTokenRuntime(account.provider_name)) {
    return token;
  }
  if (account.provider_name !== 'x' && account.provider_name !== 'linkedin') {
    return token;
  }

  const expiresAtMs = parseTokenExpiryMs(token);
  if (!expiresAtMs) {
    return token;
  }

  const nowMs = Date.now();
  const skewMs = 60 * 1000;
  if (expiresAtMs > nowMs + skewMs) {
    return token;
  }

  const refreshToken = readString(token.refresh_token_encrypted);
  if (!refreshToken) {
    await markAccountTokenExpired(
      repo,
      account,
      `${account.provider_name} token expired or near expiry and no refresh token is stored.`
    );
    throw new ContentDestinationPublishError({
      message: `${account.provider_name === 'linkedin' ? 'LinkedIn' : 'X'} OAuth token expired and no refresh token is available.`,
      providerName: account.provider_name,
      retryable: false,
    });
  }

  try {
    const refreshed = await refreshSocialOAuthToken({
      provider: account.provider_name,
      refreshToken,
      xClientId: env.X_OAUTH_CLIENT_ID,
      xClientSecret: env.X_OAUTH_CLIENT_SECRET,
      xTokenUrl: env.X_OAUTH_TOKEN_URL,
      linkedinClientId: env.LINKEDIN_OAUTH_CLIENT_ID,
      linkedinClientSecret: env.LINKEDIN_OAUTH_CLIENT_SECRET,
      linkedinTokenUrl: env.LINKEDIN_OAUTH_TOKEN_URL,
    });

    const refreshedToken = await repo.upsertAccountToken({
      distributionAccountId: account.id,
      tokenType: 'oauth',
      accessTokenEncrypted: refreshed.accessToken,
      refreshTokenEncrypted: refreshed.refreshToken ?? refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopeList,
      metadata: {
        ...(token.metadata ?? {}),
        source: 'provider_oauth_refresh',
        provider: account.provider_name,
        raw: refreshed.raw,
        refreshed_at: new Date().toISOString(),
      },
    });

    await repo.upsertAccount({
      accountId: account.account_id,
      providerName: account.provider_name,
      accountLabel: account.account_label,
      externalAccountId: account.external_account_id,
      status: 'connected',
      defaultAudienceId: account.default_audience_id,
      connectedByUserId: account.connected_by_user_id,
      lastVerifiedAt: new Date().toISOString(),
      metadata: {
        ...account.metadata,
        oauth_refresh_state: 'ok',
        oauth_refreshed_at: new Date().toISOString(),
      },
    });

    return refreshedToken;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown ${account.provider_name} OAuth refresh failure.`;
    await markAccountTokenExpired(repo, account, message);
    throw new ContentDestinationPublishError({
      message: `${account.provider_name === 'linkedin' ? 'LinkedIn' : 'X'} OAuth token refresh failed: ${message}`,
      providerName: account.provider_name,
      retryable: false,
    });
  }
}

export async function dispatchDistributionJobs(
  supabase: SupabaseLike,
  env: PaymentApiEnv,
  args?: {
    readonly now?: string;
    readonly limit?: number;
  },
  deps: DispatchDependencies = {}
): Promise<DispatchSummary> {
  const repo = (deps.createRepository ?? createDistributionEngineRepository)(supabase as any);

  const jobs = await repo.listDispatchableJobs({
    now: args?.now,
    limit: args?.limit,
  });

  let dispatched = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    dispatched += 1;
    try {
      const summary = await dispatchDistributionJobById(supabase, env, job.id, deps);
      succeeded += summary.succeeded;
      failed += summary.failed;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: jobs.length,
    dispatched,
    succeeded,
    failed,
  };
}

export async function dispatchDistributionJobById(
  supabase: SupabaseLike,
  env: PaymentApiEnv,
  distributionJobId: string,
  deps: DispatchDependencies = {}
): Promise<DispatchSummary> {
  const repo = (deps.createRepository ?? createDistributionEngineRepository)(supabase as any);
  const resolveAdapter = deps.resolveAdapter ?? resolveContentDestinationAdapter;
  const publishXSingleImage = deps.publishXSingleImagePost ?? publishXSingleImagePost;
  const publishXShortVideo = deps.publishXShortVideoPost ?? publishXShortVideoPost;
  const publishXLongVideo = deps.publishXLongVideoPost ?? publishXLongVideoPost;
  const publishLinkedInSingleImage =
    deps.publishLinkedInSingleImagePost ?? publishLinkedInSingleImagePost;
  const publishLinkedInCarousel =
    deps.publishLinkedInCarouselPost ?? publishLinkedInCarouselPost;
  const publishLinkedInShortVideo =
    deps.publishLinkedInShortVideoPost ?? publishLinkedInShortVideoPost;
  const publishLinkedInLongVideo =
    deps.publishLinkedInLongVideoPost ?? publishLinkedInLongVideoPost;
  const log = deps.structuredLog ?? structuredLog;
  const logError = deps.structuredError ?? structuredError;
  let activeAccount: DistributionAccountRow | null = null;

  const job = await repo.getJobById(distributionJobId);
  if (!job) {
    log(
      'distribution_job_dispatch_skipped',
      { distribution_job_id: distributionJobId, reason: 'job_not_found' },
      'info'
    );
    return { scanned: 1, dispatched: 0, succeeded: 0, failed: 0 };
  }

  if (!['queued', 'scheduled', 'processing'].includes(job.status)) {
    log(
      'distribution_job_dispatch_skipped',
      {
        distribution_job_id: distributionJobId,
        job_id: job.job_id,
        reason: 'job_not_dispatchable',
        status: job.status,
      },
      'info'
    );
    return { scanned: 1, dispatched: 0, succeeded: 0, failed: 0 };
  }

  let currentJob: DistributionJobRow = job;

  try {
    if (currentJob.status !== 'processing') {
      currentJob = await repo.updateJob(job.id, {
        status: 'processing',
        lastError: null,
      });
    }

    const [account, asset] = await Promise.all([
      repo.getAccountById(currentJob.distribution_account_id),
      repo.getAssetById(currentJob.distribution_asset_id),
    ]);
    activeAccount = account;

    if (!account) {
      throw new Error('Distribution account not found for job.');
    }
    if (!asset) {
      throw new Error('Distribution asset not found for job.');
    }
    if (asset.source_type !== 'content_item') {
      throw new Error('Only content_item sourced assets are dispatchable in the current runtime.');
    }
    const mediaRows = requiresMediaAttachments(asset.asset_type)
      ? await repo.listMediaForAsset(asset.id)
      : [];
    if (requiresMediaAttachments(asset.asset_type)) {
      if (!hasProviderReadyMedia(mediaRows)) {
        throw new ContentDestinationPublishError({
          message:
            'Media-required asset has no provider-ready media. Save media rows with ready/uploaded status before dispatch.',
          providerName: account.provider_name,
          retryable: false,
        });
      }
    }

    const item = await getDispatchableContentItem(supabase, asset);
    if (!item) {
      throw new Error('Canonical content item not found for asset.');
    }

    const tokenList =
      typeof (repo as any).listAccountTokensForAccount === 'function'
        ? await (repo as any).listAccountTokensForAccount(account.id)
        : [];
    const preferredToken = pickPreferredToken(tokenList as DistributionAccountTokenRow[]);
    if (requiresTokenRuntime(account.provider_name) && !preferredToken) {
      throw new ContentDestinationPublishError({
        message: `No distribution account token is configured for provider ${account.provider_name}.`,
        providerName: account.provider_name,
        retryable: false,
      });
    }
    const activeToken = await ensureActiveProviderToken(repo, env, account, preferredToken);
    const runtimeEnv = resolveProviderRuntimeEnv(env, account, activeToken);

    const attemptNumber = (await repo.listJobAttempts(currentJob.id)).length + 1;
    const destination = buildSyntheticDestination(account);
    const adapter = resolveAdapter(destination as any);

    let result: PublishResult;
    if (asset.asset_type === 'single_image_post' && account.provider_name === 'x') {
      result = await publishXSingleImage({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'short_video_post' && account.provider_name === 'x') {
      result = await publishXShortVideo({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'long_video_post' && account.provider_name === 'x') {
      result = await publishXLongVideo({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'single_image_post' && account.provider_name === 'linkedin') {
      result = await publishLinkedInSingleImage({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'carousel_post' && account.provider_name === 'linkedin') {
      result = await publishLinkedInCarousel({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'short_video_post' && account.provider_name === 'linkedin') {
      result = await publishLinkedInShortVideo({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (asset.asset_type === 'long_video_post' && account.provider_name === 'linkedin') {
      result = await publishLinkedInLongVideo({
        item,
        asset,
        mediaRows,
        env: runtimeEnv,
      });
    } else if (requiresMediaAttachments(asset.asset_type)) {
      throw new ContentDestinationPublishError({
        message: `Media publish is not yet wired for provider ${account.provider_name} and asset type ${asset.asset_type}.`,
        providerName: account.provider_name,
        retryable: false,
      });
    } else {
      result = await adapter.publishDraft({
        item: item as any,
        destination: destination as any,
        env: runtimeEnv,
      });
    }

    await repo.createJobAttempt({
      distributionJobId: currentJob.id,
      attemptNumber,
      requestSummary: {
        provider_name: account.provider_name,
        account_id: account.account_id,
        asset_id: asset.asset_id,
        publish_mode: currentJob.publish_mode,
      },
      responseSummary: {
        delivery_status: result.status,
        destination_url: result.destinationUrl,
        provider_publication_id: result.providerPublicationId,
      },
      providerStatusCode: null,
      errorMessage: null,
    });

    await repo.updateJob(currentJob.id, {
      status:
        result.status === 'published'
          ? 'published'
          : result.status === 'queued'
            ? 'queued'
            : 'published',
      destinationUrl: result.destinationUrl,
      providerPostId: result.providerPublicationId,
      lastError: null,
      completedAt: new Date().toISOString(),
    });

    log(
      'distribution_job_dispatch_succeeded',
      {
        job_id: currentJob.job_id,
        account_id: account.account_id,
        provider_name: account.provider_name,
        asset_id: asset.asset_id,
        publish_mode: currentJob.publish_mode,
        result_status: result.status,
      },
      'info'
    );

    return { scanned: 1, dispatched: 1, succeeded: 1, failed: 0 };
  } catch (error) {
    const attempts = await repo.listJobAttempts(currentJob.id);
    const nextAttemptNumber = attempts.length + 1;
    const failure = classifyDispatchError(error);
    const providerName = activeAccount?.provider_name;
    const backoffProfile = readBackoffProfile(activeAccount);
    const backoffMultiplier = readBackoffMultiplier(activeAccount);
    const retryAfterMs =
      failure.retryable
        ? pickBackoffWindowMs(providerName, failure.providerStatusCode, nextAttemptNumber, {
            profile: backoffProfile,
            multiplier: backoffMultiplier,
          })
        : null;
    const retryScheduledFor =
      retryAfterMs && retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs).toISOString() : null;

    await repo.createJobAttempt({
      distributionJobId: currentJob.id,
      attemptNumber: nextAttemptNumber,
      requestSummary: {
        job_id: currentJob.job_id,
        publish_mode: currentJob.publish_mode,
      },
      responseSummary: {
        retry_after_ms: retryAfterMs,
        retry_scheduled_for: retryScheduledFor,
        retry_backoff_profile: failure.retryable ? backoffProfile : null,
        retry_backoff_multiplier: failure.retryable ? backoffMultiplier : null,
      },
      providerStatusCode: failure.providerStatusCode,
      errorMessage: failure.message,
    });

    await repo.updateJob(currentJob.id, {
      status: failure.retryable ? 'scheduled' : 'failed',
      scheduledFor: failure.retryable ? retryScheduledFor : currentJob.scheduled_for,
      lastError: failure.message,
      completedAt: failure.retryable ? null : new Date().toISOString(),
    });

    if (
      activeAccount &&
      !failure.retryable &&
      (failure.providerStatusCode === 401 || failure.providerStatusCode === 403)
    ) {
      await markAccountTokenExpired(repo, activeAccount, failure.message);
    }

    logError(
      failure.retryable
        ? 'distribution_job_dispatch_retryable_failed'
        : 'distribution_job_dispatch_failed',
      {
        job_id: currentJob.job_id,
        message: failure.message,
        provider_status_code: failure.providerStatusCode,
        retry_after_ms: retryAfterMs,
        retry_scheduled_for: retryScheduledFor,
        retry_backoff_profile: failure.retryable ? backoffProfile : null,
        retry_backoff_multiplier: failure.retryable ? backoffMultiplier : null,
      }
    );

    throw error;
  }
}
