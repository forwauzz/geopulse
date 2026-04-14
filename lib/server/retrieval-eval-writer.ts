import {
  simulateRetrievalForPrompt,
  type RetrievalEvalPage,
  type RetrievalEvalPrompt,
  type RetrievalEvalResult,
} from './retrieval-eval';
import { normalizeEvalDomain } from './promptfoo-results';

export type RetrievalEvalFixture = {
  readonly siteUrl?: string;
  readonly domain?: string;
  readonly pages: readonly RetrievalEvalPage[];
  readonly prompts: readonly RetrievalEvalPrompt[];
};

export type RetrievalEvalAggregate = {
  readonly overallScore: number;
  readonly metrics: Record<string, unknown>;
  readonly results: readonly RetrievalEvalResult[];
  readonly siteUrl: string | null;
  readonly domain: string | null;
};

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

export function runRetrievalFixture(
  fixture: RetrievalEvalFixture,
  options?: { topK?: number; maxPassageChars?: number }
): RetrievalEvalAggregate {
  const results = fixture.prompts.map((prompt) =>
    simulateRetrievalForPrompt(fixture.pages, prompt, options)
  );
  const totalPrompts = results.length;
  const retrievedExpectedPageCount = results.filter((result) => result.metrics.retrievedExpectedPage).length;
  const answerHasExpectedSourceCount = results.filter((result) => result.metrics.answerHasExpectedSource).length;
  const answerMentionsExpectedFactCount = results.filter((result) => result.metrics.answerMentionsExpectedFact).length;
  const citationTotal = results.reduce((sum, result) => sum + result.metrics.citationCount, 0);
  const unsupportedClaimTotal = results.reduce((sum, result) => sum + result.metrics.unsupportedClaimCount, 0);
  const passedPromptCount = results.filter(
    (result) =>
      result.metrics.retrievedExpectedPage &&
      result.metrics.answerHasExpectedSource &&
      result.metrics.answerMentionsExpectedFact &&
      result.metrics.unsupportedClaimCount === 0
  ).length;

  const overallScore = totalPrompts > 0 ? Math.round((passedPromptCount / totalPrompts) * 100) : 0;

  return {
    overallScore,
    metrics: {
      total_prompts: totalPrompts,
      passed_prompts: passedPromptCount,
      retrieved_expected_page_rate:
        totalPrompts > 0 ? roundMetric(retrievedExpectedPageCount / totalPrompts) : 0,
      answer_has_expected_source_rate:
        totalPrompts > 0 ? roundMetric(answerHasExpectedSourceCount / totalPrompts) : 0,
      answer_mentions_expected_fact_rate:
        totalPrompts > 0 ? roundMetric(answerMentionsExpectedFactCount / totalPrompts) : 0,
      avg_citation_count: totalPrompts > 0 ? roundMetric(citationTotal / totalPrompts) : 0,
      unsupported_claim_total: unsupportedClaimTotal,
    },
    results,
    siteUrl: fixture.siteUrl?.trim() || null,
    domain: normalizeEvalDomain(fixture.siteUrl, fixture.domain),
  };
}
