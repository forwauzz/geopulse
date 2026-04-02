import type { MetadataRoute } from 'next';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createPublicContentData } from '@/lib/server/public-content-data';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { groupArticlesByTopic } from '@/lib/server/content-navigation';

function withBase(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const env = await getPaymentApiEnv();
  const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/').replace(/\/+$/, '');
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: withBase(baseUrl, '/'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: withBase(baseUrl, '/blog'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: withBase(baseUrl, '/pricing'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return staticEntries;
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const articles = await createPublicContentData(supabase).getPublishedArticles();
  const topicGroups = groupArticlesByTopic(articles);

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: withBase(baseUrl, `/blog/${article.slug}`),
    lastModified: article.published_at ?? article.updated_at,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const topicEntries: MetadataRoute.Sitemap = topicGroups.map((group) => ({
    url: withBase(baseUrl, `/blog/topic/${group.topicKey}`),
    lastModified: group.articles[0]?.updated_at ?? group.articles[0]?.published_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticEntries, ...topicEntries, ...articleEntries];
}
