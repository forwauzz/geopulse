import { describe, expect, it } from 'vitest';
import {
  LearningGovernanceError,
  learningEvidenceSchema,
  promoteMethodology,
  proposeMethodology,
  recordHoldout,
  recordShadowEvaluation,
  reviewMethodology,
  rollbackMethodology,
  startShadow,
  type LearningEvidence,
  type MethodologyProposal,
} from './governed-learning';

const evidence: LearningEvidence = {
  evidenceIds: ['ev-1'],
  compatibleRunIds: ['run-1', 'run-2'],
  qualityStates: ['valid'],
  compatibilityLabel: 'exact_lane_version',
  effectSize: 0.12,
  sampleSize: 80,
  cohortDefinition: { vertical: 'legal', region: 'CA' },
  laneIds: ['lane-1'],
  confidence: 0.85,
  limitations: ['Observational sample before holdout.'],
};

function proposal(
  overrides: Partial<Parameters<typeof proposeMethodology>[0]> = {}
): MethodologyProposal {
  return proposeMethodology({
    proposalId: 'proposal-1',
    patternId: 'pattern-1',
    hypothesis: 'Adding cited answers may improve measured citation rate.',
    causalityLabel: 'observational_association_not_causation',
    policyKind: 'recommendation',
    candidateVersion: 'recommendation-v2',
    previousVersion: 'recommendation-v1',
    customerAffecting: true,
    evidence,
    holdoutDefinition: { allocation: '50/50', primaryMetric: 'citation_rate' },
    regressionCriteria: ['report eval score must not decline'],
    rollbackCriteria: ['citation rate declines by more than 5%'],
    evaluationLineage: [{
      evalType: 'report',
      evalRunId: 'report-eval-1',
      rubricVersion: 'report-v1',
      generatorVersion: 'generator-v1',
      sourceSnapshot: 'sha256:baseline',
    }],
    ...overrides,
  });
}

function passToShadow(candidate = proposal()): MethodologyProposal {
  const held = recordHoldout(candidate, {
    passed: true,
    actorId: 'holdout-job',
    reason: 'Predeclared threshold passed.',
    evaluationLineage: [{
      evalType: 'custom_holdout',
      evalRunId: 'holdout-1',
      rubricVersion: 'holdout-v1',
      generatorVersion: 'deterministic',
      sourceSnapshot: 'sha256:holdout',
    }],
  }).proposal;
  const reviewed = reviewMethodology(held, {
    approved: true,
    humanId: 'reviewer-1',
    reason: 'Methodology review approved.',
  }).proposal;
  return startShadow(reviewed, {
    actorId: 'policy-runner',
    reason: 'Begin non-customer-visible shadow evaluation.',
  }).proposal;
}

describe('governed learning lifecycle', () => {
  it('requires compatible, non-quarantined evidence and complete statistical context', () => {
    expect(learningEvidenceSchema.safeParse(evidence).success).toBe(true);
    expect(learningEvidenceSchema.safeParse({
      ...evidence,
      qualityStates: ['quarantined'],
    }).success).toBe(false);
    expect(learningEvidenceSchema.safeParse({
      ...evidence,
      compatibilityLabel: 'incompatible',
    }).success).toBe(false);
    expect(learningEvidenceSchema.safeParse({
      ...evidence,
      sampleSize: 0,
      limitations: [],
    }).success).toBe(false);
  });

  it('requires a passing holdout and human review before shadow mode', () => {
    expect(() => startShadow(proposal(), {
      actorId: 'system',
      reason: 'skip gates',
    })).toThrowError(LearningGovernanceError);

    const failed = recordHoldout(proposal(), {
      passed: false,
      actorId: 'holdout-job',
      reason: 'Threshold missed.',
      evaluationLineage: [{
        evalType: 'custom_holdout',
        evalRunId: 'holdout-failed',
        rubricVersion: 'holdout-v1',
        generatorVersion: 'deterministic',
        sourceSnapshot: 'sha256:failed',
      }],
    }).proposal;
    expect(() => reviewMethodology(failed, {
      approved: true,
      humanId: 'reviewer-1',
      reason: 'ignore failure',
    })).toThrowError(/failed holdout/i);
  });

  it('retains original report/retrieval lineage when attaching holdout results', () => {
    const original = proposal();
    const held = recordHoldout(original, {
      passed: true,
      actorId: 'holdout-job',
      reason: 'Threshold passed.',
      evaluationLineage: [{
        evalType: 'retrieval',
        evalRunId: 'retrieval-eval-1',
        rubricVersion: 'retrieval-v1',
        generatorVersion: 'generator-v2',
        sourceSnapshot: 'sha256:retrieval',
      }],
    }).proposal;
    expect(held.evaluationLineage).toHaveLength(2);
    expect(held.evaluationLineage[0]).toEqual(original.evaluationLineage[0]);
  });

  it('requires a passing shadow evaluation before human promotion', () => {
    const shadow = passToShadow();
    expect(() => promoteMethodology(shadow, {
      humanId: 'reviewer-1',
      reason: 'premature',
    })).toThrowError(/shadow/i);
    const evaluated = recordShadowEvaluation(shadow, {
      passed: true,
      actorId: 'shadow-job',
      reason: 'Regression criteria passed.',
    }).proposal;
    const promoted = promoteMethodology(evaluated, {
      humanId: 'reviewer-1',
      reason: 'Promote after shadow review.',
    });
    expect(promoted.proposal.status).toBe('promoted');
    expect(promoted.event.actorType).toBe('human');
  });

  it('distinguishes observational association from causal inference', () => {
    expect(proposal().causalityLabel).toBe('observational_association_not_causation');
    const causalWithoutHoldout = passToShadow(proposal({
      causalityLabel: 'randomized_holdout_supports_causal_inference',
    }));
    const stripped = {
      ...recordShadowEvaluation(causalWithoutHoldout, {
        passed: true,
        actorId: 'shadow-job',
        reason: 'passed',
      }).proposal,
      evaluationLineage: causalWithoutHoldout.evaluationLineage.filter(
        (item) => item.evalType !== 'custom_holdout'
      ),
    };
    expect(() => promoteMethodology(stripped, {
      humanId: 'reviewer-1',
      reason: 'claim causality',
    })).toThrowError(/causal language/i);
  });

  it('rolls back by restoring the prior version without changing proposal history', () => {
    const shadow = passToShadow();
    const promoted = promoteMethodology(recordShadowEvaluation(shadow, {
      passed: true,
      actorId: 'shadow-job',
      reason: 'passed',
    }).proposal, {
      humanId: 'reviewer-1',
      reason: 'promoted',
    }).proposal;
    const rolledBack = rollbackMethodology(promoted, {
      humanId: 'reviewer-2',
      reason: 'Regression threshold breached.',
    });
    expect(rolledBack.proposal).toMatchObject({
      status: 'rolled_back',
      restoreVersion: 'recommendation-v1',
      candidateVersion: 'recommendation-v2',
    });
    expect(rolledBack.event).toMatchObject({
      fromStatus: 'promoted',
      toStatus: 'rolled_back',
      actorType: 'human',
    });
  });
});
