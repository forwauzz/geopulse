import { describe, expect, it } from 'vitest';
import fixture from '@/eval/fixtures/intelligence-reasoning-golden-v1.json';
import {
  REASONING_CONTRACT_VERSION,
  REASONING_TOOLS,
  reasoningContractJsonSchema,
  reasoningErrorSchema,
  reasoningInsightSchema,
  reasoningRequestSchema,
  reasoningToolSchema,
} from './reasoning-contracts';

describe('intelligence reasoning contracts', () => {
  it('publishes stable Zod, JSON Schema, tool and error contracts', () => {
    expect(reasoningContractJsonSchema.$id).toContain(REASONING_CONTRACT_VERSION);
    expect(REASONING_TOOLS).toHaveLength(8);
    expect(REASONING_TOOLS.every((tool) => reasoningToolSchema.safeParse(tool).success)).toBe(true);
    expect(reasoningErrorSchema.parse({
      contractVersion: REASONING_CONTRACT_VERSION,
      error: 'rate_limited',
      message: 'Wait.',
      retryable: true,
    }).error).toBe('rate_limited');
    expect(fixture.cases.map((entry) => entry.id)).toEqual([
      'golden_supported_timeline',
      'adversarial_hallucinated_evidence',
      'adversarial_incompatible_comparison',
      'adversarial_tenant_leakage',
      'adversarial_causal_language',
    ]);
  });

  it('validates capability-specific inputs and rejects extra fields', () => {
    expect(reasoningRequestSchema.safeParse({
      capability: 'compare_windows',
      windowIds: ['before', 'after'],
    }).success).toBe(true);
    expect(reasoningRequestSchema.safeParse({
      capability: 'compare_windows',
      windowIds: ['only-one'],
    }).success).toBe(false);
    expect(reasoningRequestSchema.safeParse({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
      databaseShape: true,
    }).success).toBe(false);
  });

  it('requires complete output lineage and version metadata', () => {
    expect(reasoningInsightSchema.safeParse({
      contractVersion: REASONING_CONTRACT_VERSION,
      capability: 'domain_timeline',
      status: 'ready',
      finding: 'Citation rate was 0.5.',
      confidence: 0.8,
      evidenceIds: ['ev-1'],
      compatibleRunIds: ['run-1'],
      policyVersion: 'policy-v1',
      promptVersion: null,
      provider: 'deterministic',
      modelVersion: null,
      limitations: ['One compatible measurement.'],
      recommendedAction: 'inspect_source_evidence',
    }).success).toBe(true);
  });
});
