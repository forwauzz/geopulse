import { describe, expect, it } from 'vitest';
import {
  buyerIntelligenceProjectionInputSchema,
  projectBuyerIntelligenceEvidence,
  type BuyerIntelligenceProjectionInput,
} from './buyer-intelligence-projector';

function fixture(): BuyerIntelligenceProjectionInput {
  return {
    context: { contextVersion: 'context-v3', status: 'confirmed' },
    generatedAt: '2026-08-11T12:00:00.000Z',
    staleAfterHours: 720,
    audit: {
      runId: 'run_teche_scan',
      contextVersion: 'context-v3',
      qualityState: 'valid',
      collectedAt: '2026-08-10T12:00:00.000Z',
      issues: [
        { checkId: 'json-ld', status: 'FAIL', evidenceId: 'ev_schema', evidenceStatus: 'present', contextVersion: 'context-v3' },
        { checkId: 'llm-qa-pattern', status: 'WARNING', evidenceId: 'ev_answers', evidenceStatus: 'present', contextVersion: 'context-v3' },
        { checkId: 'ai-crawler-access', status: 'PASS', evidenceId: 'ev_access', evidenceStatus: 'present', contextVersion: 'context-v3' },
        { checkId: 'freshness', status: 'LOW_CONFIDENCE', evidenceId: 'ev_freshness', evidenceStatus: 'present', contextVersion: 'context-v3' },
      ],
    },
    benchmark: {
      contextVersion: 'context-v3',
      qualityEligible: true,
      protocolCompatible: true,
      collectedAt: '2026-08-10T12:00:00.000Z',
      cohortId: 'cohort_ca_qc_msp',
      cohortVersion: 'cohort-ca-qc-msp-v1',
      label: 'Quebec managed service providers',
      methodologyVersion: 'msp-benchmark-v1',
      sampleSize: 24,
      evidenceIds: ['ev_benchmark_window'],
      runIds: ['run_teche_benchmark'],
      comparisons: [
        {
          metricKey: 'buyer_question_coverage',
          businessValue: 14,
          cohortMedian: 17,
          denominator: 24,
          percentile: 38,
        },
      ],
    },
  };
}

describe('projectBuyerIntelligenceEvidence', () => {
  it('projects stable business questions, an eligible cohort, and complete provenance', () => {
    const input = fixture();
    const first = projectBuyerIntelligenceEvidence(input);
    const second = projectBuyerIntelligenceEvidence(input);

    expect(first).toEqual(second);
    expect(first.reportEligibility).toEqual({ state: 'eligible', reasons: [] });
    expect(first.observations.map((item) => item.buyerQuestionKey)).toEqual([
      'agent_access',
      'business_identity_and_proof',
      'buyer_answer_clarity',
      'priority_page_discovery',
      'information_freshness',
    ]);
    expect(first.observations.map((item) => item.state)).toEqual([
      'supported',
      'missing',
      'partial',
      'not_available',
      'not_available',
    ]);
    expect(first.benchmark).toMatchObject({
      state: 'eligible',
      sampleSize: 24,
      comparisons: [{ denominator: 24 }],
    });
    expect(first.provenance).toEqual({
      evidenceIds: ['ev_access', 'ev_answers', 'ev_benchmark_window', 'ev_schema'],
      runIds: ['run_teche_benchmark', 'run_teche_scan'],
    });
    expect(first.limitations).toContain('Freshness and upkeep could not be verified in this audit pass.');
  });

  it.each([
    ['mixed context', (value: BuyerIntelligenceProjectionInput) => {
      value.audit!.contextVersion = 'context-v2';
    }, 'audit_context_mismatch'],
    ['quarantined run', (value: BuyerIntelligenceProjectionInput) => {
      value.audit!.qualityState = 'quarantined';
    }, 'audit_quality_quarantined'],
    ['mixed evidence context', (value: BuyerIntelligenceProjectionInput) => {
      value.audit!.issues[0]!.contextVersion = 'context-v2';
    }, 'audit_evidence_context_mismatch'],
    ['stale run', (value: BuyerIntelligenceProjectionInput) => {
      value.audit!.collectedAt = '2026-06-01T00:00:00.000Z';
    }, 'audit_stale'],
  ])('fails closed for a %s', (_label, mutate, reason) => {
    const input = fixture();
    mutate(input);
    const result = projectBuyerIntelligenceEvidence(input);

    expect(result.reportEligibility).toEqual({ state: 'quarantined', reasons: [reason] });
    expect(result.observations.every((item) => item.state === 'not_available')).toBe(true);
    expect(result.provenance.runIds).not.toContain('run_teche_scan');
  });

  it('represents insufficient benchmark data as unavailable, never as a zero denominator', () => {
    const input = fixture();
    input.benchmark!.sampleSize = 0;
    input.benchmark!.comparisons[0]!.denominator = 0;

    const result = projectBuyerIntelligenceEvidence(input);
    expect(result.benchmark).toEqual({
      state: 'not_available',
      cohortId: null,
      cohortVersion: null,
      label: null,
      sampleSize: null,
      methodologyVersion: null,
      comparisons: [],
      evidenceIds: [],
    });
    expect(result.limitations).toContain('Benchmark comparison is unavailable because the eligible cohort is insufficient.');
  });

  it('quarantines an audit with no eligible mapped evidence', () => {
    const input = fixture();
    input.audit!.issues = [{
      checkId: 'future-check',
      status: 'PASS',
      evidenceId: 'ev_future',
      evidenceStatus: 'present',
      contextVersion: 'context-v3',
    }];

    const result = projectBuyerIntelligenceEvidence(input);
    expect(result.reportEligibility).toEqual({
      state: 'quarantined',
      reasons: ['audit_no_eligible_observations'],
    });
    expect(result.provenance.evidenceIds).not.toContain('ev_future');
  });

  it('rejects raw payload fields at the input boundary', () => {
    const input = fixture();
    expect(buyerIntelligenceProjectionInputSchema.safeParse({
      ...input,
      audit: { ...input.audit, rawPayload: { private: true } },
    }).success).toBe(false);
  });
});
