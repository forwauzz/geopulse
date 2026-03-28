import { describe, expect, it } from 'vitest';
import {
  formatBenchmarkCount,
  formatBenchmarkPercent,
  readBenchmarkGroundingEvidence,
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
            source_label: 'homepage',
            page_type: 'home',
            page_url: 'https://example.com/',
            evidence_label: 'Homepage',
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
        source_label: 'homepage',
        page_type: 'home',
        page_url: 'https://example.com/',
        evidence_label: 'Homepage',
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
});
