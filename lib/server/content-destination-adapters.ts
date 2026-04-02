import { createHmac } from 'node:crypto';
import type { PaymentApiEnv } from '@/lib/server/cf-env';
import type { ContentAdminDetailRow } from '@/lib/server/content-admin-data';
import type { ContentDestinationRow } from '@/lib/server/content-destination-admin-data';

export type ContentPublishRequest = {
  readonly item: ContentAdminDetailRow;
  readonly destination: ContentDestinationRow;
  readonly env: PaymentApiEnv;
};

export type ContentPublishResult = {
  readonly providerPublicationId: string;
  readonly destinationUrl: string | null;
  readonly status: 'drafted' | 'published' | 'queued';
  readonly metadata: Record<string, unknown>;
};

export type ContentDestinationAdapter = {
  publishDraft(request: ContentPublishRequest): Promise<ContentPublishResult>;
};

export class ContentDestinationPublishError extends Error {
  readonly providerName: string;
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(args: {
    readonly message: string;
    readonly providerName: string;
    readonly statusCode?: number | null;
    readonly retryable: boolean;
  }) {
    super(args.message);
    this.name = 'ContentDestinationPublishError';
    this.providerName = args.providerName;
    this.statusCode = args.statusCode ?? null;
    this.retryable = args.retryable;
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

const ADAPTER_PROVIDERS = new Set(['buttondown', 'ghost', 'kit']);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1]?.length ?? 1;
      const text = headingMatch[2] ?? '';
      html.push(`<h${level}>${formatInlineMarkdown(text)}</h${level}>`);
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${formatInlineMarkdown(line.slice(2).trim())}</li>`);
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    html.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  if (inList) {
    html.push('</ul>');
  }

  return html.join('\n');
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPreviewText(markdown: string): string {
  const text = stripMarkdown(markdown);
  return text.length <= 180 ? text : `${text.slice(0, 177).trimEnd()}...`;
}

function getDraftBody(item: ContentAdminDetailRow): string {
  if (item.draft_markdown && item.draft_markdown.trim().length > 0) {
    return item.draft_markdown;
  }
  if (item.brief_markdown && item.brief_markdown.trim().length > 0) {
    return item.brief_markdown;
  }
  throw new ContentDestinationPublishError({
    message: 'Content item has no markdown body to publish.',
    providerName: 'generic',
    retryable: false,
  });
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function createGhostAdminToken(apiKey: string): string {
  const [id, secretHex] = apiKey.split(':');
  if (!id || !secretHex) {
    throw new ContentDestinationPublishError({
      message: 'GHOST_ADMIN_API_KEY must be in id:secret format.',
      providerName: 'ghost',
      retryable: false,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({
      alg: 'HS256',
      kid: id,
      typ: 'JWT',
    })
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now,
      exp: now + 300,
      aud: '/admin/',
    })
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(unsigned)
    .digest('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');

  return `${unsigned}.${signature}`;
}

function normalizeGhostAdminBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ContentDestinationPublishError({
      message: 'GHOST_ADMIN_API_URL is missing.',
      providerName: 'ghost',
      retryable: false,
    });
  }
  return trimmed.replace(/\/+$/, '');
}

class KitContentDestinationAdapter implements ContentDestinationAdapter {
  async publishDraft(request: ContentPublishRequest): Promise<ContentPublishResult> {
    if (!request.env.KIT_API_KEY) {
      throw new ContentDestinationPublishError({
        message: 'KIT_API_KEY is missing.',
        providerName: 'kit',
        retryable: false,
      });
    }

    const markdown = getDraftBody(request.item);
    const html = markdownToHtml(markdown);
    const previewText = buildPreviewText(markdown);

    const response = await fetch('https://api.kit.com/v4/broadcasts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': request.env.KIT_API_KEY,
      },
      body: JSON.stringify({
        subject: request.item.title,
        content: html,
        description: `Draft pushed from GEO-Pulse content item ${request.item.content_id}`,
        preview_text: previewText,
        public: false,
        subscriber_filter: {
          all: [{ type: 'all_subscribers' }],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ContentDestinationPublishError({
        message: `Kit publish failed (${response.status}): ${errorText}`,
        providerName: 'kit',
        statusCode: response.status,
        retryable: isRetryableHttpStatus(response.status),
      });
    }

    const json = (await response.json()) as {
      id?: number | string;
      public_url?: string | null;
      created_at?: string;
    };

    const providerPublicationId = json.id != null ? String(json.id) : '';
    if (!providerPublicationId) {
      throw new ContentDestinationPublishError({
        message: 'Kit publish succeeded but no broadcast id was returned.',
        providerName: 'kit',
        retryable: false,
      });
    }

    return {
      providerPublicationId,
      destinationUrl: json.public_url ?? null,
      status: 'drafted',
      metadata: {
        provider: 'kit',
        created_at: json.created_at ?? null,
      },
    };
  }
}

class ButtondownContentDestinationAdapter implements ContentDestinationAdapter {
  async publishDraft(request: ContentPublishRequest): Promise<ContentPublishResult> {
    if (!request.env.BUTTONDOWN_API_KEY) {
      throw new ContentDestinationPublishError({
        message: 'BUTTONDOWN_API_KEY is missing.',
        providerName: 'buttondown',
        retryable: false,
      });
    }

    const markdown = getDraftBody(request.item);
    const previewText = buildPreviewText(markdown);
    const body: Record<string, unknown> = {
      subject: request.item.title,
      body: markdown,
      status: 'draft',
      description: `Draft pushed from GEO-Pulse content item ${request.item.content_id}`,
      metadata: {
        geopulse_content_id: request.item.content_id,
        geopulse_topic_cluster: request.item.topic_cluster,
        preview_text: previewText,
      },
    };

    if (request.item.canonical_url?.trim()) {
      body['canonical_url'] = request.item.canonical_url.trim();
    }

    const response = await fetch('https://api.buttondown.com/v1/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${request.env.BUTTONDOWN_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ContentDestinationPublishError({
        message: `Buttondown publish failed (${response.status}): ${errorText}`,
        providerName: 'buttondown',
        statusCode: response.status,
        retryable: isRetryableHttpStatus(response.status),
      });
    }

    const json = (await response.json()) as {
      id?: string;
      absolute_url?: string | null;
      creation_date?: string | null;
      status?: string | null;
    };

    const providerPublicationId = json.id?.trim() ?? '';
    if (!providerPublicationId) {
      throw new ContentDestinationPublishError({
        message: 'Buttondown publish succeeded but no email id was returned.',
        providerName: 'buttondown',
        retryable: false,
      });
    }

    return {
      providerPublicationId,
      destinationUrl: json.absolute_url ?? null,
      status: 'drafted',
      metadata: {
        provider: 'buttondown',
        creation_date: json.creation_date ?? null,
        buttondown_status: json.status ?? 'draft',
      },
    };
  }
}

class GhostContentDestinationAdapter implements ContentDestinationAdapter {
  async publishDraft(request: ContentPublishRequest): Promise<ContentPublishResult> {
    if (!request.env.GHOST_ADMIN_API_URL) {
      throw new ContentDestinationPublishError({
        message: 'GHOST_ADMIN_API_URL is missing.',
        providerName: 'ghost',
        retryable: false,
      });
    }
    if (!request.env.GHOST_ADMIN_API_KEY) {
      throw new ContentDestinationPublishError({
        message: 'GHOST_ADMIN_API_KEY is missing.',
        providerName: 'ghost',
        retryable: false,
      });
    }

    const markdown = getDraftBody(request.item);
    const html = markdownToHtml(markdown);
    const previewText = buildPreviewText(markdown);
    const adminBaseUrl = normalizeGhostAdminBaseUrl(request.env.GHOST_ADMIN_API_URL);
    const version = (request.env.GHOST_ADMIN_API_VERSION || 'v6.0').trim() || 'v6.0';
    const token = createGhostAdminToken(request.env.GHOST_ADMIN_API_KEY);

    const response = await fetch(`${adminBaseUrl}/ghost/api/admin/posts/?source=html`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Version': version,
        Authorization: `Ghost ${token}`,
      },
      body: JSON.stringify({
        posts: [
          {
            title: request.item.title,
            slug: request.item.slug,
            html,
            status: 'draft',
            custom_excerpt: previewText,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ContentDestinationPublishError({
        message: `Ghost publish failed (${response.status}): ${errorText}`,
        providerName: 'ghost',
        statusCode: response.status,
        retryable: isRetryableHttpStatus(response.status),
      });
    }

    const json = (await response.json()) as {
      posts?: Array<{
        id?: string;
        url?: string | null;
        updated_at?: string | null;
      }>;
    };

    const post = json.posts?.[0];
    const providerPublicationId = post?.id?.trim() ?? '';
    if (!providerPublicationId) {
      throw new ContentDestinationPublishError({
        message: 'Ghost publish succeeded but no post id was returned.',
        providerName: 'ghost',
        retryable: false,
      });
    }

    return {
      providerPublicationId,
      destinationUrl: post?.url ?? null,
      status: 'drafted',
      metadata: {
        provider: 'ghost',
        updated_at: post?.updated_at ?? null,
      },
    };
  }
}

export function resolveContentDestinationAdapter(
  destination: ContentDestinationRow
): ContentDestinationAdapter {
  switch (destination.provider_name) {
    case 'buttondown':
      return new ButtondownContentDestinationAdapter();
    case 'ghost':
      return new GhostContentDestinationAdapter();
    case 'kit':
      return new KitContentDestinationAdapter();
    default:
      throw new ContentDestinationPublishError({
        message: `No content destination adapter exists for ${destination.provider_name}.`,
        providerName: destination.provider_name,
        retryable: false,
      });
  }
}

export function hasContentDestinationAdapter(providerName: string): boolean {
  return ADAPTER_PROVIDERS.has(providerName);
}
