import { describe, expect, it } from 'vitest';
import {
  adaptAgencySnapshotV2Compatibility,
  assembleBuyerIntelligenceSnapshot,
  type BuyerIntelligenceAssemblyInput,
} from './buyer-intelligence-assembler';
import { projectBuyerIntelligenceEvidence } from './buyer-intelligence-projector';
import { buildAgencyReportIntegrityRecord } from './agency-report-integrity';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';

function input(): BuyerIntelligenceAssemblyInput {
  const projection = projectBuyerIntelligenceEvidence({
    context: { contextVersion: 'context-v1', status: 'confirmed' },
    generatedAt: '2026-08-11T12:00:00.000Z',
    staleAfterHours: 72,
    audit: {
      runId: 'run-audit-1',
      contextVersion: 'context-v1',
      qualityState: 'valid',
      collectedAt: '2026-08-10T12:00:00.000Z',
      issues: [
        { checkId: 'ai-crawler-access', status: 'WARNING', evidenceId: 'ev-access', evidenceStatus: 'present', contextVersion: 'context-v1' },
        { checkId: 'json-ld', status: 'PASS', evidenceId: 'ev-identity', evidenceStatus: 'present', contextVersion: 'context-v1' },
      ],
    },
    benchmark: null,
  });
  return {
    context: {
      contractVersion: 'organization-context-v1',
      policyVersion: 'organization-context-precedence-v1',
      contextId: 'context-primary',
      contextVersion: 'context-v1',
      contentHash: 'fnv1a32:1234abcd',
      owner: { type: 'startup_workspace', id: OWNER_ID },
      organization: {
        identityId: IDENTITY_ID,
        displayName: 'Northstar Technology Services',
        canonicalDomain: 'northstar.example',
        aliases: [{ host: 'northstar.example', relationship: 'canonical', reviewState: 'verified' }],
        category: 'managed service provider',
        services: ['managed IT services'],
      },
      market: {
        scope: 'regional',
        countryCode: 'CA',
        subdivisionCode: 'CA-QC',
        locality: 'Montreal',
        serviceAreas: ['Montreal'],
        languages: ['en-CA', 'fr-CA'],
        timezone: 'America/Toronto',
        buyer: 'Small and mid-sized businesses',
        approvedCompetitorDomains: [],
      },
      status: 'confirmed',
      evidence: [],
      conflicts: [],
      confirmation: { actorType: 'user', actorId: OWNER_ID, confirmedAt: '2026-08-01T12:00:00.000Z' },
      versionReasonCodes: ['tenant_confirmation'],
      projectedAt: '2026-08-01T12:00:00.000Z',
    },
    projection,
    period: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' },
    measurement: {
      querySetId: 'msp-buyer-questions',
      querySetVersion: 'msp-buyer-questions-v1',
      qualityPolicyVersion: 'quality-policy-v1',
      evaluatorVersion: 'buyer-readiness-eval-v1',
      providerQualityVersion: 'provider-quality-v1',
      providers: [
        { key: 'deep_audit', status: 'measured', runIds: ['run-audit-1'] },
        { key: 'chatgpt', status: 'unavailable', runIds: [] },
      ],
    },
    recommendations: [{
      recommendationId: 'rec-agent-access',
      buyerQuestionKeys: ['agent_access'],
      title: 'Resolve agent access warnings',
      action: 'Confirm crawler policy and public retrieval after the next deployment.',
      ownerClass: 'development',
      priority: 'high',
      effort: 'small',
      state: 'proposed',
      ruleVersion: 'agent-access-verification-v1',
      kind: 'buyer_question',
      expectedCondition: 'The agent access observation is supported on the next comparable run.',
    }],
    previousSnapshot: null,
    generatedAt: '2026-08-11T12:00:00.000Z',
  };
}

