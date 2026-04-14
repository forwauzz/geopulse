import type { PublicContentListRow } from './public-content-data';

export type TopicGroup = {
  readonly topicKey: string;
  readonly topicLabel: string;
  readonly articles: PublicContentListRow[];
};

export function formatTopicLabel(value: string | null): string {
  if (!value) return 'General';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function buildTopicAnchor(topic: string | null): string {
  return topic ? `topic-${slugify(formatTopicLabel(topic))}` : 'topic-general';
}

export function buildTopicHref(topic: string | null): string {
  return topic ? `/blog/topic/${topic}` : '/blog/topic/general';
}

export function groupArticlesByTopic(articles: PublicContentListRow[]): TopicGroup[] {
  const groups = new Map<string, PublicContentListRow[]>();

  for (const article of articles) {
    const key = article.topic_cluster?.trim() || 'general';
    const existing = groups.get(key) ?? [];
    existing.push(article);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .map(([topicKey, groupedArticles]) => ({
      topicKey,
      topicLabel: formatTopicLabel(topicKey === 'general' ? null : topicKey),
      articles: groupedArticles,
    }))
    .sort((a, b) => a.topicLabel.localeCompare(b.topicLabel));
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
  const normalized = topic?.trim() || 'general';
  return articles.filter((article) => (article.topic_cluster?.trim() || 'general') === normalized);
}
