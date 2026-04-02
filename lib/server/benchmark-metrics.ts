import type { QueryCitationRow, QueryRunRow } from './benchmark-repository';

export type BenchmarkMetricComputation = {
  readonly queryCoverage: number;
  readonly citationRate: number;
  readonly measuredDomainCitationRate: number;
  readonly shareOfVoice: number;
  readonly exactPageQualityRate: number;
  readonly metrics: {
    readonly scheduled_runs: number;
    readonly completed_runs: number;
    readonly skipped_runs: number;
    readonly failed_runs: number;
    readonly cited_runs: number;
    readonly inclusion_rate: number;
    readonly measured_domain_cited_runs: number;
    readonly measured_domain_citation_rate: number;
    readonly domain_citation_count: number;
    readonly pool_citation_count: number;
    readonly explicit_url_citation_count: number;
    readonly explicit_domain_citation_count: number;
    readonly brand_mention_citation_count: number;
    readonly exact_page_matched_runs: number;
    readonly exact_page_supported_runs: number;
    readonly exact_page_quality_rate: number;
  };
};

function hasMatchedGroundedPage(metadata: Record<string, unknown>): boolean {
  const provenance = metadata['grounding_provenance'];
  return (
    !!provenance &&
    typeof provenance === 'object' &&
    (provenance as Record<string, unknown>)['status'] === 'matched'
  );
}

function hasSupportedGroundedClaim(metadata: Record<string, unknown>): boolean {
  const claimMatch = metadata['grounding_claim_match'];
  return (
    !!claimMatch &&
    typeof claimMatch === 'object' &&
    (claimMatch as Record<string, unknown>)['status'] === 'supported_overlap'
  );
}

export function computeBenchmarkMetrics(input: {
  readonly scheduledRuns: number;
  readonly queryRuns: readonly QueryRunRow[];
  readonly citations: readonly QueryCitationRow[];
  readonly measuredCanonicalDomain: string;
}): BenchmarkMetricComputation {
  const completedRuns = input.queryRuns.filter((row) => row.status === 'completed');
  const skippedRuns = input.queryRuns.filter((row) => row.status === 'skipped').length;
  const failedRuns = input.queryRuns.filter((row) => row.status === 'failed').length;
  const completedRunIds = new Set(completedRuns.map((row) => row.id));
  const citedRunIds = new Set(
    input.citations
      .filter((citation) => completedRunIds.has(citation.query_run_id))
      .map((citation) => citation.query_run_id)
  );
  const measuredDomainCitedRunIds = new Set(
    input.citations
      .filter(
        (citation) =>
          completedRunIds.has(citation.query_run_id) &&
          citation.cited_domain === input.measuredCanonicalDomain
      )
      .map((citation) => citation.query_run_id)
  );

  const domainCitationCount = input.citations.filter(
    (citation) => citation.cited_domain === input.measuredCanonicalDomain
  ).length;
  const poolCitationCount = input.citations.length;
  const explicitUrlCitationCount = input.citations.filter(
    (citation) => citation.citation_type === 'explicit_url'
  ).length;
  const explicitDomainCitationCount = input.citations.filter(
    (citation) => citation.citation_type === 'explicit_domain'
  ).length;
  const brandMentionCitationCount = input.citations.filter(
    (citation) => citation.citation_type === 'brand_mention'
  ).length;
  const measuredCitations = input.citations.filter(
    (citation) => citation.cited_domain === input.measuredCanonicalDomain
  );
  const exactPageMatchedRunIds = new Set(
    measuredCitations
      .filter(
        (citation) =>
          completedRunIds.has(citation.query_run_id) &&
          hasMatchedGroundedPage(citation.metadata ?? {})
      )
      .map((citation) => citation.query_run_id)
  );
  const exactPageSupportedRunIds = new Set(
    measuredCitations
      .filter(
        (citation) =>
          completedRunIds.has(citation.query_run_id) &&
          hasMatchedGroundedPage(citation.metadata ?? {}) &&
          hasSupportedGroundedClaim(citation.metadata ?? {})
      )
      .map((citation) => citation.query_run_id)
  );

  const queryCoverage =
    input.scheduledRuns > 0 ? completedRuns.length / input.scheduledRuns : 0;
  const citationRate =
    completedRuns.length > 0 ? citedRunIds.size / completedRuns.length : 0;
  const measuredDomainCitationRate =
    completedRuns.length > 0 ? measuredDomainCitedRunIds.size / completedRuns.length : 0;
  const shareOfVoice =
    poolCitationCount > 0 ? domainCitationCount / poolCitationCount : 0;
  const inclusionRate =
    completedRuns.length > 0 ? citedRunIds.size / completedRuns.length : 0;
  const exactPageQualityRate =
    completedRuns.length > 0 ? exactPageSupportedRunIds.size / completedRuns.length : 0;

  return {
    queryCoverage,
    citationRate,
    measuredDomainCitationRate,
    shareOfVoice,
    exactPageQualityRate,
    metrics: {
      scheduled_runs: input.scheduledRuns,
      completed_runs: completedRuns.length,
      skipped_runs: skippedRuns,
      failed_runs: failedRuns,
      cited_runs: citedRunIds.size,
      inclusion_rate: inclusionRate,
      measured_domain_cited_runs: measuredDomainCitedRunIds.size,
      measured_domain_citation_rate: measuredDomainCitationRate,
      domain_citation_count: domainCitationCount,
      pool_citation_count: poolCitationCount,
      explicit_url_citation_count: explicitUrlCitationCount,
      explicit_domain_citation_count: explicitDomainCitationCount,
      brand_mention_citation_count: brandMentionCitationCount,
      exact_page_matched_runs: exactPageMatchedRunIds.size,
      exact_page_supported_runs: exactPageSupportedRunIds.size,
      exact_page_quality_rate: exactPageQualityRate,
    },
  };
}
