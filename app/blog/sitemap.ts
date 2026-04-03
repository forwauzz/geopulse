import type { MetadataRoute } from 'next';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
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

  return articles
    .filter((article) => {
      const metadata = parseArticleMetadata(article.metadata);
      return !metadata.noIndex;
    })
    .map((article) => ({
      url: withBase(baseUrl, `/blog/${article.slug}`),
      lastModified: article.published_at ?? article.updated_at,
      changeFrequency: 'monthly',
      priority: 0.8,
    }));
}
