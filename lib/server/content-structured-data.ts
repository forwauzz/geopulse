export function buildBreadcrumbStructuredData(
  items: ReadonlyArray<{
    readonly name: string;
    readonly item: string;
  }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

export function buildBlogIndexStructuredData(input: {
  readonly blogUrl: string;
  readonly description: string;
  readonly topicUrls: readonly string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'GEO-Pulse Blog',
    description: input.description,
    url: input.blogUrl,
    hasPart: input.topicUrls.map((url) => ({
      '@type': 'CollectionPage',
      url,
    })),
    publisher: {
      '@type': 'Organization',
      name: 'GEO-Pulse',
      url: input.blogUrl,
    },
  };
}

export function buildTopicPageStructuredData(input: {
  readonly topicLabel: string;
  readonly topicUrl: string;
  readonly definition: string;
  readonly whyItMatters: string;
  readonly articleUrls: readonly string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${input.topicLabel} | GEO-Pulse`,
    description: `${input.definition} ${input.whyItMatters}`.trim(),
    url: input.topicUrl,
    about: {
      '@type': 'Thing',
      name: input.topicLabel,
      description: input.definition,
    },
    hasPart: input.articleUrls.map((url) => ({
      '@type': 'Article',
      url,
    })),
    publisher: {
      '@type': 'Organization',
      name: 'GEO-Pulse',
      url: input.topicUrl,
    },
  };
}
