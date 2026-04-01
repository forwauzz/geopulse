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
