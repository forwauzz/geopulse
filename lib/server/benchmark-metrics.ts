import type { QueryCitationRow, QueryRunRow } from './benchmark-repository';

export type BenchmarkMetricComputation = {
  readonly queryCoverage: number;
  readonly citationRate: number;
  readonly shareOfVoice: number;
  readonly metrics: {
    readonly scheduled_runs: number;
    readonly completed_runs: number;
    readonly skipped_runs: number;
    readonly failed_runs: number;
    readonly cited_runs: number;
    readonly inclusion_rate: number;
    readonly domain_citation_count: number;
    readonly pool_citation_count: number;
    readonly explicit_url_citation_count: number;
    readonly explicit_domain_citation_count: number;
    readonly brand_mention_citation_count: number;
  };
};

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

  const queryCoverage =
    input.scheduledRuns > 0 ? completedRuns.length / input.scheduledRuns : 0;
  const citationRate =
    completedRuns.length > 0 ? citedRunIds.size / completedRuns.length : 0;
  const shareOfVoice =
    poolCitationCount > 0 ? domainCitationCount / poolCitationCount : 0;
  const inclusionRate =
    completedRuns.length > 0 ? citedRunIds.size / completedRuns.length : 0;

  return {
    queryCoverage,
    citationRate,
    shareOfVoice,
    metrics: {
      scheduled_runs: input.scheduledRuns,
      completed_runs: completedRuns.length,
      skipped_runs: skippedRuns,
      failed_runs: failedRuns,
      cited_runs: citedRunIds.size,
      inclusion_rate: inclusionRate,
      domain_citation_count: domainCitationCount,
      pool_citation_count: poolCitationCount,
      explicit_url_citation_count: explicitUrlCitationCount,
      explicit_domain_citation_count: explicitDomainCitationCount,
      brand_mention_citation_count: brandMentionCitationCount,
    },
  };
}
