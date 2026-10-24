import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPaymentApiEnv: vi.fn(),
  getPublishedArticles: vi.fn(),
  createServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/server/cf-env', () => ({ getPaymentApiEnv: mocks.getPaymentApiEnv }));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock('@/lib/server/public-content-data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/public-content-data')>();
  return {
    ...original,
    createPublicContentData: vi.fn(() => ({
      getPublishedArticles: mocks.getPublishedArticles,
    })),
  };
});

import { GET as getArticleSitemap } from './sitemap.xml/route';
import { GET as getTopicSitemap } from './topic/sitemap.xml/route';

const publishedArticle = {
  id: 'article-1',
  content_id: 'content-1',
  slug: 'msp-proof-before-promises',
  title: 'MSP proof before promises',
  target_persona: 'msp_owner',
  primary_problem: 'Unverifiable AI-search claims',
  topic_cluster: 'AI Search & MSPs',
  cta_goal: 'free_scan',
  canonical_url: '/blog/msp-proof-before-promises',
  published_at: '2026-10-24T11:00:00.000Z',
  updated_at: '2026-10-24T11:30:00.000Z',
  excerpt: 'Use source-linked evidence.',
  metadata: {},
};

describe('public blog sitemap routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaymentApiEnv.mockResolvedValue({
      NEXT_PUBLIC_APP_URL: 'https://tracking.invalid',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    });
    mocks.getPublishedArticles.mockResolvedValue([publishedArticle]);
  });

  it('emits only safe canonical article URLs from readable production inventory', async () => {
    mocks.getPublishedArticles.mockResolvedValue([
      publishedArticle,
      { ...publishedArticle, id: 'article-2', content_id: 'content-2', slug: 'unsafe slug' },
      {
        ...publishedArticle,
        id: 'article-3',
        content_id: 'content-3',
        slug: 'private-draft',
        canonical_url: '/blog/private-draft',
        metadata: { noindex: true },
      },
    ]);

    const response = await getArticleSitemap();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('https://getgeopulse.com/blog/msp-proof-before-promises');
    expect(body).not.toContain('tracking.invalid');
    expect(body).not.toContain('unsafe slug');
    expect(body).not.toContain('private-draft');
  });

  it('keeps display labels out of canonical topic paths', async () => {
    const response = await getTopicSitemap();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('https://getgeopulse.com/blog/topic/ai-search-msps');
    expect(body).not.toContain('AI Search &amp; MSPs');
    expect(body).not.toContain('tracking.invalid');
  });

  it.each([
    ['article', getArticleSitemap],
    ['topic', getTopicSitemap],
  ])('returns a sanitized retryable 503 when the %s inventory query fails', async (_name, getSitemap) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getPublishedArticles.mockRejectedValue(
      new Error('password=secret upstream error code: 1016')
    );

    const response = await getSitemap();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('300');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(body).toBe('Service temporarily unavailable.\n');
    expect(body).not.toContain('1016');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret');
    consoleError.mockRestore();
  });

  it.each([
    ['article', getArticleSitemap],
    ['topic', getTopicSitemap],
  ])('does not publish an empty %s sitemap when content credentials are missing', async (_name, getSitemap) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getPaymentApiEnv.mockResolvedValue({
      NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });

    const response = await getSitemap();

    expect(response.status).toBe(503);
    expect(mocks.getPublishedArticles).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
