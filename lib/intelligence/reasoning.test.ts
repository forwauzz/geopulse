import { describe, expect, it } from 'vitest';
import {
  createReasoningService,
  type ReasoningFactReader,
  type ReasoningModelAdapter,
} from './reasoning';
import type { ReasoningAccess, ReasoningFact } from './reasoning-contracts';

const access: ReasoningAccess = {
  actorId: 'user-1',
  isPlatformAdmin: false,
  tenantType: 'workspace',
  tenantId: 'tenant-1',
};

function fact(overrides: Partial<ReasoningFact> = {}): ReasoningFact {
  return {
    factId: 'fact-1',
    factType: 'metric',
    summary: 'Citation rate was 0.5.',
    value: 0.5,
    evidenceIds: ['ev-1'],
    compatibleRunIds: ['run-1'],
    qualityState: 'valid',
    comparisonLabel: 'not_applicable',
    causalityLabel: 'not_applicable',
    tenantType: 'workspace',
    tenantId: 'tenant-1',
    policyVersion: 'policy-v1',
    promptVersion: null,
    modelVersion: 'model-fact-v1',
    ...overrides,
  };
}

function reader(facts: readonly ReasoningFact[]): ReasoningFactReader {
  return { read: async () => facts };
}

function adapter(overrides: Partial<Awaited<ReturnType<ReasoningModelAdapter['synthesize']>>> = {}): ReasoningModelAdapter {
  return {
    provider: 'test-provider',
    modelVersion: 'test-model-v2',
    promptVersion: 'test-prompt-v3',
    synthesize: async () => ({
      finding: 'Citation rate was 0.5.',
      confidence: 0.7,
      evidenceIds: ['ev-1'],
      compatibleRunIds: ['run-1'],
      limitations: ['One compatible measurement.'],
      recommendedAction: 'inspect_source_evidence',
      ...overrides,
    }),
  };
}

describe('evidence-backed reasoning service', () => {
  it('returns a golden deterministic insight with complete lineage', async () => {
    const result = await createReasoningService(reader([fact()])).execute({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
    }, access);
    expect(result).toMatchObject({
      status: 'ready',
      provider: 'deterministic',
      evidenceIds: ['ev-1'],
      compatibleRunIds: ['run-1'],
      policyVersion: 'policy-v1',
      limitations: ['The finding is limited to the selected compatible measurements.'],
    });
  });

  it('captures provider, model, prompt and policy versions', async () => {
    const result = await createReasoningService(reader([fact()]), adapter()).execute({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
    }, access);
    expect(result).toMatchObject({
      provider: 'test-provider',
      modelVersion: 'test-model-v2',
      promptVersion: 'test-prompt-v3',
      policyVersion: 'policy-v1',
    });
  });

  it('rejects hallucinated evidence and run lineage', async () => {
    const service = createReasoningService(reader([fact()]), adapter({
      evidenceIds: ['invented-evidence'],
    }));
    await expect(service.execute({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
    }, access)).rejects.toMatchObject({ code: 'unsupported_claim' });
  });

  it('fails closed for incompatible comparisons and small samples', async () => {
    const incompatible = fact({ comparisonLabel: 'not_applicable' });
    await expect(createReasoningService(reader([incompatible, {
      ...incompatible,
      factId: 'fact-2',
      evidenceIds: ['ev-2'],
      compatibleRunIds: ['run-2'],
    }])).execute({
      capability: 'compare_windows',
      windowIds: ['before', 'after'],
    }, access)).rejects.toMatchObject({ code: 'insufficient_evidence' });

    await expect(createReasoningService(reader([])).execute({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
    }, access)).rejects.toMatchObject({ code: 'insufficient_evidence' });
  });

  it('blocks tenant leakage before synthesis', async () => {
    const service = createReasoningService(reader([fact({ tenantId: 'tenant-2' })]), adapter());
    await expect(service.execute({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
    }, access)).rejects.toMatchObject({ code: 'tenant_scope_violation' });
  });

  it('rejects causal language for observational outcomes', async () => {
    const observational = fact({
      comparisonLabel: 'exact',
      causalityLabel: 'observational_association_not_causation',
    });
    const service = createReasoningService(reader([
      observational,
      { ...observational, factId: 'fact-2', evidenceIds: ['ev-2'], compatibleRunIds: ['run-2'] },
    ]), adapter({
      finding: 'The intervention caused the increase.',
      evidenceIds: ['ev-1', 'ev-2'],
      compatibleRunIds: ['run-1', 'run-2'],
    }));
    await expect(service.execute({
      capability: 'intervention_outcomes',
      recommendationId: 'ca0545fa-9bc8-4dfc-b087-3fbd4cb86e4c',
    }, access)).rejects.toMatchObject({ code: 'unsupported_claim' });
  });
});
