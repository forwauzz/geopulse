import { describe, expect, it } from 'vitest';
import {
  BUYER_INTELLIGENCE_SNAPSHOT_VERSION,
  buyerIntelligenceSnapshotSchema,
  type BuyerIntelligenceSnapshot,
} from './buyer-intelligence-contract';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(): BuyerIntelligenceSnapshot {
  return {
    contractVersion: BUYER_INTELLIGENCE_SNAPSHOT_VERSION,
    snapshotId: 'bis_teche_2026_08',
    owner: { type: 'startup_workspace', id: TENANT_ID },
    organization: {
      identityId: IDENTITY_ID,
      contextId: 'context_teche_primary',
      contextVersion: 'context-v3',
      contextHash: 'fnv1a32:1234abcd',
      status: 'confirmed',
      displayName: 'Teché Health Services',
      canonicalDomain: 'techehealthservices.com',
      category: 'managed service provider',
      market: {
        scope: 'regional',
        countryCode: 'CA',
        subdivisionCode: 'CA-QC',
        locality: 'Montréal',
        languages: ['en-CA', 'fr-CA'],
        buyer: 'Healthcare operations leaders',
      },
    },
    period: {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-11T00:00:00.000Z',
      previousSnapshotId: null,
    },
    measurement: {
      querySetId: 'msp-buyer-questions',
      querySetVersion: 'msp-buyer-questions-v2',
      qualityPolicyVersion: 'quality-policy-v1',
      evaluatorVersion: 'buyer-readiness-eval-v1',
      providerQualityVersion: 'provider-quality-v1',
      runIds: ['run_teche_scan', 'run_teche_benchmark'],
      providers: [
        { key: 'deep_audit', status: 'measured', runIds: ['run_teche_scan'] },
        { key: 'chatgpt', status: 'unavailable', runIds: [] },
      ],
    },
    observations: [
      {
        observationId: 'obs_service_clarity',
        contextVersion: 'context-v3',
        buyerQuestionKey: 'services_for_healthcare',
        buyerQuestion: 'Which managed IT services are available for healthcare organizations?',
        state: 'partial',
        answerSummary: 'Relevant practice-area pages exist, but direct buyer answers are incomplete.',
        evidenceIds: ['ev_service_page'],
        runIds: ['run_teche_scan'],
        confidence: 0.91,
        collectedAt: '2026-08-10T12:00:00.000Z',
      },
      {
        observationId: 'obs_chatgpt_unavailable',
        contextVersion: 'context-v3',
        buyerQuestionKey: 'chatgpt_recommendation',
        buyerQuestion: 'Would ChatGPT recommend this MSP?',
        state: 'not_available',
        answerSummary: null,
        evidenceIds: [],
        runIds: [],
        confidence: null,
        collectedAt: '2026-08-10T12:00:00.000Z',
      },
    ],
    benchmark: {
      state: 'eligible',
      cohortId: 'cohort_ca_qc_msp',
      cohortVersion: 'cohort-ca-qc-msp-v1',
      label: 'Quebec managed service providers',
      sampleSize: 24,
      methodologyVersion: 'msp-benchmark-v1',
      comparisons: [
        {
          metricKey: 'buyer_question_coverage',
          businessValue: 14,
          cohortMedian: 17,
          denominator: 24,
          percentile: 38,
        },
      ],
      evidenceIds: ['ev_benchmark_window'],
    },
    recommendations: [
      {
        recommendationId: 'rec_direct_answers',
        contextVersion: 'context-v3',
        observationIds: ['obs_service_clarity'],
        title: 'Add direct buyer answers to priority service pages',
        action: 'Lead each priority service page with a concise answer covering service, buyer, geography, and proof.',
        ownerClass: 'marketing',
        priority: 'high',
        effort: 'medium',
        state: 'proposed',
        evidenceIds: ['ev_service_page'],
        verification: {
          ruleVersion: 'direct-answer-verification-v1',
          kind: 'audit_check',
          expectedCondition: 'The direct-answer check passes on every selected priority service page.',
          lastEvaluatedSnapshotId: null,
          result: 'not_evaluated',
        },
      },
    ],
    change: {
      comparable: false,
      reasons: ['initial_baseline'],
      changes: [],
    },
    reportEligibility: { state: 'eligible', reasons: [] },
    limitations: ['ChatGPT measurement was unavailable in this window.'],
    provenance: {
      generatedAt: '2026-08-11T12:00:00.000Z',
      generatorVersion: 'buyer-intelligence-projector-v1',
      inputFingerprint: `sha256:${'a'.repeat(64)}`,
      evidenceIds: ['ev_service_page', 'ev_benchmark_window'],
      runIds: ['run_teche_scan', 'run_teche_benchmark'],
    },
  };
}

describe('buyerIntelligenceSnapshotSchema', () => {
  it('accepts one evidence-backed, versioned snapshot projection', () => {
    expect(buyerIntelligenceSnapshotSchema.parse(snapshot())).toEqual(snapshot());
  });

  it('rejects mixed organization context versions', () => {
    const base = snapshot();
    const candidate = {
      ...base,
      observations: base.observations.map((observation, index) =>
        index === 0 ? { ...observation, contextVersion: 'context-v2' } : observation),
    };
    const result = buyerIntelligenceSnapshotSchema.safeParse(candidate);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes('context version'))).toBe(true);
  });

  it('represents an unavailable benchmark with nulls rather than a zero denominator', () => {
    const candidate = snapshot();
    candidate.benchmark = {
      state: 'not_available',
      cohortId: null,
      cohortVersion: null,
      label: null,
      sampleSize: null,
      methodologyVersion: null,
      comparisons: [],
      evidenceIds: [],
    };
    expect(buyerIntelligenceSnapshotSchema.safeParse(candidate).success).toBe(true);

    expect(buyerIntelligenceSnapshotSchema.safeParse({
      ...candidate,
      benchmark: { ...candidate.benchmark, sampleSize: 0 },
    }).success).toBe(false);
  });

  it('rejects unversioned cohorts and evidence outside snapshot provenance', () => {
    const base = snapshot();
    const candidate = { ...base, benchmark: { ...base.benchmark, cohortVersion: '' } };
    expect(buyerIntelligenceSnapshotSchema.safeParse(candidate).success).toBe(false);

    const second = snapshot();
    expect(buyerIntelligenceSnapshotSchema.safeParse({
      ...second,
      recommendations: second.recommendations.map((recommendation, index) =>
        index === 0 ? { ...recommendation, evidenceIds: ['ev_not_in_provenance'] } : recommendation),
    }).success).toBe(false);
  });

  it('rejects raw provider payloads and undeclared fields', () => {
    expect(buyerIntelligenceSnapshotSchema.safeParse({
      ...snapshot(),
      rawProviderPayload: { answer: 'must stay in the evidence catalog' },
    }).success).toBe(false);
  });
});
