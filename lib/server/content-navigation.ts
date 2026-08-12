import type { PublicContentListRow } from './public-content-data';

export type TopicGroup = {
  /** Stable public URL key; database labels never become paths directly. */
  readonly topicKey: string;
  readonly topicLabel: string;
  readonly sourceTopics: readonly string[];
  readonly articles: PublicContentListRow[];
};

export function formatTopicLabel(value: string | null): string {
  if (!value) return 'General';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeTopicSlug(value: string | null): string {
  if (!value?.trim()) return 'general';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-') || 'general';
}

export function buildTopicAnchor(topic: string | null): string {
  return `topic-${normalizeTopicSlug(topic)}`;
}

export function buildTopicHref(topic: string | null): string {
  return `/blog/topic/${encodeURIComponent(normalizeTopicSlug(topic))}`;
}

export function groupArticlesByTopic(articles: PublicContentListRow[]): TopicGroup[] {
  const groups = new Map<string, { label: string; sourceTopics: Set<string>; articles: PublicContentListRow[] }>();

  for (const article of articles) {
    const sourceTopic = article.topic_cluster?.trim() || 'general';
    const key = normalizeTopicSlug(sourceTopic);
    const existing = groups.get(key) ?? {
      label: formatTopicLabel(sourceTopic === 'general' ? null : sourceTopic),
      sourceTopics: new Set<string>(),
      articles: [],
    };
    existing.sourceTopics.add(sourceTopic);
    existing.articles.push(article);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .map(([topicKey, group]) => ({
      topicKey,
      topicLabel: group.label,
      sourceTopics: [...group.sourceTopics].sort(),
      articles: group.articles,
    }))
    .sort((a, b) => a.topicLabel.localeCompare(b.topicLabel));
}

/** Resolve a legacy database-label path only when it has one canonical equivalent. */
export function resolveTopicRoute(
  groups: readonly TopicGroup[],
  routeSegment: string,
): { readonly group: TopicGroup; readonly redirectRequired: boolean } | null {
  const trimmed = routeSegment.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Malformed encodings must not invent a redirect target.
    return null;
  }
  const direct = groups.find((group) => group.topicKey === decoded);
  if (direct) return { group: direct, redirectRequired: false };
  const legacyMatches = groups.filter((group) => group.sourceTopics.includes(decoded));
  if (legacyMatches.length !== 1) return null;
  return { group: legacyMatches[0]!, redirectRequired: true };
}

export function getRelatedArticles(
  articles: PublicContentListRow[],
  currentSlug: string,
  topicCluster: string | null,
  limit = 3
): PublicContentListRow[] {
  const sameTopic = articles.filter(
    (article) => article.slug !== currentSlug && article.topic_cluster === topicCluster
  );
  if (sameTopic.length >= limit) {
    return sameTopic.slice(0, limit);
  }

  const fallback = articles.filter((article) => article.slug !== currentSlug);
  return [...sameTopic, ...fallback.filter((article) => !sameTopic.includes(article))].slice(0, limit);
}

export function getArticlesForTopic(
  articles: PublicContentListRow[],
  topic: string | null
): PublicContentListRow[] {
  const normalized = normalizeTopicSlug(topic);
  return articles.filter((article) => normalizeTopicSlug(article.topic_cluster) === normalized);
}
