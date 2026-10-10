export type PublicLegacyRedirect = {
  readonly source: string;
  readonly destination: string;
  readonly permanent: true;
};

/**
 * Narrow redirects for public URLs that GEO-Pulse previously submitted or linked.
 * Each target is the closest maintained canonical page; unknown 404s stay 404.
 */
export const PUBLIC_LEGACY_REDIRECTS: readonly PublicLegacyRedirect[] = [
  { source: '/scan', destination: '/', permanent: true },
  { source: '/&', destination: '/', permanent: true },
  {
    source: '/blog/publish-governance-checklist-for-100-topic-programs',
    destination: '/blog/what-a-lean-content-governance-model-looks-like',
    permanent: true,
  },
  {
    source: '/blog/how-to-make-a-product-page-easier-for-ai-search-to-understand',
    destination: '/blog/product-pages-ai-search',
    permanent: true,
  },
  {
    source: '/blog/how-to-make-a-product-page-easier-for-ai-search',
    destination: '/blog/product-pages-ai-search',
    permanent: true,
  },
  {
    source: '/blog/how-to-audit-your-site-for-ai-search-readiness',
    destination: '/blog/ai-search-readiness-audit',
    permanent: true,
  },
  {
    source: '/blog/mixed-intent-content',
    destination: '/blog/mixed-intent-content-that-confuses-buyers-and-models',
    permanent: true,
  },
  {
    source: '/blog/long-intro-low-utility-content-pattern',
    destination: '/blog/crawlable-but-not-extractable',
    permanent: true,
  },
  {
    source: '/blog/schema-present-but-page-still-unclear-pattern',
    destination: '/blog/schema-is-necessary-but-not-sufficient',
    permanent: true,
  },
  {
    source: '/blog/extractability-audit-checklist-for-content-pages',
    destination: '/blog/crawlable-but-not-extractable',
    permanent: true,
  },
  {
    source: '/blog/why-crawlable-pages-still-fail-in-ai-answers',
    destination: '/blog/crawlable-but-not-extractable',
    permanent: true,
  },
  {
    source: '/blog/correct-domain-wrong-page-pattern',
    destination: '/blog/grounded-vs-ungrounded-modes-explained',
    permanent: true,
  },
  {
    source: '/blog/topic/benchmark_methodology_literacy',
    destination: '/methodology/ai-search-readiness-audit',
    permanent: true,
  },
  {
    source: '/blog/geopulse',
    destination: '/blog/seo-ge-pulse',
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
] as const;

const PUBLIC_LEGACY_REDIRECT_SOURCES = new Set(
  PUBLIC_LEGACY_REDIRECTS.map((redirect) => redirect.source),
);

export function isPublicLegacyRedirectSource(path: string): boolean {
  return PUBLIC_LEGACY_REDIRECT_SOURCES.has(path);
}

export type PublicLegacyMarkdownLinkReplacement = {
  readonly source: string;
  readonly destination: string;
  readonly count: number;
};

export function replacePublicLegacyMarkdownLinks(markdown: string): {
  readonly markdown: string;
  readonly replacements: readonly PublicLegacyMarkdownLinkReplacement[];
} {
  let next = markdown;
  const replacements: PublicLegacyMarkdownLinkReplacement[] = [];

  for (const redirect of PUBLIC_LEGACY_REDIRECTS) {
    const legacyLink = `](${redirect.source})`;
    const count = next.split(legacyLink).length - 1;
    if (count === 0) continue;
    next = next.replaceAll(legacyLink, `](${redirect.destination})`);
    replacements.push({
      source: redirect.source,
      destination: redirect.destination,
      count,
    });
  }

  return { markdown: next, replacements };
}
