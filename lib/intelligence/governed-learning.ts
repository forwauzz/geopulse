import { z } from 'zod';

export const GOVERNED_LEARNING_CONTRACT_VERSION = 'governed-learning-v1';

export const learningEvidenceSchema = z.object({
  evidenceIds: z.array(z.string().min(1)).min(1),
  compatibleRunIds: z.array(z.string().min(1)).min(2),
  qualityStates: z.array(z.enum(['valid', 'valid_partial'])).min(1),
  compatibilityLabel: z.enum(['exact', 'exact_lane_version']),
  effectSize: z.number().finite(),
  sampleSize: z.number().int().positive(),
  cohortDefinition: z.record(z.string(), z.unknown()).refine(
    (value) => Object.keys(value).length > 0,
    'cohortDefinition cannot be empty'
  ),
  laneIds: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();
export type LearningEvidence = z.infer<typeof learningEvidenceSchema>;

export const evaluationLineageSchema = z.object({
  evalType: z.enum(['report', 'retrieval', 'custom_holdout']),
  evalRunId: z.string().min(1),
  rubricVersion: z.string().min(1),
  generatorVersion: z.string().min(1),
  sourceSnapshot: z.string().min(1),
}).strict();
export type EvaluationLineage = z.infer<typeof evaluationLineageSchema>;

export const methodologyProposalSchema = z.object({
  proposalId: z.string().min(1),
  patternId: z.string().min(1),
  hypothesis: z.string().min(1),
  causalityLabel: z.enum([
    'observational_association_not_causation',
    'randomized_holdout_supports_causal_inference',
  ]),
  policyKind: z.enum(['scoring', 'recommendation', 'prompt', 'parser', 'metric']),
  candidateVersion: z.string().min(1),
  previousVersion: z.string().min(1),
  customerAffecting: z.boolean(),
  evidence: learningEvidenceSchema,
  holdoutDefinition: z.record(z.string(), z.unknown()).refine(
    (value) => Object.keys(value).length > 0,
    'holdoutDefinition cannot be empty'
  ),
  regressionCriteria: z.array(z.string().min(1)).min(1),
  rollbackCriteria: z.array(z.string().min(1)).min(1),
  evaluationLineage: z.array(evaluationLineageSchema).min(1),
  status: z.enum([
    'proposed',
    'holdout_passed',
    'holdout_failed',
    'approved',
    'rejected',
    'shadow',
    'promoted',
    'rolled_back',
  ]),
  approvedBy: z.string().min(1).nullable(),
  holdoutPassed: z.boolean().nullable(),
  shadowPassed: z.boolean().nullable(),
  restoreVersion: z.string().min(1).nullable(),
}).strict();
export type MethodologyProposal = z.infer<typeof methodologyProposalSchema>;

export type LearningAuditEvent = {
  readonly fromStatus: MethodologyProposal['status'] | null;
  readonly toStatus: MethodologyProposal['status'];
  readonly actorType: 'system' | 'human';
  readonly actorId: string;
  readonly reason: string;
  readonly occurredAt: string;
};

export class LearningGovernanceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function proposeMethodology(
  input: Omit<MethodologyProposal, 'status' | 'approvedBy' | 'holdoutPassed' | 'shadowPassed' | 'restoreVersion'>
): MethodologyProposal {
  const evidence = learningEvidenceSchema.safeParse(input.evidence);
  if (!evidence.success) {
    throw new LearningGovernanceError('invalid_evidence', evidence.error.issues[0]?.message ?? 'Invalid evidence.');
  }
  return methodologyProposalSchema.parse({
    ...input,
    evidence: evidence.data,
    status: 'proposed',
    approvedBy: null,
    holdoutPassed: null,
    shadowPassed: null,
    restoreVersion: null,
  });
}

function transition(
  proposal: MethodologyProposal,
  status: MethodologyProposal['status'],
  actorType: LearningAuditEvent['actorType'],
  actorId: string,
  reason: string
): { proposal: MethodologyProposal; event: LearningAuditEvent } {
  return {
    proposal: methodologyProposalSchema.parse({ ...proposal, status }),
    event: {
      fromStatus: proposal.status,
      toStatus: status,
      actorType,
      actorId,
      reason,
      occurredAt: new Date().toISOString(),
    },
  };
}

export function recordHoldout(
  proposal: MethodologyProposal,
  input: {
    readonly passed: boolean;
    readonly actorId: string;
    readonly evaluationLineage: readonly EvaluationLineage[];
    readonly reason: string;
  }
) {
  if (proposal.status !== 'proposed') {
    throw new LearningGovernanceError('invalid_transition', 'Only proposed methodology can enter holdout evaluation.');
  }
  if (input.evaluationLineage.length === 0) {
    throw new LearningGovernanceError('holdout_lineage_required', 'Holdout evaluation lineage is required.');
  }
  return transition({
    ...proposal,
    holdoutPassed: input.passed,
    evaluationLineage: [
      ...proposal.evaluationLineage,
      ...input.evaluationLineage.map((item) => evaluationLineageSchema.parse(item)),
    ],
  }, input.passed ? 'holdout_passed' : 'holdout_failed', 'system', input.actorId, input.reason);
}

export function reviewMethodology(
  proposal: MethodologyProposal,
  input: { readonly approved: boolean; readonly humanId: string; readonly reason: string }
) {
  if (!['holdout_passed', 'holdout_failed'].includes(proposal.status)) {
    throw new LearningGovernanceError('invalid_transition', 'Methodology review follows holdout evaluation.');
  }
  if (!input.humanId.trim()) {
    throw new LearningGovernanceError('human_approval_required', 'A human reviewer identity is required.');
  }
  if (input.approved && proposal.holdoutPassed !== true) {
    throw new LearningGovernanceError('holdout_required', 'A failed holdout cannot be approved.');
  }
  const next = { ...proposal, approvedBy: input.humanId };
  return transition(next, input.approved ? 'approved' : 'rejected', 'human', input.humanId, input.reason);
}

export function startShadow(
  proposal: MethodologyProposal,
  input: { readonly actorId: string; readonly reason: string }
) {
  if (proposal.status !== 'approved' || proposal.holdoutPassed !== true) {
    throw new LearningGovernanceError('holdout_and_approval_required', 'Approval and a passing holdout are required.');
  }
  return transition(proposal, 'shadow', 'system', input.actorId, input.reason);
}

export function recordShadowEvaluation(
  proposal: MethodologyProposal,
  input: { readonly passed: boolean; readonly actorId: string; readonly reason: string }
) {
  if (proposal.status !== 'shadow') {
    throw new LearningGovernanceError('shadow_required', 'The candidate must be running in shadow mode.');
  }
  return {
    ...transition({ ...proposal, shadowPassed: input.passed }, 'shadow', 'system', input.actorId, input.reason),
    passed: input.passed,
  };
}

export function promoteMethodology(
  proposal: MethodologyProposal,
  input: { readonly humanId: string; readonly reason: string }
) {
  if (proposal.status !== 'shadow' || proposal.holdoutPassed !== true || proposal.shadowPassed !== true) {
    throw new LearningGovernanceError('promotion_gates_failed', 'Passing holdout and shadow evaluations are required.');
  }
  if (!input.humanId.trim() || (proposal.customerAffecting && !proposal.approvedBy)) {
    throw new LearningGovernanceError('human_approval_required', 'Customer-affecting promotion requires human approval.');
  }
  if (
    proposal.causalityLabel === 'randomized_holdout_supports_causal_inference' &&
    !proposal.evaluationLineage.some((item) => item.evalType === 'custom_holdout')
  ) {
    throw new LearningGovernanceError(
      'causal_holdout_required',
      'Causal language requires explicit randomized holdout lineage.'
    );
  }
  return transition(proposal, 'promoted', 'human', input.humanId, input.reason);
}

export function rollbackMethodology(
  proposal: MethodologyProposal,
  input: { readonly humanId: string; readonly reason: string }
) {
  if (proposal.status !== 'promoted') {
    throw new LearningGovernanceError('invalid_transition', 'Only a promoted policy can be rolled back.');
  }
  return transition(
    { ...proposal, restoreVersion: proposal.previousVersion },
    'rolled_back',
    'human',
    input.humanId,
    input.reason
  );
}
