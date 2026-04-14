import { evaluateEditorialReadiness } from './content-editorial-readiness';
import type { ContentAdminDetailRow, ContentAdminListRow } from './content-admin-data';

type SupabaseLike = {
  from(table: string): any;
};

type ContentAdminDataLike = {
  getRecentContentItems(filters?: {
    status?: string | null;
    contentType?: string | null;
    targetPersona?: string | null;
  }): Promise<ContentAdminListRow[]>;
  getContentItemDetail(contentId: string): Promise<ContentAdminDetailRow | null>;
};

export type LaunchArticleRow = {
  readonly content_id: string;
  readonly title: string;
  readonly status: string;
  readonly slug: string;
  readonly topic_cluster: string | null;
  readonly readinessPassed: boolean;
  readonly failedChecks: string[];
};

export type LaunchReadinessSummary = {
  readonly publishedArticleCount: number;
  readonly publishedTopicPageCount: number;
  readonly connectedPublishedTopicCount: number;
  readonly readyArticleCount: number;
  readonly meetsLaunchThreshold: boolean;
};

export async function buildContentLaunchReadiness(
  contentAdminData: ContentAdminDataLike
): Promise<{
  readonly summary: LaunchReadinessSummary;
  readonly articles: LaunchArticleRow[];
}> {
  const [articleItems, topicPageItems] = await Promise.all([
    contentAdminData.getRecentContentItems({ contentType: 'article' }),
    contentAdminData.getRecentContentItems({ contentType: 'research_note', status: 'published' }),
  ]);

  const articleDetails = await Promise.all(
    articleItems.map((item) => contentAdminData.getContentItemDetail(item.content_id))
  );

  const articles: LaunchArticleRow[] = articleDetails
    .filter((item): item is ContentAdminDetailRow => Boolean(item))
    .map((item) => {
      const checks = evaluateEditorialReadiness({
        title: item.title,
        draftMarkdown: item.draft_markdown,
        sourceLinks: item.source_links,
        ctaGoal: item.cta_goal,
      });
      const failedChecks = checks.filter((check) => !check.passed).map((check) => check.label);
      return {
        content_id: item.content_id,
        title: item.title,
        status: item.status,
        slug: item.slug,
        topic_cluster: item.topic_cluster,
        readinessPassed: failedChecks.length === 0,
        failedChecks,
      };
    });

  const publishedArticles = articles.filter((article) => article.status === 'published');
  const publishedTopicPageCount = topicPageItems.filter(
    (item) => item.status === 'published' && item.slug?.startsWith('topic-')
  ).length;

  const publishedTopicCounts = new Map<string, number>();
  for (const article of publishedArticles) {
    const topicKey = article.topic_cluster?.trim();
    if (!topicKey) continue;
    publishedTopicCounts.set(topicKey, (publishedTopicCounts.get(topicKey) ?? 0) + 1);
  }

  const connectedPublishedTopicCount = Array.from(publishedTopicCounts.values()).filter(
    (count) => count >= 2
  ).length;
  const readyArticleCount = publishedArticles.filter((article) => article.readinessPassed).length;
  const meetsLaunchThreshold =
    readyArticleCount >= 3 && publishedTopicPageCount >= 1 && connectedPublishedTopicCount >= 1;

  return {
    summary: {
      publishedArticleCount: publishedArticles.length,
      publishedTopicPageCount,
      connectedPublishedTopicCount,
      readyArticleCount,
      meetsLaunchThreshold,
    },
    articles,
  };
}
