import {
  REASONING_CONTRACT_VERSION,
  REASONING_POLICY_VERSION,
  reasoningFactSchema,
  reasoningInsightSchema,
  reasoningRequestSchema,
  type ReasoningAccess,
  type ReasoningFact,
  type ReasoningInsight,
  type ReasoningRequest,
} from './reasoning-contracts';

const CAUSAL_LANGUAGE = /\b(caused?|guarantees?|proves?|resulted in|because of)\b/i;

export type ReasoningModelDraft = {
  readonly finding: string;
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly compatibleRunIds: readonly string[];
  readonly limitations: readonly string[];
  readonly recommendedAction: ReasoningInsight['recommendedAction'];
};

export interface ReasoningModelAdapter {
  readonly provider: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  synthesize(input: {
    readonly request: ReasoningRequest;
    readonly facts: readonly ReasoningFact[];
  }): Promise<ReasoningModelDraft>;
}

export interface ReasoningFactReader {
  read(request: ReasoningRequest, access: ReasoningAccess): Promise<readonly ReasoningFact[]>;
}

export class ReasoningGateError extends Error {
  constructor(
    readonly code: 'insufficient_evidence' | 'unsupported_claim' | 'tenant_scope_violation',
    message: string
  ) {
    super(message);
  }
}

function canAccessFact(fact: ReasoningFact, access: ReasoningAccess): boolean {
  if (access.isPlatformAdmin) return true;
  if (!fact.tenantId) return true;
  return Boolean(
    access.tenantId &&
    access.tenantType &&
    fact.tenantId === access.tenantId &&
    fact.tenantType === access.tenantType
  );
}

function minimumFacts(request: ReasoningRequest): number {
  return request.capability === 'compare_windows' || request.capability === 'intervention_outcomes'
    ? 2
    : 1;
}

function validateFacts(
  request: ReasoningRequest,
  access: ReasoningAccess,
  facts: readonly ReasoningFact[]
): ReasoningFact[] {
  const parsed = facts.map((fact) => reasoningFactSchema.parse(fact));
  if (parsed.some((fact) => !canAccessFact(fact, access))) {
    throw new ReasoningGateError('tenant_scope_violation', 'A fact falls outside the authenticated tenant scope.');
  }
  if (parsed.length < minimumFacts(request)) {
    throw new ReasoningGateError('insufficient_evidence', 'The compatible sample is too small.');
  }
  if (parsed.some((fact) => fact.evidenceIds.length === 0 || fact.compatibleRunIds.length === 0)) {
    throw new ReasoningGateError('insufficient_evidence', 'Every insight requires evidence and run lineage.');
  }
  if (
    (request.capability === 'compare_windows' || request.capability === 'intervention_outcomes') &&
    parsed.some((fact) => !['exact', 'exact_lane_version'].includes(fact.comparisonLabel))
  ) {
    throw new ReasoningGateError('insufficient_evidence', 'The requested measurements are not compatible.');
  }
  return parsed;
}

function assertDraftLineage(
  draft: ReasoningModelDraft,
  facts: readonly ReasoningFact[]
): void {
  const evidence = new Set(facts.flatMap((fact) => fact.evidenceIds));
  const runs = new Set(facts.flatMap((fact) => fact.compatibleRunIds));
  if (
    draft.evidenceIds.length === 0 ||
    draft.compatibleRunIds.length === 0 ||
    draft.evidenceIds.some((id) => !evidence.has(id)) ||
    draft.compatibleRunIds.some((id) => !runs.has(id))
  ) {
    throw new ReasoningGateError('unsupported_claim', 'Model output cited lineage not present in selected facts.');
  }
  const observational = facts.some(
    (fact) => fact.causalityLabel === 'observational_association_not_causation'
  );
  if (observational && CAUSAL_LANGUAGE.test(draft.finding)) {
    throw new ReasoningGateError('unsupported_claim', 'Causal language is not supported by observational evidence.');
  }
}

function deterministicDraft(facts: readonly ReasoningFact[]): ReasoningModelDraft {
  return {
    finding: facts.map((fact) => fact.summary).join(' '),
    confidence: facts.every((fact) => fact.qualityState === 'valid') ? 0.8 : 0.6,
    evidenceIds: [...new Set(facts.flatMap((fact) => fact.evidenceIds))],
    compatibleRunIds: [...new Set(facts.flatMap((fact) => fact.compatibleRunIds))],
    limitations: [
      facts.some((fact) => fact.causalityLabel === 'observational_association_not_causation')
        ? 'Observed associations do not establish causation.'
        : 'The finding is limited to the selected compatible measurements.',
    ],
    recommendedAction: 'inspect_source_evidence',
  };
}

export function createReasoningService(
  reader: ReasoningFactReader,
  model?: ReasoningModelAdapter
) {
  return {
    async execute(rawRequest: unknown, access: ReasoningAccess): Promise<ReasoningInsight> {
      const request = reasoningRequestSchema.parse(rawRequest);
      const facts = validateFacts(request, access, await reader.read(request, access));
      const draft = model
        ? await model.synthesize({ request, facts })
        : deterministicDraft(facts);
      assertDraftLineage(draft, facts);
      const versions = {
        policy: [...new Set(facts.map((fact) => fact.policyVersion))].join(','),
        prompt: model?.promptVersion ?? facts.find((fact) => fact.promptVersion)?.promptVersion ?? null,
        model: model?.modelVersion ?? facts.find((fact) => fact.modelVersion)?.modelVersion ?? null,
      };
      return reasoningInsightSchema.parse({
        contractVersion: REASONING_CONTRACT_VERSION,
        capability: request.capability,
        status: 'ready',
        finding: draft.finding,
        confidence: draft.confidence,
        evidenceIds: draft.evidenceIds,
        compatibleRunIds: draft.compatibleRunIds,
        policyVersion: versions.policy || REASONING_POLICY_VERSION,
        promptVersion: versions.prompt,
        provider: model?.provider ?? 'deterministic',
        modelVersion: versions.model,
        limitations: draft.limitations.length > 0
          ? draft.limitations
          : ['The finding is limited to the selected compatible measurements.'],
        recommendedAction: draft.recommendedAction,
      });
    },
  };
}
