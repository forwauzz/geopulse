import type { BenchmarkRunGroupDetail } from './benchmark-admin-data';
import {
  readBenchmarkGroundingClaimMatch,
  readBenchmarkGroundingEvidence,
  readBenchmarkGroundingProvenance,
} from './benchmark-run-detail';

export type BenchmarkRunDiagnostic = {
  readonly runGroupId: string;
  readonly canonicalDomain: string;
  readonly runMode: string | null;
  readonly queryCount: number;
  readonly citationCount: number;
  readonly pageUrlCitationCount: number;
  readonly domainOnlyCitationCount: number;
  readonly matchedCitationCount: number;
  readonly normalizedPageMatchCount: number;
  readonly exactUrlMatchCount: number;
  readonly supportedOverlapCount: number;
  readonly weakOrNoOverlapCount: number;
  readonly groundingEvidenceCount: number;
  readonly sampleCitedUrls: readonly string[];
  readonly sampleMatchedGroundingUrls: readonly string[];
};

export function buildBenchmarkRunDiagnostic(detail: BenchmarkRunGroupDetail): BenchmarkRunDiagnostic {
  let pageUrlCitationCount = 0;
  let domainOnlyCitationCount = 0;
  let matchedCitationCount = 0;
  let normalizedPageMatchCount = 0;
  let exactUrlMatchCount = 0;
  let supportedOverlapCount = 0;
  let weakOrNoOverlapCount = 0;

  const sampleCitedUrls = new Set<string>();
  const sampleMatchedGroundingUrls = new Set<string>();

  for (const citation of detail.citations) {
    if (citation.cited_url) {
      pageUrlCitationCount += 1;
      if (sampleCitedUrls.size < 5) {
        sampleCitedUrls.add(citation.cited_url);
      }
    } else {
      domainOnlyCitationCount += 1;
    }

    const provenance = readBenchmarkGroundingProvenance(citation.metadata);
    if (provenance.status === 'matched') {
      matchedCitationCount += 1;
      if (provenance.matchMethod === 'normalized_page') {
        normalizedPageMatchCount += 1;
      }
      if (provenance.matchMethod === 'exact_url') {
        exactUrlMatchCount += 1;
      }
      if (citation.grounding_page_url && sampleMatchedGroundingUrls.size < 5) {
        sampleMatchedGroundingUrls.add(citation.grounding_page_url);
      }
    }

    const claimMatch = readBenchmarkGroundingClaimMatch(citation.metadata);
    if (claimMatch.status === 'supported_overlap') {
      supportedOverlapCount += 1;
    }
    if (claimMatch.status === 'weak_overlap' || claimMatch.status === 'no_overlap') {
      weakOrNoOverlapCount += 1;
    }
  }

  return {
    runGroupId: detail.runGroup.id,
    canonicalDomain: detail.runGroup.canonical_domain,
    runMode:
      typeof detail.runGroup.metadata['run_mode'] === 'string'
        ? String(detail.runGroup.metadata['run_mode'])
        : null,
    queryCount: detail.queryRuns.length,
    citationCount: detail.citations.length,
    pageUrlCitationCount,
    domainOnlyCitationCount,
    matchedCitationCount,
    normalizedPageMatchCount,
    exactUrlMatchCount,
    supportedOverlapCount,
    weakOrNoOverlapCount,
    groundingEvidenceCount: readBenchmarkGroundingEvidence(detail.runGroup.metadata).length,
    sampleCitedUrls: Array.from(sampleCitedUrls),
    sampleMatchedGroundingUrls: Array.from(sampleMatchedGroundingUrls),
  };
}
