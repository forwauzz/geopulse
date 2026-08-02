import { describe, expect, it } from 'vitest';
import {
  classifyOrganizationContextBackfill,
  planOrganizationContextChange,
  summarizeOrganizationContextBackfill,
  type OrganizationContextBackfillSource,
} from './organization-context-backfill';
import {
  organizationContextContentHash,
  organizationContextSchema,
  organizationContextVersion,
  type OrganizationContext,
} from './organization-context';

function context(overrides: Partial<OrganizationContext> = {}): OrganizationContext {
  const base = {
    contractVersion: 'organization-context-v1',
    policyVersion: 'organization-context-precedence-v1',
    contextId: 'oc:11111111-1111-4111-8111-111111111111:startup_workspace:22222222-2222-4222-8222-222222222222',
    owner: { type: 'startup_workspace' as const, id: '22222222-2222-4222-8222-222222222222' },
    organization: {
      identityId: '11111111-1111-4111-8111-111111111111', displayName: 'Example Clinic',
      canonicalDomain: 'clinic.example', aliases: [], category: 'private medical clinic',
      services: ['preventive medicine'],
    },
    market: {
      scope: 'local' as const, countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire',
      serviceAreas: ['West Island'], languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto',
      buyer: 'local patients', approvedCompetitorDomains: ['competitor.example'],
    },
    status: 'confirmed' as const, evidence: [], conflicts: [],
    confirmation: { actorType: 'user' as const, actorId: '33333333-3333-4333-8333-333333333333', confirmedAt: '2026-08-01T00:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation' as const], projectedAt: '2026-08-01T00:00:00.000Z',
  };
  const merged = { ...base, ...overrides };
  const contentHash = organizationContextContentHash({ ...merged, projectedAt: undefined });
  return organizationContextSchema.parse({ ...merged, contentHash, contextVersion: organizationContextVersion(contentHash) });
}

function source(overrides: Partial<OrganizationContextBackfillSource> = {}): OrganizationContextBackfillSource {
  const ready = context();
  return {
    configId: '44444444-4444-4444-8444-444444444444',
    ownerType: 'startup_workspace', ownerId: ready.owner.id,
    domainId: ready.organization.identityId, mappingStatus: 'mapped',
    lookup: { status: 'ready', context: ready }, previousContext: ready,
    routedUserId: ready.confirmation!.actorId,
    alreadyAppliedVersion: null,
    ...overrides,
  };
}

describe('organization context backfill classification', () => {
  it('classifies every existing shape into one explicit state and reason', () => {
    const ready = classifyOrganizationContextBackfill(source());
    const ambiguousContext = context({ status: 'detected', confirmation: null });
    const ambiguous = classifyOrganizationContextBackfill(source({ lookup: { status: 'ready', context: ambiguousContext } }));
    const conflict = {
      code: 'country_conflict' as const, field: 'country_code' as const,
      retainedValue: 'CA', proposedValue: 'GB', retainedSourceTier: 'confirmed_tenant' as const,
      proposedSourceTier: 'trusted_public' as const, evidenceIds: [], material: true as const,
    };
    const conflictedContext = context({ status: 'conflicted', conflicts: [conflict] });
    const conflicted = classifyOrganizationContextBackfill(source({ lookup: { status: 'ready', context: conflictedContext } }));
    const unmapped = classifyOrganizationContextBackfill(source({ domainId: null, mappingStatus: 'needs_review', lookup: null }));
    expect([ready.classification, ambiguous.classification, conflicted.classification, unmapped.classification])
      .toEqual(['ready', 'ambiguous', 'conflicted', 'unmapped']);
    expect(ambiguous.reasons).toEqual(['tenant_confirmation_required']);
    expect(conflicted.reasons).toEqual(['material_context_conflict']);
    expect(unmapped.reasons).toEqual(['identity_mapping_needs_review']);
    expect(summarizeOrganizationContextBackfill([ready, ambiguous, conflicted, unmapped]))
      .toEqual({ total: 4, ready: 1, ambiguous: 1, conflicted: 1, unmapped: 1 });
  });

  it('does not infer a tenant owner or missing geography', () => {
    expect(classifyOrganizationContextBackfill(source({ ownerType: null, ownerId: null })).reasons)
      .toEqual(['owner_scope_missing']);
    expect(classifyOrganizationContextBackfill(source({
      lookup: { status: 'needs_review', reason: 'country_code_missing' },
    }))).toMatchObject({ classification: 'ambiguous', reasons: ['country_code_missing'] });
    expect(classifyOrganizationContextBackfill(source({
      lookup: { status: 'needs_review', reason: 'country_code_missing' }, routedUserId: null,
    }))).toMatchObject({
      classification: 'unmapped', reasons: ['authorized_user_missing', 'country_code_missing'],
    });
  });
});

describe('organization context material-change policy', () => {
  it('ignores a fresh projection timestamp when facts are unchanged', () => {
    const previous = context();
    const next = context({ projectedAt: '2026-08-02T00:00:00.000Z' });
    expect(planOrganizationContextChange({ previous, next })).toEqual({ status: 'unchanged', reasons: [] });
  });

  it('blocks future delivery after a material market change while preserving the previous context', () => {
    const previous = context();
    const next = context({ market: { ...previous.market, countryCode: 'US', subdivisionCode: 'US-NY', locality: 'Buffalo' } });
    expect(planOrganizationContextChange({ previous, next })).toEqual({
      status: 'material_change', reasons: ['market_changed'], blocksDelivery: true,
    });
    expect(previous.market.countryCode).toBe('CA');
  });
});
