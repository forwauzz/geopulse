/**
 * Audit check contracts — scan engine depends on this abstraction only (SOLID / D).
 */

export type CheckStatus =
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'NOT_EVALUATED'
  | 'LOW_CONFIDENCE'
  | 'WARNING';

export type CheckCategory =
  | 'ai_readiness'
  | 'extractability'
  | 'trust'
  | 'demand_coverage'
  | 'conversion_readiness';

export interface PageSignals {
  title: string | null;
  metaDescription: string | null;
  canonicalHref: string | null;
  robotsMetaContent: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  jsonLdSnippetCount: number;
  /** Schema.org @type values found in JSON-LD blocks. */
  jsonLdTypes: string[];
  h1Count: number;
  h2Count: number;
  hasViewportMeta: boolean;
  htmlCharLength: number;
  internalLinkCount: number;
  externalLinkCount: number;
  /** True if <meta name="author"> or structured author markup detected. */
  hasAuthorSignal: boolean;
  /** True if an internal link to an /about page was found. */
  hasAboutLink: boolean;
  /** True if nosnippet or max-snippet=0 found in meta robots. */
  hasSnippetRestriction: boolean;
  /** Total number of <img> elements found. */
  totalImages: number;
  /** Number of <img> elements missing a non-empty alt attribute. */
  imagesWithoutAlt: number;
  /** ISO date from article:published_time, datePublished in JSON-LD, or similar. */
  publishedDate: string | null;
  /** ISO date from article:modified_time, dateModified in JSON-LD, or similar. */
  modifiedDate: string | null;
}

export interface CheckContext {
  signals: PageSignals;
  finalUrl: string;
  /** First ~8k chars for LLM context */
  textSample: string;
  /** Raw robots.txt content from the target domain (empty string if unavailable). */
  robotsTxtContent: string;
  /** Raw /llms.txt content from the target domain (empty string if unavailable). */
  llmsTxtContent: string;
  /** Selected response headers from the page fetch. */
  responseHeaders: Record<string, string>;
}

export interface CheckResult {
  id: string;
  /** @deprecated Use `status` for v2 logic; kept for backward compat. */
  passed: boolean;
  status: CheckStatus;
  finding: string;
  fix?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface AuditCheck {
  id: string;
  name: string;
  /** Relative importance weight (scoring normalizes earned/possible to 0-100). */
  weight: number;
  category: CheckCategory;
  run: (ctx: CheckContext) => Promise<CheckResult> | CheckResult;
}

export interface WeightedCheckResult extends CheckResult {
  weight: number;
  category: CheckCategory;
}
