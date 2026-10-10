import { describe, expect, it } from 'vitest';
import {
  isPublicLegacyRedirectSource,
  PUBLIC_LEGACY_REDIRECTS,
  replacePublicLegacyMarkdownLinks,
} from './public-legacy-redirects';

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
        '/&',
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
        {
          source: '/blog/why-docs-style-navigation-improves-discoverability',
          destination: '/blog/canonical-site-first-newsletter-second-explained',
          permanent: true,
        },
        {
          source: '/blog/information-freshness-is-becoming-a-separate-ai-visibility-problem',
          destination: '/blog/high-traffic-stale-guides-pattern',
          permanent: true,
        },
        {
          source: '/blog/share-of-voice-and-citation-audits-solve-different-jobs',
          destination: '/blog/what-citation-rate-share-of-voice-and-coverage-mean',
          permanent: true,
        },
        {
          source: '/blog/what-is-geo-pulse',
          destination: '/blog/seo-ge-pulse',
          permanent: true,
        },
        {
          source: '/blog/unlocking-geo',
          destination: '/blog/seo-geo-optimization',
          permanent: true,
        },
        {
          source: '/blog/entity-mapping-for-ai-search',
          destination: '/blog/inconsistent-naming-that-lowers-citation-confidence',
          permanent: true,
        },
        {
          source: '/blog/how-to-use-grounded-evidence-in-content-decisioning',
          destination: '/blog/grounding-quality-checklist-for-internal-reviews',
          permanent: true,
        },
      ])
    );

    const redirectSources = PUBLIC_LEGACY_REDIRECTS.map((redirect) => redirect.source);
    for (const obsoletePath of [
      '/blog/vertical-strategy',
      '/blog/ecommerce-geo-checklist-for-category-and-product-pages',
      '/blog/fast-publishing-without-quality-controls-pattern',
    ]) {
      expect(redirectSources).not.toContain(obsoletePath);
    }
  });

  it('identifies redirect sources so sitemaps can exclude them', () => {
    expect(isPublicLegacyRedirectSource('/blog/long-intro-low-utility-content-pattern')).toBe(true);
    expect(isPublicLegacyRedirectSource('/blog/crawlable-but-not-extractable')).toBe(false);
  });

  it('replaces exact legacy markdown links without rewriting prose or partial paths', () => {
    const result = replacePublicLegacyMarkdownLinks([
      '[freshness](/blog/information-freshness-is-becoming-a-separate-ai-visibility-problem)',
      '[metrics](/blog/share-of-voice-and-citation-audits-solve-different-jobs)',
      'Mention /blog/what-is-geo-pulse as text.',
      '[partial](/blog/what-is-geo-pulse-more)',
    ].join('\n'));

    expect(result.markdown).toContain('[freshness](/blog/high-traffic-stale-guides-pattern)');
    expect(result.markdown).toContain(
      '[metrics](/blog/what-citation-rate-share-of-voice-and-coverage-mean)'
    );
    expect(result.markdown).toContain('Mention /blog/what-is-geo-pulse as text.');
    expect(result.markdown).toContain('[partial](/blog/what-is-geo-pulse-more)');
    expect(result.replacements).toEqual([
      {
        source: '/blog/information-freshness-is-becoming-a-separate-ai-visibility-problem',
        destination: '/blog/high-traffic-stale-guides-pattern',
        count: 1,
      },
      {
        source: '/blog/share-of-voice-and-citation-audits-solve-different-jobs',
        destination: '/blog/what-citation-rate-share-of-voice-and-coverage-mean',
        count: 1,
      },
    ]);
  });
});
