import type { MetadataRoute } from 'next';
import { getPaymentApiEnv } from '@/lib/server/cf-env';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const env = await getPaymentApiEnv();
  const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/').replace(/\/+$/, '');

  return {
    rules: [
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'CloudflareBrowserRenderingCrawler', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/results/'],
      },
    ],
    sitemap: [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/blog/sitemap.xml`,
      `${baseUrl}/blog/topic/sitemap.xml`,
    ],
  };
}
