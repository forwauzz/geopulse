import { describe, expect, it } from 'vitest';
import { computeBenchmarkMetrics, inferProviderFromModelId } from './benchmark-metrics';
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
    expect(metrics.measuredDomainCitationRate).toBe(1);
    expect(metrics.shareOfVoice).toBeCloseTo(2 / 3);
    expect(metrics.exactPageQualityRate).toBeCloseTo(1 / 2);
    expect(metrics.metrics.scheduled_runs).toBe(3);
    expect(metrics.metrics.completed_runs).toBe(2);
    expect(metrics.metrics.skipped_runs).toBe(1);
    expect(metrics.metrics.failed_runs).toBe(0);
    expect(metrics.metrics.cited_runs).toBe(2);
    expect(metrics.metrics.inclusion_rate).toBe(1);
    expect(metrics.metrics.measured_domain_cited_runs).toBe(2);
    expect(metrics.metrics.measured_domain_citation_rate).toBe(1);
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
    expect(metrics.measuredDomainCitationRate).toBe(0);
    expect(metrics.shareOfVoice).toBe(0);
    expect(metrics.exactPageQualityRate).toBe(0);
    expect(metrics.metrics.cited_runs).toBe(0);
  });

  it('computes industry_rank as average rank_position across measured-domain cited runs', () => {
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 3,
      queryRuns,
      citations,
      measuredCanonicalDomain: 'geopulse.ai',
    });

    // citation-1 rank_position=1, citation-3 rank_position=1 → avg = 1
    expect(metrics.metrics.industry_rank).toBeCloseTo(1);
  });

  it('returns null industry_rank when no measured-domain citations have a rank_position', () => {
    const unrankedCitations: QueryCitationRow[] = citations.map((c) => ({
      ...c,
      rank_position: null,
    }));
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 3,
      queryRuns,
      citations: unrankedCitations,
      measuredCanonicalDomain: 'geopulse.ai',
    });

    expect(metrics.metrics.industry_rank).toBeNull();
  });

  it('returns zero platform visibility when no runs match the platform', () => {
    // All existing queryRuns have model_id='openai/gpt-4.1-mini'
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 3,
      queryRuns,
      citations,
      measuredCanonicalDomain: 'geopulse.ai',
    });

    expect(metrics.visibilityPctByPlatform.gemini).toBe(0);
    expect(metrics.visibilityPctByPlatform.perplexity).toBe(0);
    expect(metrics.metrics.gemini_visibility_pct).toBe(0);
    expect(metrics.metrics.perplexity_visibility_pct).toBe(0);
  });

  it('computes per-platform visibility_pct independently', () => {
    const multiPlatformRuns: QueryRunRow[] = [
      { ...queryRuns[0]!, id: 'run-gpt', model_id: 'gpt-4o-mini', status: 'completed' },
      { ...queryRuns[0]!, id: 'run-gemini', model_id: 'gemini-2.0-flash', status: 'completed' },
      { ...queryRuns[0]!, id: 'run-perplexity', model_id: 'llama-3.1-sonar-small-128k-online', status: 'completed' },
    ];
    // only gpt and gemini cite the measured domain; perplexity does not
    const multiPlatformCitations: QueryCitationRow[] = [
      { ...citations[0]!, id: 'c-gpt', query_run_id: 'run-gpt', cited_domain: 'geopulse.ai' },
      { ...citations[0]!, id: 'c-gemini', query_run_id: 'run-gemini', cited_domain: 'geopulse.ai' },
    ];
    const metrics = computeBenchmarkMetrics({
      scheduledRuns: 3,
      queryRuns: multiPlatformRuns,
      citations: multiPlatformCitations,
      measuredCanonicalDomain: 'geopulse.ai',
    });

    expect(metrics.visibilityPctByPlatform.openai).toBe(1);
    expect(metrics.visibilityPctByPlatform.gemini).toBe(1);
    expect(metrics.visibilityPctByPlatform.perplexity).toBe(0);
    expect(metrics.metrics.chatgpt_visibility_pct).toBe(1);
    expect(metrics.metrics.gemini_visibility_pct).toBe(1);
    expect(metrics.metrics.perplexity_visibility_pct).toBe(0);
  });
});

describe('inferProviderFromModelId (GPM-005)', () => {
  it('infers openai from gpt- prefix', () => {
    expect(inferProviderFromModelId('gpt-4o-mini')).toBe('openai');
    expect(inferProviderFromModelId('gpt-4.1')).toBe('openai');
  });

  it('infers openai from openai/ vendor prefix', () => {
    expect(inferProviderFromModelId('openai/gpt-4.1-mini')).toBe('openai');
  });

  it('infers openai from o-series model IDs', () => {
    expect(inferProviderFromModelId('o1')).toBe('openai');
    expect(inferProviderFromModelId('o3-mini')).toBe('openai');
    expect(inferProviderFromModelId('o4-mini')).toBe('openai');
  });

  it('infers gemini from gemini- prefix', () => {
    expect(inferProviderFromModelId('gemini-2.0-flash')).toBe('gemini');
    expect(inferProviderFromModelId('gemini-1.5-pro')).toBe('gemini');
  });

  it('infers gemini from models/gemini- Google API format', () => {
    expect(inferProviderFromModelId('models/gemini-2.0-flash')).toBe('gemini');
  });

  it('infers perplexity from sonar models', () => {
    expect(inferProviderFromModelId('llama-3.1-sonar-small-128k-online')).toBe('perplexity');
    expect(inferProviderFromModelId('sonar-pro')).toBe('perplexity');
  });

  it('infers perplexity from perplexity/ vendor prefix', () => {
    expect(inferProviderFromModelId('perplexity/sonar-pro')).toBe('perplexity');
  });

  it('returns unknown for unrecognized model IDs', () => {
    expect(inferProviderFromModelId('claude-3-opus')).toBe('unknown');
    expect(inferProviderFromModelId('mistral-7b')).toBe('unknown');
  });
});
