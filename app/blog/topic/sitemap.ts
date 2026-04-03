import type { MetadataRoute } from 'next';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import { buildTopicHref, groupArticlesByTopic } from '@/lib/server/content-navigation';
import { createPublicContentData } from '@/lib/server/public-content-data';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

function withBase(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = await getPaymentApiEnv();
  const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/').replace(/\/+$/, '');

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const articles = await createPublicContentData(supabase).getPublishedArticles();
  const indexableArticles = articles.filter((article) => !parseArticleMetadata(article.metadata).noIndex);
  const topicGroups = groupArticlesByTopic(indexableArticles);

  return topicGroups.map((group) => ({
    url: withBase(baseUrl, buildTopicHref(group.topicKey)),
    lastModified: group.articles[0]?.updated_at ?? group.articles[0]?.published_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
}
