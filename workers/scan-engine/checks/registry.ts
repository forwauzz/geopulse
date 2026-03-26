/**
 * Audit check registry — add new checks here only (Open/Closed).
 * Weights are relative importance; scoring normalizes to 0-100.
 */
import type { AuditCheck } from '../../lib/interfaces/audit';
import type { LLMProvider } from '../../lib/interfaces/providers';
import { aiCrawlerAccessCheck } from './check-ai-crawler-access';
import { altTextCheck } from './check-alt-text';
import { canonicalCheck } from './check-canonical';
import { eeatSignalsCheck } from './check-eeat-signals';
import { externalLinksCheck } from './check-external-links';
import { freshnessCheck } from './check-freshness';
import { createExtractabilityCheck } from './check-llm-extractability';
import { createQaPatternCheck } from './check-llm-qa';
import { llmsTxtCheck } from './check-llms-txt';
import { headingStructureCheck } from './check-headings';
import { htmlSizeCheck } from './check-html-size';
import { httpsOnlyCheck } from './check-https-only';
import { internalLinksCheck } from './check-internal-links';
import { jsonLdCheck } from './check-jsonld';
import { metaDescriptionCheck } from './check-meta-description';
import { openGraphCheck } from './check-open-graph';
import { robotsMetaCheck } from './check-robots-meta';
import { schemaTypesCheck } from './check-schema-types';
import { securityHeadersCheck } from './check-security-headers';
import { snippetEligibilityCheck } from './check-snippet-eligibility';
import { titleTagCheck } from './check-title';
import { viewportCheck } from './check-viewport';

const DETERMINISTIC_CHECKS: AuditCheck[] = [
  aiCrawlerAccessCheck,
  httpsOnlyCheck,
  titleTagCheck,
  metaDescriptionCheck,
  canonicalCheck,
  robotsMetaCheck,
  snippetEligibilityCheck,
  openGraphCheck,
  jsonLdCheck,
  schemaTypesCheck,
  headingStructureCheck,
  viewportCheck,
  htmlSizeCheck,
  internalLinksCheck,
  altTextCheck,
  externalLinksCheck,
  freshnessCheck,
  securityHeadersCheck,
  llmsTxtCheck,
  eeatSignalsCheck,
];

/**
 * Deterministic checks only (no LLM) — used for secondary pages in deep audits to cap Gemini usage.
 */
export function buildDeterministicChecks(): AuditCheck[] {
  return [...DETERMINISTIC_CHECKS];
}

export function buildFreeTierChecks(llm: LLMProvider): AuditCheck[] {
  return [...DETERMINISTIC_CHECKS, createQaPatternCheck(llm), createExtractabilityCheck(llm)];
}
