import { describe, expect, it } from 'vitest';
import { normalizeEvalDomain, summarizePromptfooResults } from './promptfoo-results';

describe('normalizeEvalDomain', () => {
  it('prefers explicit fallback domain', () => {
    expect(normalizeEvalDomain('https://Example.com/path', 'WWW.Acme.test')).toBe('acme.test');
  });

  it('extracts hostname from site url', () => {
    expect(normalizeEvalDomain('https://Example.com/path')).toBe('example.com');
  });

  it('handles host-like input without protocol', () => {
    expect(normalizeEvalDomain('Example.com/products')).toBe('example.com');
  });

  it('canonicalizes www domains for stable grouping', () => {
    expect(normalizeEvalDomain('https://www.Example.com/path')).toBe('example.com');
  });
});

describe('summarizePromptfooResults', () => {
  it('summarizes report promptfoo results', () => {
    const summary = summarizePromptfooResults('promptfoo_report', {
      evalId: 'eval-report',
      config: { description: 'Report suite' },
      metadata: { promptfooVersion: '0.121.3', exportedAt: '2026-03-26T00:00:00.000Z' },
      results: {
        prompts: [{ label: 'report-local' }],
        results: [
          {
            success: true,
            score: 1,
            latencyMs: 10,
            testCase: { description: 'summary still extractable' },
            gradingResult: { componentResults: [{ pass: true }, { pass: true }] },
          },
          {
            success: false,
            score: 0,
            latencyMs: 20,
            testCase: { description: 'coverage still extractable' },
            gradingResult: { componentResults: [{ pass: false }] },
          },
        ],
        stats: { successes: 1, failures: 1, errors: 0, durationMs: 30 },
      },
    });

    expect(summary.overallScore).toBe(50);
    expect(summary.metrics['total_tests']).toBe(2);
    expect(summary.metrics['assertions_passed']).toBe(2);
    expect(summary.metrics['assertions_failed']).toBe(1);
    expect(summary.metadata['eval_id']).toBe('eval-report');
  });

  it('summarizes retrieval promptfoo results with retrieval metrics', () => {
    const summary = summarizePromptfooResults('promptfoo_retrieval', {
      evalId: 'eval-retrieval',
      config: { description: 'Retrieval suite' },
      metadata: { promptfooVersion: '0.121.3' },
      results: {
        prompts: [{ label: 'retrieval-local' }],
        results: [
          {
            success: true,
            score: 1,
            latencyMs: 12,
            testCase: { description: 'retrieves expected page' },
            gradingResult: { componentResults: [{ pass: true }] },
            response: {
              output: JSON.stringify({
                retrievedExpectedPage: true,
                answerMentionsExpectedFact: true,
                citationCount: 2,
                unsupportedClaimCount: 0,
              }),
            },
          },
          {
            success: true,
            score: 1,
            latencyMs: 8,
            testCase: { description: 'does not invent facts' },
            gradingResult: { componentResults: [{ pass: true }] },
            response: {
              output: JSON.stringify({
                retrievedExpectedPage: false,
                answerMentionsExpectedFact: false,
                citationCount: 0,
                unsupportedClaimCount: 1,
              }),
            },
          },
        ],
        stats: { successes: 2, failures: 0, errors: 0, durationMs: 20 },
      },
    });

    expect(summary.overallScore).toBe(100);
    expect(summary.metrics['retrieved_expected_page_rate']).toBe(0.5);
    expect(summary.metrics['mentions_expected_fact_rate']).toBe(0.5);
    expect(summary.metrics['avg_citation_count']).toBe(1);
    expect(summary.metrics['unsupported_claim_total']).toBe(1);
  });
});
