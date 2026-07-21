/**
 * The check catalog — the published, data-driven source of truth for how every check
 * is bucketed and weighted (spec §3 / C6 / C7).
 *
 * Three buckets; only the first two feed the AI-readiness headline:
 *   - eligibility    (Bucket A) — can AI engines reach, crawl, and cite this site at all.
 *   - understanding  (Bucket B) — on-page structure, schema, and trust evidence.
 *   - hygiene        (Bucket C) — good practice worth reporting, but NOT a citation
 *                     lever. Hygiene never influences the AI-readiness score.
 *
 * llms.txt is deliberately weight 0: no major engine honors it as a citation signal
 * (Google says it does nothing for Search). It is offered as an optional experiment
 * with no score penalty and no promised benefit.
 */

export type CheckBucket = 'eligibility' | 'understanding' | 'hygiene';

export interface CatalogEntry {
  id: string;
  bucket: CheckBucket;
  /** Relative weight inside the AI-readiness blend (hygiene weights are display-only). */
  weight: number;
  /** Plain-English reason this check matters to a business owner. */
  whyItMatters: string;
}

export const CHECK_CATALOG_VERSION = '2026-07-21';

export const CHECK_CATALOG: readonly CatalogEntry[] = [
  // ── Bucket A — AI Retrieval Eligibility (gates everything) ──────────────────
  {
    id: 'ai-crawler-access',
    bucket: 'eligibility',
    weight: 12,
    whyItMatters: 'If AI search agents cannot reach your site, nothing else on this report matters — you are invisible in AI answers.',
  },
  {
    id: 'robots-meta',
    bucket: 'eligibility',
    weight: 8,
    whyItMatters: 'A noindex tag removes the page from search and AI answers entirely.',
  },
  {
    id: 'snippet-eligibility',
    bucket: 'eligibility',
    weight: 6,
    whyItMatters: 'Snippet restrictions make Google unable to quote you — including in AI Overviews.',
  },
  {
    id: 'https-only',
    bucket: 'eligibility',
    weight: 4,
    whyItMatters: 'Engines treat non-HTTPS pages as second-class and may refuse to cite them.',
  },
  {
    id: 'canonical',
    bucket: 'eligibility',
    weight: 4,
    whyItMatters: 'A wrong canonical hands your citation credit to a different URL.',
  },
  // ── Bucket B — AI Understanding & Trust ─────────────────────────────────────
  {
    id: 'llm-qa-pattern',
    bucket: 'understanding',
    weight: 10,
    whyItMatters: 'Pages that answer real questions directly are what AI engines quote — ~44% of ChatGPT citations come from the first 30% of a page.',
  },
  {
    id: 'llm-extractability',
    bucket: 'understanding',
    weight: 7,
    whyItMatters: 'If a model cannot cleanly extract what you do, who you serve, and how to contact you, it cites a competitor it can parse.',
  },
  {
    id: 'json-ld',
    bucket: 'understanding',
    weight: 6,
    whyItMatters: 'Valid structured data helps engines understand your business. It is an understanding aid, not a citation switch.',
  },
  {
    id: 'eeat-signals',
    bucket: 'understanding',
    weight: 6,
    whyItMatters: 'Real trust evidence — an identified business, people, credentials — is what engines look for before recommending you.',
  },
  {
    id: 'schema-types',
    bucket: 'understanding',
    weight: 5,
    whyItMatters: 'Specific schema types (LocalBusiness, FAQPage, Article) tell engines exactly what kind of content this is.',
  },
  {
    id: 'internal-links',
    bucket: 'understanding',
    weight: 5,
    whyItMatters: 'Internal links are how crawlers discover the rest of your site from any page.',
  },
  {
    id: 'title-tag',
    bucket: 'understanding',
    weight: 4,
    whyItMatters: 'The title is the strongest single line engines use to decide what a page is about.',
  },
  {
    id: 'heading-structure',
    bucket: 'understanding',
    weight: 4,
    whyItMatters: 'Clear headings are the outline AI engines use to extract answers.',
  },
  {
    id: 'html-size',
    bucket: 'understanding',
    weight: 3,
    whyItMatters: 'Bloated or script-only pages get truncated or skipped by AI crawlers — rendered text availability is what counts.',
  },
  {
    id: 'freshness',
    bucket: 'understanding',
    weight: 3,
    whyItMatters: 'For pricing, security, and compliance topics, engines prefer recently-updated sources. (Evergreen pages are fine as-is.)',
  },
  {
    id: 'alt-text',
    bucket: 'understanding',
    weight: 2,
    whyItMatters: 'Alt text is the only way engines read your images.',
  },
  {
    id: 'external-links',
    bucket: 'understanding',
    weight: 2,
    whyItMatters: 'Citing real sources signals researched, trustworthy content.',
  },
  {
    id: 'information-gain',
    bucket: 'understanding',
    weight: 3,
    whyItMatters: 'Engines cite what is distinct: original numbers, case studies, and specifics beat templated agency copy every time.',
  },
  {
    id: 'hreflang-parity',
    bucket: 'understanding',
    weight: 2,
    whyItMatters: 'For bilingual audiences (EN/FR), coherent hreflang decides which language version engines show — broken annotations split your identity.',
  },
  // ── Bucket C — Website Hygiene (reported, NOT in the AI score) ──────────────
  {
    id: 'meta-description',
    bucket: 'hygiene',
    weight: 3,
    whyItMatters: 'Good practice for click-through in classic search; not a lever for AI citation.',
  },
  {
    id: 'open-graph',
    bucket: 'hygiene',
    weight: 3,
    whyItMatters: 'Makes shared links look right in social and chat previews; not a citation lever.',
  },
  {
    id: 'viewport',
    bucket: 'hygiene',
    weight: 2,
    whyItMatters: 'Mobile usability baseline; not a citation lever.',
  },
  {
    id: 'security-headers',
    bucket: 'hygiene',
    weight: 2,
    whyItMatters: 'Good security practice worth fixing; engines do not use these headers to decide citations.',
  },
  {
    id: 'llms-txt',
    bucket: 'hygiene',
    weight: 0,
    whyItMatters: 'Optional experiment. No major engine honors llms.txt as a citation signal today; publishing one neither helps nor hurts your score.',
  },
];

const byId = new Map(CHECK_CATALOG.map((e) => [e.id, e]));

export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

export function bucketOf(id: string): CheckBucket {
  return byId.get(id)?.bucket ?? 'understanding';
}

export function weightOf(id: string, fallback: number): number {
  return byId.get(id)?.weight ?? fallback;
}

export const BUCKET_LABELS: Record<CheckBucket, string> = {
  eligibility: 'AI Retrieval Eligibility',
  understanding: 'AI Understanding & Trust',
  hygiene: 'Website Hygiene (not in the AI score)',
};