describe('assembleBuyerIntelligenceSnapshot', () => {
  it('creates an identical canonical snapshot for identical inputs', () => {
    const first = assembleBuyerIntelligenceSnapshot(input());
    const second = assembleBuyerIntelligenceSnapshot(input());
    expect(second).toEqual(first);
    expect(first.snapshotId).toMatch(/^bis_[0-9a-f]{24}$/);
    expect(first.provenance.inputFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.change).toEqual({ comparable: false, reasons: ['initial_baseline'], changes: [] });
    expect(first.recommendations[0]?.verification.result).toBe('pending');
  });

  it('verifies an improvement against a compatible prior snapshot with evidence lineage', () => {
    const baseline = assembleBuyerIntelligenceSnapshot(input());
    const next = input();
    next.previousSnapshot = baseline;
    next.generatedAt = '2026-08-21T12:00:00.000Z';
    next.period = { start: '2026-08-11T00:00:00.000Z', end: '2026-08-21T00:00:00.000Z' };
    next.projection = {
      ...next.projection,
      observations: next.projection.observations.map((observation) =>
        observation.buyerQuestionKey === 'agent_access'
          ? { ...observation, state: 'supported', answerSummary: 'The tested access signals allow public pages to be retrieved.', confidence: 0.9 }
          : observation),
    };
    const current = assembleBuyerIntelligenceSnapshot(next);
    expect(current.change.comparable).toBe(true);
    expect(current.change.changes).toContainEqual(expect.objectContaining({
      metricKey: 'buyer_question:agent_access',
      direction: 'improved',
    }));
    expect(current.recommendations[0]?.verification).toMatchObject({
      result: 'verified_improved',
      lastEvaluatedSnapshotId: current.snapshotId,
      evidenceIds: ['ev-access'],
      runIds: ['run-audit-1'],
      reason: null,
    });
  });

  it('fails closed on mixed context and incompatible prior measurements', () => {
    const mixed = input();
    mixed.context.contextVersion = 'context-v2';
    expect(() => assembleBuyerIntelligenceSnapshot(mixed)).toThrow('projection_context_mismatch');

    const baseline = assembleBuyerIntelligenceSnapshot(input());
    const changed = input();
    changed.previousSnapshot = baseline;
    changed.measurement.querySetVersion = 'msp-buyer-questions-v2';
    changed.generatedAt = '2026-08-21T12:00:00.000Z';
    changed.period = { start: '2026-08-11T00:00:00.000Z', end: '2026-08-21T00:00:00.000Z' };
    const current = assembleBuyerIntelligenceSnapshot(changed);
    expect(current.change).toEqual({ comparable: false, reasons: ['measurement_protocol_changed'], changes: [] });
    expect(current.recommendations[0]?.verification).toMatchObject({
      result: 'not_verifiable',
      reason: 'measurement_protocol_changed',
    });
  });

  it('changes the fingerprint when a material versioned input changes', () => {
    const first = assembleBuyerIntelligenceSnapshot(input());
    const changed = input();
    changed.measurement.evaluatorVersion = 'buyer-readiness-eval-v2';
    const second = assembleBuyerIntelligenceSnapshot(changed);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.provenance.inputFingerprint).not.toBe(first.provenance.inputFingerprint);
  });

  it('adapts agency snapshot v2 lineage without treating the artifact as organization truth', () => {
    const base = input();
    const integrity = buildAgencyReportIntegrityRecord({
      configId: 'config-northstar',
      organizationIdentityId: IDENTITY_ID,
      contextId: 'context-primary',
      contextVersion: 'context-v1',
      contextHash: 'fnv1a32:1234abcd',
      ownerType: 'startup_workspace',
      ownerId: OWNER_ID,
      clientId: null,
      businessName: 'Northstar Technology Services',
      canonicalDomain: 'northstar.example',
      category: 'managed service provider',
      market: {
        scope: 'regional', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal',
        serviceAreas: ['Montreal'], languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto',
      },
      querySetId: 'msp-buyer-questions',
      querySetVersion: 'msp-buyer-questions-v1',
      competitorCohortVersion: 'msp-cohort-v1',
      competitorDomains: [],
      period: '2026-08',
      availablePromptKeys: ['q1'],
      selectedPromptKeys: ['q1'],
      configuredEngines: ['chatgpt', 'gemini'],
      measuredEngines: ['chatgpt'],
      unavailableEngines: ['gemini'],
      sourceRunGroupIds: { chatgpt: 'run-chatgpt-1' },
      settingsProfileVersion: 'report-profile-v2',
      providerQualityVersion: 'provider-quality-v1',
      denominator: { questions: 1, evaluations: 1, citedEvaluations: 0 },
    });
    const measurement = adaptAgencySnapshotV2Compatibility({
      version: '2',
      integrity,
      context: base.context,
      qualityPolicyVersion: 'quality-policy-v1',
      evaluatorVersion: 'buyer-readiness-eval-v1',
    });
    expect(measurement.providers).toEqual([
      { key: 'chatgpt', status: 'measured', runIds: ['run-chatgpt-1'] },
      { key: 'gemini', status: 'unavailable', runIds: [] },
    ]);
    expect(() => adaptAgencySnapshotV2Compatibility({
      version: '2', integrity, context: { ...base.context, contextVersion: 'context-v2' },
      qualityPolicyVersion: 'quality-policy-v1', evaluatorVersion: 'buyer-readiness-eval-v1',
    })).toThrow('agency_snapshot_context_mismatch');
  });
});
