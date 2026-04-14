import { describe, expect, it } from 'vitest';
import {
  formatBenchmarkCount,
  formatBenchmarkPercent,
  readBenchmarkGroundingClaimMatch,
  readBenchmarkGroundingEvidence,
  readBenchmarkGroundingProvenance,
  readBenchmarkResponseBody,
} from './benchmark-run-detail';

describe('benchmark run detail helpers', () => {
  it('reads a non-empty response body from metadata', () => {
    expect(readBenchmarkResponseBody({ response_body: 'provider error body' })).toBe(
      'provider error body'
    );
    expect(readBenchmarkResponseBody({ response_body: '   ' })).toBeNull();
    expect(readBenchmarkResponseBody({})).toBeNull();
  });

  it('filters malformed grounding evidence items', () => {
    expect(
      readBenchmarkGroundingEvidence({
        grounding_evidence: [
          {
            evidence_id: 'ge-home',
            source_label: 'homepage',
            page_type: 'home',
            page_url: 'https://example.com/',
            evidence_label: 'Homepage',
            page_title: 'Homepage',
            fetch_status: 'ok',
            fetch_order: 0,
            selection_reason: 'homepage_seed',
            excerpt: 'Example provides healthcare technology consulting.',
          },
          {
            source_label: '',
            excerpt: 'missing source label should be ignored',
          },
          {
            source_label: 'about',
            excerpt: '',
          },
          'invalid',
        ],
      })
    ).toEqual([
      {
        evidence_id: 'ge-home',
        source_label: 'homepage',
        page_type: 'home',
        page_url: 'https://example.com/',
        evidence_label: 'Homepage',
        page_title: 'Homepage',
        fetch_status: 'ok',
        fetch_order: 0,
        selection_reason: 'homepage_seed',
        excerpt: 'Example provides healthcare technology consulting.',
      },
    ]);
  });

  it('formats counts and percentages conservatively', () => {
    expect(formatBenchmarkPercent(0.876)).toBe('88%');
    expect(formatBenchmarkPercent(null)).toBe('—');
    expect(formatBenchmarkCount(7)).toBe('7');
    expect(formatBenchmarkCount('7')).toBe('—');
  });

  it('reads grounding provenance metadata conservatively', () => {
    expect(
      readBenchmarkGroundingProvenance({
        grounding_provenance: {
          status: 'matched',
          match_method: 'normalized_page',
          confidence: 0.9,
          grounding_evidence_id: 'ge-about',
        },
      })
    ).toEqual({
      status: 'matched',
      matchMethod: 'normalized_page',
      confidence: 0.9,
      groundingEvidenceId: 'ge-about',
    });

    expect(readBenchmarkGroundingProvenance({})).toEqual({
      status: 'unresolved',
      matchMethod: null,
      confidence: null,
      groundingEvidenceId: null,
    });
  });

  it('reads grounding claim-match metadata conservatively', () => {
    expect(
      readBenchmarkGroundingClaimMatch({
        grounding_claim_match: {
          status: 'supported_overlap',
          claim_text: 'GeoPulse explains AI visibility measurement for enterprise teams.',
          overlap_token_count: 4,
          claim_token_count: 7,
          evidence_token_count: 10,
          overlap_ratio: 0.571,
        },
      })
    ).toEqual({
      status: 'supported_overlap',
      claimText: 'GeoPulse explains AI visibility measurement for enterprise teams.',
      overlapTokenCount: 4,
      claimTokenCount: 7,
      evidenceTokenCount: 10,
      overlapRatio: 0.571,
    });

    expect(readBenchmarkGroundingClaimMatch({})).toEqual({
      status: 'unavailable',
      claimText: null,
      overlapTokenCount: 0,
      claimTokenCount: 0,
      evidenceTokenCount: 0,
      overlapRatio: 0,
    });
  });
});
