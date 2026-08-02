import { describe, expect, it } from 'vitest';
import {
  classifyOrganizationReference,
  deriveOrganizationMeasurementBinding,
  evaluateOrganizationMeasurementCompatibility,
  organizationMeasurementMetadata,
  readOrganizationMeasurementBinding,
} from './organization-measurement-context';
import {
  organizationContextContentHash,
  organizationContextSchema,
  organizationContextVersion,
  type OrganizationContext,
} from './organization-context';

function confirmedContext(overrides: Partial<OrganizationContext> = {}): OrganizationContext {
  const base = {
    contractVersion: 'organization-context-v1',
    policyVersion: 'organization-context-precedence-v1',
    contextId: 'oc:11111111-1111-4111-8111-111111111111:startup_workspace:22222222-2222-4222-8222-222222222222',
    owner: { type: 'startup_workspace' as const, id: '22222222-2222-4222-8222-222222222222' },
    organization: {
      identityId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Example Clinic', canonicalDomain: 'clinic.example', aliases: [],
      category: 'private medical clinic', services: ['preventive medicine', 'travel health'],
    },
    market: {
      scope: 'local' as const, countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire',
      serviceAreas: ['West Island'], languages: ['fr-CA', 'en-CA'], timezone: 'America/Toronto',
      buyer: 'local patients', approvedCompetitorDomains: ['competitor.example'],
    },
    status: 'confirmed' as const, evidence: [], conflicts: [],
    confirmation: { actorType: 'user' as const, actorId: '33333333-3333-4333-8333-333333333333', confirmedAt: '2026-08-01T00:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation' as const], projectedAt: '2026-08-01T00:00:00.000Z',
  };
  const merged = { ...base, ...overrides };
  const contentHash = organizationContextContentHash({ ...merged, projectedAt: undefined });
  return organizationContextSchema.parse({
    ...merged,
    contentHash,
    contextVersion: organizationContextVersion(contentHash),
  });
}

describe('organization measurement context', () => {
  it('derives deterministic query and cohort versions from the confirmed context hash', () => {
    const first = deriveOrganizationMeasurementBinding(confirmedContext());
    const second = deriveOrganizationMeasurementBinding(confirmedContext());
    expect(first).toEqual(second);
    expect(first.ok && first.binding.querySetVersion).toMatch(/^oqs1-[0-9a-f]{8}-g1$/);
    expect(first.ok && first.binding.competitorCohortVersion).toMatch(/^occ1-[0-9a-f]{8}$/);
    expect(first.ok && first.binding.languages).toEqual(['en-CA', 'fr-CA']);
  });

  it('rejects detected context and a tampered context version before measurement', () => {
    expect(deriveOrganizationMeasurementBinding(confirmedContext({ status: 'detected', confirmation: null })))
      .toMatchObject({ ok: false, reasons: ['context_confirmation_missing', 'context_not_confirmed'] });
    const context = confirmedContext();
    expect(deriveOrganizationMeasurementBinding({ ...context, contextVersion: 'ocv1-deadbeef' }))
      .toMatchObject({ ok: false, reasons: ['context_hash_mismatch'] });
    expect(deriveOrganizationMeasurementBinding({
      ...context,
      market: { ...context.market, countryCode: 'GB', subdivisionCode: null },
    })).toMatchObject({ ok: false, reasons: ['context_hash_mismatch'] });
  });

  it('requires a fresh baseline after a material market or language edit without invalidating history', () => {
    const original = deriveOrganizationMeasurementBinding(confirmedContext());
    const edited = deriveOrganizationMeasurementBinding(confirmedContext({
      market: { ...confirmedContext().market, countryCode: 'US', subdivisionCode: 'US-NY', locality: 'Buffalo', languages: ['en-US'] },
    }));
    expect(original.ok && edited.ok).toBe(true);
    if (!original.ok || !edited.ok) return;
    const oldMetadata = organizationMeasurementMetadata(original.binding);
    const result = evaluateOrganizationMeasurementCompatibility({
      binding: edited.binding,
      configMetadata: oldMetadata,
      querySet: { version: original.binding.querySetVersion, metadata: oldMetadata },
      competitorList: original.binding.trackedCompetitorDomains,
    });
    expect(result.compatible).toBe(false);
    expect(result.baselineRequired).toBe(true);
    expect(result.reasons).toContain('configuration_context_mismatch');
    expect(result.reasons).toContain('market_mismatch');
    expect(result.reasons).toContain('language_mismatch');
  });

  it('accepts only a fully compatible query set, cohort, market and language snapshot', () => {
    const derived = deriveOrganizationMeasurementBinding(confirmedContext());
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const metadata = organizationMeasurementMetadata(derived.binding);
    expect(readOrganizationMeasurementBinding(metadata)).toEqual(derived.binding);
    expect(evaluateOrganizationMeasurementCompatibility({
      binding: derived.binding,
      configMetadata: metadata,
      querySet: { version: derived.binding.querySetVersion, metadata },
      competitorList: ['https://competitor.example'],
      runMetadata: metadata,
    })).toEqual({ compatible: true, baselineRequired: false, reasons: [] });
  });

  it('keeps tracked competitors, other brands, and cited sources as distinct roles', () => {
    const shared = { measuredCanonicalDomain: 'clinic.example', trackedCompetitorDomains: ['competitor.example'] };
    expect(classifyOrganizationReference({ ...shared, citedDomain: 'competitor.example', citationType: 'explicit_domain' }))
      .toBe('tracked_competitor');
    expect(classifyOrganizationReference({ ...shared, citedDomain: 'new-brand.example', citationType: 'brand_mention' }))
      .toBe('other_brand');
    expect(classifyOrganizationReference({ ...shared, citedDomain: 'government.example', citationType: 'explicit_url' }))
      .toBe('source');
  });
});
