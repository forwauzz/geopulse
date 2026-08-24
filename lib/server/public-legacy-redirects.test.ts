import { describe, expect, it } from 'vitest';
import { PUBLIC_LEGACY_REDIRECTS } from './public-legacy-redirects';

describe('public legacy redirects', () => {
  it('keeps every source unique and every redirect permanent', () => {
    const sources = PUBLIC_LEGACY_REDIRECTS.map((redirect) => redirect.source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(PUBLIC_LEGACY_REDIRECTS.every((redirect) => redirect.permanent)).toBe(true);
  });

  it('routes only absolute public paths to maintained canonical destinations', () => {
    for (const redirect of PUBLIC_LEGACY_REDIRECTS) {
      expect(redirect.source).toMatch(/^\/(?!\/)/);
      expect(redirect.destination).toMatch(/^\/(?!\/)/);
      expect(redirect.source).not.toContain(' ');
      expect(redirect.destination).not.toContain(' ');
      expect(redirect.source).not.toBe(redirect.destination);
    }
  });

  it('restores the retired free-scan path and observed Search Console failures', () => {
    expect(PUBLIC_LEGACY_REDIRECTS).toContainEqual({
      source: '/scan',
      destination: '/',
      permanent: true,
    });
    expect(PUBLIC_LEGACY_REDIRECTS.map((redirect) => redirect.source)).toEqual(
      expect.arrayContaining([
        '/blog/why-crawlable-pages-still-fail-in-ai-answers',
        '/blog/schema-present-but-page-still-unclear-pattern',
        '/blog/topic/benchmark_methodology_literacy',
        '/blog/geopulse',
      ])
    );
  });

  it('redirects only proven legacy article slugs to their maintained canonicals', () => {
    expect(PUBLIC_LEGACY_REDIRECTS).toEqual(
      expect.arrayContaining([
        {
          source: '/blog/how-to-audit-your-site-for-ai-search-readiness',
          destination: '/blog/ai-search-readiness-audit',
          permanent: true,
        },
        {
          source: '/blog/how-to-make-a-product-page-easier-for-ai-search',
          destination: '/blog/product-pages-ai-search',
          permanent: true,
        },
        {
          source: '/blog/mixed-intent-content',
          destination: '/blog/mixed-intent-content-that-confuses-buyers-and-models',
          permanent: true,
        },
      ])
    );

    expect(PUBLIC_LEGACY_REDIRECTS.map((redirect) => redirect.source)).not.toContain(
      '/blog/vertical-strategy'
    );
  });
});
