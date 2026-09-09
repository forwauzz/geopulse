export type TopicPageContent = {
  readonly definition: string;
  readonly whyItMatters: string;
  readonly practicalTakeaway: string;
};

export type TopicPageSeo = {
  readonly title: string;
  readonly heading: string;
  readonly description: string;
};

const TOPIC_PAGE_SEO: Record<string, TopicPageSeo> = {
  'msp-websites-ai-search-results-aeo-services': {
    title: 'AI Search Optimization for MSPs: Guides and Audits | GEO-Pulse',
    heading: 'AI Search Optimization for MSPs',
    description:
      'Explore practical guides for MSP AI search visibility, AEO, GEO, website audits, evidence quality, and measurement. Start with the highest-impact fix.',
  },
};

export type SeededTopicPageItem = {
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly topic_cluster: string;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly metadata: Record<string, unknown>;
};

const TOPIC_PAGE_COPY: Record<string, TopicPageContent> = {
  'msp-websites-ai-search-results-aeo-services': {
    definition:
      'AI search optimization for MSPs makes managed IT services, locations, expertise, and proof easier for answer engines to retrieve and explain accurately.',
    whyItMatters:
      'MSP buyers often ask AI systems for shortlists before visiting a provider website. Clear public evidence improves the chance that those systems understand the offer.',
    practicalTakeaway:
      'Start with the core MSP guide, audit the highest-intent service pages, fix the clearest evidence gap, and measure the same buyer questions again.',
  },
  ai_search_readiness: {
    definition:
      'AI search readiness is the practical state where a site is crawlable, structurally legible, and easy for language models to segment, summarize, and cite.',
    whyItMatters:
      'Teams often assume ranking, crawl access, or schema alone are enough, but AI visibility depends on whether systems can reliably extract and trust the page.',
    practicalTakeaway:
      'Start with pages that should explain the business clearly, then check whether the answer is direct, structured, and easy to quote without heavy interpretation.',
  },
  citation_readiness: {
    definition:
      'Citation readiness is the extent to which a page makes its claims, evidence, and supporting structure easy for a model to reference accurately.',
    whyItMatters:
      'If a page is hard to cite, it can be seen, crawled, and even summarized while still being passed over as a source in AI answers.',
    practicalTakeaway:
      'Use concise definitions, visible evidence, source clarity, and tightly scoped sections so the page can stand on its own as supportable context.',
  },
  general: {
    definition:
      'This topic cluster groups canonical GEO-Pulse articles that belong together even when they do not fit one narrower named pattern yet.',
    whyItMatters:
      'A connected cluster is easier to navigate and easier for machines to interpret than isolated posts with no visible relationship.',
    practicalTakeaway:
      'Use the articles below to move from the broad theme into the most specific page that matches the question you are trying to answer.',
  },
};

export function getTopicPageContent(topicKey: string): TopicPageContent {
  return TOPIC_PAGE_COPY[topicKey] ?? {
    definition: `This topic cluster groups GEO-Pulse articles about ${topicKey
      .split('_')
      .join(' ')} into one navigable path.`,
    whyItMatters:
      'Topic pages should give readers and language models one stable place to understand how related articles connect.',
    practicalTakeaway:
      'Start with the definition here, then move into the linked articles for the more specific workflow, mistake, or explanation you need.',
  };
}

export function resolveTopicPageSeo(
  topicKey: string,
  topicLabel: string,
  definition: string,
): TopicPageSeo {
  const override = TOPIC_PAGE_SEO[topicKey];
  if (override) return override;
  const normalized = definition.replace(/\s+/g, ' ').trim();
  const description = normalized.length <= 155
    ? normalized
    : `${normalized.slice(0, 152).trimEnd()}...`;
  return {
    title: `${topicLabel} | GEO-Pulse Blog`,
    heading: topicLabel,
    description,
  };
}

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildSeededTopicPageItem(topicKey: string): SeededTopicPageItem {
  const content = getTopicPageContent(topicKey);
  return {
    content_id: `topic-page-${topicKey}`,
    slug: `topic-${topicKey}`,
    title: `Topic page: ${formatTopicLabel(topicKey)}`,
    status: 'published',
    content_type: 'research_note',
    topic_cluster: topicKey,
    cta_goal: 'free_scan',
    source_type: 'internal_plus_research',
    metadata: {
      topic_page_definition: content.definition,
      topic_page_why_it_matters: content.whyItMatters,
      topic_page_practical_takeaway: content.practicalTakeaway,
      topic_page_seeded: true,
    },
  };
}
