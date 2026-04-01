import { describe, expect, it } from 'vitest';
import { buildBenchmarkRunDiagnostic } from './benchmark-run-diagnostic';
import type { BenchmarkRunGroupDetail } from './benchmark-admin-data';

describe('buildBenchmarkRunDiagnostic', () => {
  it('summarizes citation URL depth, provenance matches, and claim support', () => {
    const detail: BenchmarkRunGroupDetail = {
      runGroup: {
        id: 'run-1',
        query_set_id: 'set-1',
        label: 'scheduled',
        run_scope: 'scheduled_internal_benchmark',
        model_set_version: 'gemini-2.5-flash-lite',
        status: 'completed',
        notes: null,
        metadata: {
          run_mode: 'grounded_site',
          grounding_evidence: [
            {
              source_label: 'homepage',
              excerpt: 'Example excerpt',
              page_url: 'https://example.com/about',
            },
          ],
        },
        started_at: null,
        completed_at: null,
        created_at: '2026-03-29T12:00:00.000Z',
        domain_id: 'domain-1',
        domain: 'www.example.com',
        canonical_domain: 'example.com',
        site_url: 'https://www.example.com/',
        display_name: 'Example',
        query_set_name: 'law-firms-p1-core',
        query_set_version: 'v1',
        query_coverage: 1,
        citation_rate: 0.5,
        measured_domain_citation_rate: 0.5,
        share_of_voice: 0.5,
      },
      queryRuns: [
        {
          id: 'query-run-1',
          query_id: 'query-1',
          query_key: 'query-1',
          query_text: 'Question',
          status: 'completed',
          response_text: 'Answer',
          response_metadata: {},
          error_message: null,
          executed_at: null,
          citation_count: 2,
        },
      ],
      citations: [
        {
          id: 'citation-1',
          query_run_id: 'query-run-1',
          cited_domain: 'example.com',
          cited_url: 'https://example.com/about',
          grounding_evidence_id: 'evidence-1',
          grounding_page_url: 'https://example.com/about',
          grounding_page_type: 'about',
          rank_position: 1,
          citation_type: 'explicit_url',
          confidence: 0.9,
          metadata: {
            grounding_provenance: {
              status: 'matched',
              match_method: 'exact_url',
            },
            grounding_claim_match: {
              status: 'supported_overlap',
            },
          },
          created_at: '2026-03-29T12:00:00.000Z',
        },
        {
          id: 'citation-2',
          query_run_id: 'query-run-1',
          cited_domain: 'example.com',
          cited_url: null,
          grounding_evidence_id: null,
          grounding_page_url: null,
          grounding_page_type: null,
          rank_position: null,
          citation_type: 'explicit_domain',
          confidence: 0.5,
          metadata: {
            grounding_provenance: {
              status: 'unresolved',
            },
            grounding_claim_match: {
              status: 'weak_overlap',
            },
          },
          created_at: '2026-03-29T12:00:00.000Z',
        },
      ],
    };

    expect(buildBenchmarkRunDiagnostic(detail)).toEqual({
      runGroupId: 'run-1',
      canonicalDomain: 'example.com',
      runMode: 'grounded_site',
      queryCount: 1,
      citationCount: 2,
      pageUrlCitationCount: 1,
      domainOnlyCitationCount: 1,
      matchedCitationCount: 1,
      normalizedPageMatchCount: 0,
      exactUrlMatchCount: 1,
      supportedOverlapCount: 1,
      weakOrNoOverlapCount: 1,
      groundingEvidenceCount: 1,
      sampleCitedUrls: ['https://example.com/about'],
      sampleMatchedGroundingUrls: ['https://example.com/about'],
    });
  });
});
