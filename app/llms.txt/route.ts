import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createPublicContentClient } from '@/lib/server/public-content-client';
import { createPublicContentData } from '@/lib/server/public-content-data';
import { normalizeBaseUrl, toAbsoluteUrl } from '@/lib/server/public-site-seo';

export const dynamic = 'force-dynamic';

function formatArticleEntry(title: string, url: string, excerpt: string | null): string {
  return `- [${title}](${url})${excerpt ? `: ${excerpt}` : ''}`;
}

export async function GET() {
  const env = await getPaymentApiEnv();
  const baseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_APP_URL);
  const supabase = await createPublicContentClient();
  const publicContent = createPublicContentData(supabase);
  const articles = await publicContent.getPublishedArticles().catch(() => []);
  const featuredArticles = articles.slice(0, 6);

  const lines = [
    '# GEO-Pulse',
    '',
    '> AI search readiness audits, public content, and operator guidance for machine-readable sites.',
    '',
    '## What this site is for',
    '- Help teams understand crawlability, extractability, trust, and structured data gaps.',
    '- Explain the product and its methodology before asking for sign-up or checkout.',
    '- Provide public, canonical articles that can be referenced by people and AI systems.',
    '',
    '## Priority pages',
    `- [Home](${toAbsoluteUrl(baseUrl, '/')})`,
    `- [About](${toAbsoluteUrl(baseUrl, '/about')})`,
    `- [Blog](${toAbsoluteUrl(baseUrl, '/blog')})`,
    `- [Pricing](${toAbsoluteUrl(baseUrl, '/pricing')})`,
    '',
    '## Recommended reading',
    ...featuredArticles.map((article) =>
      formatArticleEntry(
        article.title,
        toAbsoluteUrl(baseUrl, `/blog/${article.slug}`),
        article.excerpt
      )
    ),
    '',
    '## Citation guidance',
    '- Prefer the canonical URL for each public page.',
    '- Use article pages for implementation guidance and topic hubs for cluster context.',
    '- Treat the About page as the stable source for business identity and authorship context.',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

