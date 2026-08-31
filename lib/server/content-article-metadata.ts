export type ArticleMetadataFields = {
  readonly authorName: string | null;
  readonly authorRole: string | null;
  readonly authorUrl: string | null;
  readonly metaDescription?: string | null;
  readonly heroImageUrl: string | null;
  readonly heroImageAlt: string | null;
  readonly noIndex: boolean;
};

const INTERNAL_SEARCH_NOTE_PATTERN =
  /\b(?:ranks?|position)\s*#?\d+\b|\boutside (?:the )?(?:measured )?top \d+\b|\b(?:impressions?|clicks?|ctr)\s*(?:[:=]\s*)?\d+(?:\.\d+)?%?\b|\b\d+(?:\.\d+)?%?\s+(?:impressions?|clicks?)\b/i;

export const DEFAULT_ARTICLE_DESCRIPTION =
  'Operator-grade guidance about AI search readiness.';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseArticleMetadata(metadata: Record<string, unknown> | null | undefined): ArticleMetadataFields {
  const safe = metadata ?? {};
  return {
    authorName: readString(safe['author_name']),
    authorRole: readString(safe['author_role']),
    authorUrl: readString(safe['author_url']),
    metaDescription: readString(safe['meta_description']),
    heroImageUrl: readString(safe['hero_image_url']),
    heroImageAlt: readString(safe['hero_image_alt']),
    noIndex: safe['noindex'] === true,
  };
}

export function mergeArticleMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fields: ArticleMetadataFields
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };

  if (fields.authorName) next['author_name'] = fields.authorName;
  else delete next['author_name'];

  if (fields.authorRole) next['author_role'] = fields.authorRole;
  else delete next['author_role'];

  if (fields.authorUrl) next['author_url'] = fields.authorUrl;
  else delete next['author_url'];

  if (fields.metaDescription !== undefined) {
    if (fields.metaDescription) next['meta_description'] = fields.metaDescription;
    else delete next['meta_description'];
  }

  if (fields.heroImageUrl) next['hero_image_url'] = fields.heroImageUrl;
  else delete next['hero_image_url'];

  if (fields.heroImageAlt) next['hero_image_alt'] = fields.heroImageAlt;
  else delete next['hero_image_alt'];

  if (fields.noIndex) next['noindex'] = true;
  else delete next['noindex'];

  return next;
}

export function isSafePublicArticleDescription(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return Boolean(normalized) && !INTERNAL_SEARCH_NOTE_PATTERN.test(normalized);
}

export function extractArticleLeadParagraph(markdown: string): string | null {
  const paragraphs = markdown
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('#') && !part.startsWith('- ') && !part.startsWith('* '));

  return paragraphs[0] ?? null;
}

export function resolvePublicArticleDescription(input: {
  readonly metadata: Record<string, unknown> | null | undefined;
  readonly markdown: string;
}): string {
  const explicit = readString(input.metadata?.['meta_description']);
  if (isSafePublicArticleDescription(explicit)) return explicit!;

  const lead = extractArticleLeadParagraph(input.markdown);
  if (isSafePublicArticleDescription(lead)) return lead!;

  return DEFAULT_ARTICLE_DESCRIPTION;
}

export function clampArticleDescription(value: string, maxLength = 155): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function buildArticleStructuredData(input: {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly authorName: string | null;
  readonly authorRole: string | null;
  readonly authorUrl: string | null;
  readonly heroImageUrl?: string | null;
}) {
  const authorName = input.authorName ?? 'GEO-Pulse';
  const authorUrl = input.authorUrl ?? input.canonicalUrl;
  const publisherUrl = new URL('/', input.canonicalUrl).toString();

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt ?? input.updatedAt,
    dateModified: input.updatedAt,
    mainEntityOfPage: input.canonicalUrl,
    author: {
      '@type': 'Person',
      name: authorName,
      url: authorUrl,
      ...(input.authorRole ? { description: input.authorRole } : {}),
    },
    publisher: {
      '@type': 'Organization',
      name: 'GEO-Pulse',
      url: publisherUrl,
    },
    ...(input.heroImageUrl ? { image: [input.heroImageUrl] } : {}),
  };
}
