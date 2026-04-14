import { describe, expect, it } from 'vitest';
import { runRetrievalFixture, type RetrievalEvalFixture } from './retrieval-eval-writer';

const fixture: RetrievalEvalFixture = {
  siteUrl: 'https://example.com/',
  pages: [
    {
      url: 'https://example.com/security',
      section: 'security',
      content:
        'Security headers are missing on key pages. Content-Security-Policy and X-Frame-Options are absent from the response headers.',
    },
    {
      url: 'https://example.com/docs',
      section: 'docs',
      content:
        'Add FAQPage schema and concise answers to improve extractability. Use direct answer blocks and clear heading structure.',
    },
  ],
  prompts: [
    {
      promptKey: 'security',
      promptText: 'What security headers are missing?',
      expectedSources: ['https://example.com/security'],
      expectedFacts: ['Content-Security-Policy'],
    },
    {
      promptKey: 'refunds',
      promptText: 'What is the refund policy?',
      expectedSources: ['https://example.com/refunds'],
      expectedFacts: ['30-day refund policy'],
    },
  ],
};

describe('runRetrievalFixture', () => {
  it('aggregates deterministic retrieval results for storage', () => {
    const aggregate = runRetrievalFixture(fixture);

    expect(aggregate.domain).toBe('example.com');
    expect(aggregate.results).toHaveLength(2);
    expect(aggregate.metrics['total_prompts']).toBe(2);
    expect(aggregate.metrics['retrieved_expected_page_rate']).toBe(0.5);
    expect(aggregate.metrics['unsupported_claim_total']).toBeGreaterThanOrEqual(0);
  });
});
