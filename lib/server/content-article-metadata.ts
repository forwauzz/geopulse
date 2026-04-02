export type ArticleMetadataFields = {
  readonly authorName: string | null;
  readonly authorRole: string | null;
  readonly authorUrl: string | null;
  readonly heroImageUrl: string | null;
  readonly heroImageAlt: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseArticleMetadata(metadata: Record<string, unknown> | null | undefined): ArticleMetadataFields {
  const safe = metadata ?? {};
  return {
    authorName: readString(safe['author_name']),
    authorRole: readString(safe['author_role']),
    authorUrl: readString(safe['author_url']),
    heroImageUrl: readString(safe['hero_image_url']),
    heroImageAlt: readString(safe['hero_image_alt']),
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

  if (fields.heroImageUrl) next['hero_image_url'] = fields.heroImageUrl;
  else delete next['hero_image_url'];

  if (fields.heroImageAlt) next['hero_image_alt'] = fields.heroImageAlt;
  else delete next['hero_image_alt'];

  return next;
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
      url: authorUrl,
    },
    ...(input.heroImageUrl ? { image: [input.heroImageUrl] } : {}),
  };
}
