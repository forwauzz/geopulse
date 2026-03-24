/**
 * Audit check contracts — scan engine depends on this abstraction only (SOLID / D).
 */

export interface PageSignals {
  title: string | null;
  metaDescription: string | null;
  canonicalHref: string | null;
  robotsMetaContent: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  jsonLdSnippetCount: number;
  h1Count: number;
  h2Count: number;
  hasViewportMeta: boolean;
  htmlCharLength: number;
  internalLinkCount: number;
  externalLinkCount: number;
}

export interface CheckContext {
  signals: PageSignals;
  finalUrl: string;
  /** First ~8k chars for LLM context */
  textSample: string;
}

export interface CheckResult {
  id: string;
  passed: boolean;
  finding: string;
  fix?: string;
}

export interface AuditCheck {
  id: string;
  name: string;
  /** Points awarded when this check passes (weights sum to 100 across registry). */
  weight: number;
  run: (ctx: CheckContext) => Promise<CheckResult> | CheckResult;
}

export interface WeightedCheckResult extends CheckResult {
  weight: number;
}
