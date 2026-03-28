import { describe, expect, it } from 'vitest';
import { computeBenchmarkMetrics } from './benchmark-metrics';
import type { QueryCitationRow, QueryRunRow } from './benchmark-repository';

const queryRuns: QueryRunRow[] = [
  {
    id: 'run-1',
    run_group_id: 'group-1',
    domain_id: 'domain-1',
    query_id: 'query-1',
    model_id: 'openai/gpt-4.1-mini',
    auditor_model_id: null,
    status: 'completed',
    response_text: 'first',
    response_metadata: {},
    error_message: null,
    executed_at: '2026-03-26T00:00:00.000Z',
    created_at: '2026-03-26T00:00:00.000Z',
  },
  {
    id: 'run-2',
    run_group_id: 'group-1',
    domain_id: 'domain-1',
    query_id: 'query-2',
    model_id: 'openai/gpt-4.1-mini',
    auditor_model_id: null,
    status: 'completed',
    response_text: 'second',
    response_metadata: {},
    error_message: null,
    executed_at: '2026-03-26T00:00:00.000Z',
    created_at: '2026-03-26T00:00:00.000Z',
  },
  {
    id: 'run-3',
    run_group_id: 'group-1',
    domain_id: 'domain-1',
    query_id: 'query-3',
    model_id: 'openai/gpt-4.1-mini',
    auditor_model_id: null,
    status: 'skipped',
    response_text: null,
    response_metadata: {},
    error_message: 'not_implemented',
    executed_at: null,
    created_at: '2026-03-26T00:00:00.000Z',
  },
];

const citations: QueryCitationRow[] = [
  {
    id: 'citation-1',
    query_run_id: 'run-1',
    cited_domain: 'geopulse.ai',
    cited_url: 'https://www.geopulse.ai/pricing',
    grounding_evidence_id: null,
    grounding_page_url: null,
    grounding_page_type: null,
    rank_position: 1,
    citation_type: 'explicit_url',
    sentiment: null,
    confidence: 1,
    metadata: {
      grounding_provenance: {
        status: 'matched',
        match_method: 'exact_url',
      },
      grounding_claim_match: {
        status: 'supported_overlap',
      },
    },
    created_at: '2026-03-26T00:00:00.000Z',
  },
  {
    id: 'citation-2',
    query_run_id: 'run-1',
    cited_domain: 'example.com',
    cited_url: null,
    grounding_evidence_id: null,
    grounding_page_url: null,
    grounding_page_type: null,
    rank_position: 2,
    citation_type: 'explicit_domain',
    sentiment: null,
    confidence: 0.8,
    metadata: {
      grounding_provenance: {
        status: 'unresolved',
      },
      grounding_claim_match: {
        status: 'unavailable',
      },
    },
    created_at: '2026-03-26T00:00:00.000Z',
  },
  {
    id: 'citation-3',
    query_run_id: 'run-2',
    cited_domain: 'geopulse.ai',
    cited_url: null,
    grounding_evidence_id: null,
    grounding_page_url: null,
    grounding_page_type: null,
    rank_position: 1,
    citation_type: 'brand_mention',
    sentiment: null,
    confidence: 0.6,
    metadata: {
      grounding_provenance: {
        status: 'matched',
        match_method: 'normalized_page',
      },
      grounding_claim_match: {
        status: 'weak_overlap',
      },
    },
    created_at: '2026-03-26T00:00:00.000Z',
  },
];

describe('computeBenchmarkMetrics', () => {
  it('computes v1 benchmark metrics and internal counts', () => {
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 3,
      queryRuns,
      citations,
      measuredCanonicalDomain: 'geopulse.ai',
    });

    expect(metrics.queryCoverage).toBeCloseTo(2 / 3);
    expect(metrics.citationRate).toBe(1);
    expect(metrics.shareOfVoice).toBeCloseTo(2 / 3);
    expect(metrics.exactPageQualityRate).toBeCloseTo(1 / 2);
    expect(metrics.metrics.scheduled_runs).toBe(3);
    expect(metrics.metrics.completed_runs).toBe(2);
    expect(metrics.metrics.skipped_runs).toBe(1);
    expect(metrics.metrics.failed_runs).toBe(0);
    expect(metrics.metrics.cited_runs).toBe(2);
    expect(metrics.metrics.inclusion_rate).toBe(1);
    expect(metrics.metrics.explicit_url_citation_count).toBe(1);
    expect(metrics.metrics.explicit_domain_citation_count).toBe(1);
    expect(metrics.metrics.brand_mention_citation_count).toBe(1);
    expect(metrics.metrics.exact_page_matched_runs).toBe(2);
    expect(metrics.metrics.exact_page_supported_runs).toBe(1);
    expect(metrics.metrics.exact_page_quality_rate).toBeCloseTo(1 / 2);
  });

  it('returns zero metrics safely when there are no completed runs', () => {
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 0,
      queryRuns: [],
      citations: [],
      measuredCanonicalDomain: 'geopulse.ai',
    });

    expect(metrics.queryCoverage).toBe(0);
    expect(metrics.citationRate).toBe(0);
    expect(metrics.shareOfVoice).toBe(0);
    expect(metrics.exactPageQualityRate).toBe(0);
    expect(metrics.metrics.cited_runs).toBe(0);
  });
});
