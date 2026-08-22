import { assembleBuyerIntelligenceSnapshot, type BuyerIntelligenceAssemblyInput } from '../buyer-intelligence-assembler';
import { projectBuyerIntelligenceEvidence } from '../buyer-intelligence-projector';

export const BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
export const BUYER_INTELLIGENCE_FIXTURE_IDENTITY_ID = '44444444-4444-4444-8444-444444444444';

export function buyerIntelligenceFixtureAssembly(
  ownerId = BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID,
): BuyerIntelligenceAssemblyInput {
  const contextVersion = 'context-v1';
  return {
    context: {
      contractVersion: 'organization-context-v1', policyVersion: 'organization-context-precedence-v1',
      contextId: 'context-primary', contextVersion, contentHash: 'fnv1a32:1234abcd',
      owner: { type: 'agency_client', id: ownerId },
      organization: {
        identityId: BUYER_INTELLIGENCE_FIXTURE_IDENTITY_ID, displayName: 'Northstar Technology Services', canonicalDomain: 'northstar.example',
        aliases: [{ host: 'northstar.example', relationship: 'canonical', reviewState: 'verified' }],
        category: 'managed service provider', services: ['managed IT services'],
      },
      market: {
        scope: 'regional', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal',
        serviceAreas: ['Montreal'], languages: ['en-CA'], timezone: 'America/Toronto',
        buyer: 'Small and mid-sized businesses', approvedCompetitorDomains: [],
      },
      status: 'confirmed', evidence: [], conflicts: [],
      confirmation: { actorType: 'user', actorId: ownerId, confirmedAt: '2026-08-01T12:00:00.000Z' },
      versionReasonCodes: ['tenant_confirmation'], projectedAt: '2026-08-01T12:00:00.000Z',
    },
    projection: projectBuyerIntelligenceEvidence({
      context: { contextVersion, status: 'confirmed' }, generatedAt: '2026-08-11T12:00:00.000Z', staleAfterHours: 72,
      audit: {
        runId: 'run-audit-1', contextVersion, qualityState: 'valid', collectedAt: '2026-08-10T12:00:00.000Z',
        issues: [
          { checkId: 'ai-crawler-access', status: 'WARNING', evidenceId: 'ev-access', evidenceStatus: 'present', contextVersion },
          { checkId: 'json-ld', status: 'PASS', evidenceId: 'ev-identity', evidenceStatus: 'present', contextVersion },
        ],
      },
      benchmark: null,
    }),
    period: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' },
    measurement: {
      querySetId: 'msp-buyer-questions', querySetVersion: 'msp-buyer-questions-v1',
      qualityPolicyVersion: 'quality-policy-v1', evaluatorVersion: 'buyer-readiness-eval-v1',
      providerQualityVersion: 'provider-quality-v1', providers: [
        { key: 'deep_audit', status: 'measured', runIds: ['run-audit-1'] },
        { key: 'gemini', status: 'unavailable', runIds: [] },
      ],
    },
    recommendations: [{
      recommendationId: 'rec-access', buyerQuestionKeys: ['agent_access'], title: 'Resolve agent access warnings',
      action: 'Confirm crawler access after deployment.', ownerClass: 'development', priority: 'high', effort: 'small',
      state: 'proposed', ruleVersion: 'access-v1', kind: 'buyer_question',
      expectedCondition: 'Agent access is supported on the next comparable run.',
    }],
    previousSnapshot: null, generatedAt: '2026-08-11T12:00:00.000Z',
  };
}

export function buyerIntelligenceFixtureSnapshot(ownerId?: string) {
  return assembleBuyerIntelligenceSnapshot(buyerIntelligenceFixtureAssembly(ownerId));
}
