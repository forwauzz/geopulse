import { describe, expect, it } from 'vitest';
import {
  buildPassagesFromPages,
  simulateRetrievalForPrompt,
  type RetrievalEvalPage,
} from './retrieval-eval';

const pages: RetrievalEvalPage[] = [
  {
    url: 'https://example.com/',
    section: 'root',
    content:
      'GEO-Pulse audits AI crawler access and structured data. It highlights robots.txt blocking, schema coverage, and snippet restrictions for AI search readiness.',
  },
  {
    url: 'https://example.com/docs',
    section: 'docs',
    content:
      'The docs page explains how to add FAQPage schema and improve extractability with direct answers and concise heading structure.',
  },
];

describe('buildPassagesFromPages', () => {
  it('builds passages from page content', () => {
    const passages = buildPassagesFromPages(pages);
    expect(passages.length).toBeGreaterThanOrEqual(2);
    expect(passages[0]?.pageUrl).toBe('https://example.com/');
  });
});

describe('simulateRetrievalForPrompt', () => {
  it('retrieves the most relevant passage and computes deterministic metrics', () => {
    const result = simulateRetrievalForPrompt(pages, {
      promptKey: 'schema',
      promptText: 'How do I improve schema coverage for FAQ answers?',
      expectedSources: ['https://example.com/docs'],
      expectedFacts: ['FAQPage schema'],
    });

    expect(result.passages[0]?.pageUrl).toBe('https://example.com/docs');
    expect(result.metrics.retrievedExpectedPage).toBe(true);
    expect(result.metrics.answerMentionsExpectedFact).toBe(true);
    expect(result.metrics.citationCount).toBeGreaterThan(0);
  });

  it('flags unsupported answers when expected facts are absent', () => {
    const result = simulateRetrievalForPrompt(pages, {
      promptKey: 'pricing',
      promptText: 'What is the subscription refund policy?',
      expectedSources: ['https://example.com/pricing'],
      expectedFacts: ['refund policy'],
    });

    expect(result.metrics.retrievedExpectedPage).toBe(false);
    expect(result.metrics.answerMentionsExpectedFact).toBe(false);
    expect(result.metrics.unsupportedClaimCount).toBeGreaterThanOrEqual(0);
  });
});
