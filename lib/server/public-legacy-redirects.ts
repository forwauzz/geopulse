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
] as const;
