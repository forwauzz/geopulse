import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_CONTEXT_CONTRACT_VERSION,
  materialContextChanges,
  organizationContextJsonSchema,
  organizationContextSchema,
  organizationOwnerTypeSchema,
  organizationSourceTierSchema,
  resolveOrganizationFact,
  type OrganizationContext,
  type OrganizationSourceTier,
} from './organization-context';

const ids = {
  domain: '10000000-0000-4000-8000-000000000001',
  agency: '10000000-0000-4000-8000-000000000002',
};

function context(overrides: Partial<OrganizationContext> = {}): OrganizationContext {
  return organizationContextSchema.parse({
    contractVersion: ORGANIZATION_CONTEXT_CONTRACT_VERSION,
    policyVersion: 'organization-context-precedence-v1',
    contextId: 'oc:test',
    contextVersion: 'ocv1-12345678',
    contentHash: 'fnv1a32:12345678',
    owner: { type: 'agency_client', id: ids.agency },
    organization: {
      identityId: ids.domain,
      displayName: 'SanoMed Solutions',
      canonicalDomain: 'sanomedsolutions.com',
      aliases: [{ host: 'sanomed.ca', relationship: 'redirect', reviewState: 'verified' }],
      category: 'private medical clinic',
      services: ['preventive medicine', 'travel medicine'],
    },
    market: {
      scope: 'local', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire',
      serviceAreas: ["Montreal's West Island"], languages: ['en-CA', 'fr-CA'],
      timezone: 'America/Toronto', buyer: 'patients seeking private medical care',
      approvedCompetitorDomains: ['clinique360.com', 'unionmd.ca'],
    },
    status: 'confirmed',
    evidence: [],
    conflicts: [],
    confirmation: { actorType: 'user', actorId: ids.agency, confirmedAt: '2026-08-02T00:00:00.000Z' },
    versionReasonCodes: ['initial_projection', 'tenant_confirmation'],
    projectedAt: '2026-08-02T01:00:00.000Z',
    ...overrides,
  });
}

describe('Organization Context contract', () => {
  it('publishes aligned versioned Zod and portable JSON Schema contracts', () => {
    expect(organizationContextJsonSchema.$id).toContain(ORGANIZATION_CONTEXT_CONTRACT_VERSION);
    expect(organizationContextJsonSchema.properties.owner.properties.type.enum)
      .toEqual(organizationOwnerTypeSchema.options);
    expect(organizationContextJsonSchema.required).toContain('contextVersion');
    expect(organizationContextJsonSchema.properties.market.required)
      .toEqual(expect.arrayContaining(['scope', 'countryCode', 'subdivisionCode', 'languages', 'timezone']));
    expect(organizationContextJsonSchema.properties.organization.properties.aliases.items)
      .toMatchObject({ additionalProperties: false, required: ['host', 'relationship', 'reviewState'] });
    expect(organizationContextJsonSchema.properties.evidence.items)
      .toMatchObject({ additionalProperties: false, required: expect.arrayContaining(['evidenceId', 'sourceTier']) });
    expect(organizationContextJsonSchema.properties.conflicts.items)
      .toMatchObject({ additionalProperties: false, required: expect.arrayContaining(['code', 'field', 'material']) });
    expect(organizationContextJsonSchema.allOf).toHaveLength(2);
    expect(organizationContextSchema.safeParse(context()).success).toBe(true);
  });

  it.each([
    ['agency_account', ids.agency],
    ['agency_client', ids.agency],
    ['startup_workspace', ids.agency],
    ['user', ids.agency],
    ['internal_benchmark', null],
  ] as const)('represents the supported %s owner scope', (type, id) => {
    expect(organizationContextSchema.safeParse({ ...context(), owner: { type, id } }).success).toBe(true);
  });

  it('rejects invented tenant ownership and owner IDs on internal benchmarks', () => {
    expect(organizationContextSchema.safeParse({
      ...context(), owner: { type: 'agency_client', id: null },
    }).success).toBe(false);
    expect(organizationContextSchema.safeParse({
      ...context(), owner: { type: 'internal_benchmark', id: ids.agency },
    }).success).toBe(false);
  });

  it('keeps a confirmed Canadian fact while surfacing conflicting UK evidence', () => {
    const resolution = resolveOrganizationFact('country_code', [
      { field: 'country_code', value: 'GB', sourceTier: 'exact_official_website', confidence: 0.95, evidenceId: 'uk-site' },
      { field: 'country_code', value: 'CA', sourceTier: 'confirmed_tenant', confidence: 1, evidenceId: 'tenant-confirmation' },
      { field: 'country_code', value: 'US', sourceTier: 'grounded_suggestion', confidence: 0.6, evidenceId: 'model-result' },
    ]);

    expect(resolution.selected?.value).toBe('CA');
    expect(resolution.conflicts.map((conflict) => conflict.code)).toEqual(['country_conflict', 'country_conflict']);
    expect(resolution.proposals.map((proposal) => proposal.sourceTier)).toEqual([
      'exact_official_website', 'grounded_suggestion',
    ]);
  });

  it('uses the documented source precedence in descending trust order', () => {
    const expected: OrganizationSourceTier[] = [
      'confirmed_tenant', 'exact_official_website', 'structured_website',
      'trusted_public', 'grounded_suggestion', 'heuristic_default',
    ];
    expect(organizationSourceTierSchema.options).toEqual(expected);
    const candidates = expected.map((sourceTier, index) => ({
      field: 'display_name' as const,
      value: `candidate-${index}`,
      sourceTier,
      confidence: 1,
      evidenceId: sourceTier,
    }));
    expect(resolveOrganizationFact('display_name', candidates).selected?.sourceTier).toBe('confirmed_tenant');
  });

  it('creates stable material-change reasons without treating projection time as context', () => {
    const previous = context();
    const unchanged = context({ projectedAt: '2026-08-03T01:00:00.000Z' });
    const changed = context({
      market: { ...previous.market, locality: 'Montreal', languages: ['en-CA'] },
      organization: { ...previous.organization, services: [...previous.organization.services, 'same-day care'] },
    });
    expect(materialContextChanges(previous, unchanged)).toEqual([]);
    expect(materialContextChanges(previous, changed)).toEqual([
      'language_changed', 'market_changed', 'services_changed',
    ]);
  });

  it('fails closed when conflicts and status disagree', () => {
    expect(organizationContextSchema.safeParse({
      ...context(),
      conflicts: [{
        code: 'country_conflict', field: 'country_code', retainedValue: 'CA', proposedValue: 'GB',
        retainedSourceTier: 'confirmed_tenant', proposedSourceTier: 'grounded_suggestion',
        evidenceIds: ['tenant', 'search'], material: true,
      }],
      status: 'confirmed',
    }).success).toBe(false);
  });
});
