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

const ADAPTER_PROVIDERS = new Set(['kit']);

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
  throw new Error('Content item has no markdown body to publish.');
}

class KitContentDestinationAdapter implements ContentDestinationAdapter {
  async publishDraft(request: ContentPublishRequest): Promise<ContentPublishResult> {
    if (!request.env.KIT_API_KEY) {
      throw new Error('KIT_API_KEY is missing.');
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
      throw new Error(`Kit publish failed (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      id?: number | string;
      public_url?: string | null;
      created_at?: string;
    };

    const providerPublicationId = json.id != null ? String(json.id) : '';
    if (!providerPublicationId) {
      throw new Error('Kit publish succeeded but no broadcast id was returned.');
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

export function resolveContentDestinationAdapter(
  destination: ContentDestinationRow
): ContentDestinationAdapter {
  switch (destination.provider_name) {
    case 'kit':
      return new KitContentDestinationAdapter();
    default:
      throw new Error(`No content destination adapter exists for ${destination.provider_name}.`);
  }
}

export function hasContentDestinationAdapter(providerName: string): boolean {
  return ADAPTER_PROVIDERS.has(providerName);
}
