import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { parseArticleMetadata } from '@/lib/server/content-article-metadata';
import { buildTopicHref, groupArticlesByTopic } from '@/lib/server/content-navigation';
import { createPublicContentData } from '@/lib/server/public-content-data';
import { canonicalPublicOrigin, isIndexablePublishedArticle } from '@/lib/server/public-indexing';
import {
  publicSitemapResponse,
  unavailablePublicSitemapResponse,
} from '@/lib/server/public-sitemap-response';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

function withBase(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function GET(): Promise<Response> {
  try {
    const env = await getPaymentApiEnv();
    const baseUrl = canonicalPublicOrigin(env.NEXT_PUBLIC_APP_URL);

    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return unavailablePublicSitemapResponse('blog-topic', new Error('PublicContentConfigurationUnavailable'));
    }

    const supabase = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const articles = await createPublicContentData(supabase).getPublishedArticles();
    const indexableArticles = articles.filter((article) =>
      !parseArticleMetadata(article.metadata).noIndex && isIndexablePublishedArticle(article)
    );
    const entries = groupArticlesByTopic(indexableArticles).map((group) => ({
      url: withBase(baseUrl, buildTopicHref(group.topicKey)),
      lastModified: group.articles[0]?.updated_at ?? group.articles[0]?.published_at,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return publicSitemapResponse(entries);
  } catch (error) {
    return unavailablePublicSitemapResponse('blog-topic', error);
  }
}
