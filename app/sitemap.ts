import type { MetadataRoute } from 'next';
import { getPaymentApiEnv } from '@/lib/server/cf-env';

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
    {
      url: withBase(baseUrl, '/about'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
  return staticEntries;
}
