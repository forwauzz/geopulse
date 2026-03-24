/**
 * Audit check registry — add new checks here only (Open/Closed).
 */
import type { AuditCheck } from '../../lib/interfaces/audit';
import type { LLMProvider } from '../../lib/interfaces/providers';
import { canonicalCheck } from './check-canonical';
import { createExtractabilityCheck } from './check-llm-extractability';
import { createQaPatternCheck } from './check-llm-qa';
import { headingStructureCheck } from './check-headings';
import { htmlSizeCheck } from './check-html-size';
import { httpsOnlyCheck } from './check-https-only';
import { internalLinksCheck } from './check-internal-links';
import { jsonLdCheck } from './check-jsonld';
import { metaDescriptionCheck } from './check-meta-description';
import { openGraphCheck } from './check-open-graph';
import { robotsMetaCheck } from './check-robots-meta';
import { titleTagCheck } from './check-title';
import { viewportCheck } from './check-viewport';

export function buildFreeTierChecks(llm: LLMProvider): AuditCheck[] {
  return [
    httpsOnlyCheck,
    titleTagCheck,
    metaDescriptionCheck,
    canonicalCheck,
    robotsMetaCheck,
    openGraphCheck,
    jsonLdCheck,
    headingStructureCheck,
    viewportCheck,
    htmlSizeCheck,
    internalLinksCheck,
    createQaPatternCheck(llm),
    createExtractabilityCheck(llm),
  ];
}
