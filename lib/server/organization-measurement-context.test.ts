import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadActiveOrganizationMeasurementContext } from './organization-measurement-context';
import {
  organizationContextContentHash,
  organizationContextSchema,
  organizationContextVersion,
} from '../intelligence/organization-context';

function confirmedContext() {
  const base = {
    contractVersion: 'organization-context-v1', policyVersion: 'organization-context-precedence-v1',
    contextId: 'oc:11111111-1111-4111-8111-111111111111:agency_client:33333333-3333-4333-8333-333333333333',
    owner: { type: 'agency_client' as const, id: '33333333-3333-4333-8333-333333333333' },
    organization: { identityId: '11111111-1111-4111-8111-111111111111', displayName: 'Clinic', canonicalDomain: 'clinic.example', aliases: [], category: 'private medical clinic', services: [] },
    market: { scope: 'local' as const, countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal', serviceAreas: [], languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto', buyer: 'patients', approvedCompetitorDomains: [] },
    status: 'confirmed' as const, evidence: [], conflicts: [],
    confirmation: { actorType: 'user' as const, actorId: '44444444-4444-4444-8444-444444444444', confirmedAt: '2026-08-01T00:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation' as const], projectedAt: '2026-08-01T00:00:00.000Z',
  };
  const contentHash = organizationContextContentHash({ ...base, projectedAt: undefined });
  return organizationContextSchema.parse({ ...base, contentHash, contextVersion: organizationContextVersion(contentHash) });
}

function config() {
  return {
    id: 'config-1', startup_workspace_id: null, agency_account_id: '22222222-2222-4222-8222-222222222222',
    benchmark_domain_id: 'benchmark-domain-1', topic: 'clinic', location: 'Montreal', query_set_id: 'set-1',
    competitor_list: [], cadence: 'monthly' as const, platforms_enabled: ['gemini'], report_email: null,
    metadata: { agency_client_id: '33333333-3333-4333-8333-333333333333' },
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
  };
}

function supabase(
  mapping: Record<string, unknown> | null,
  context = confirmedContext(),
) {
  const ownerFilters: Array<[string, unknown]> = [];
  return {
    ownerFilters,
    client: {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: (field: string, value: unknown) => {
            if (table === 'intelligence_domain_owners') ownerFilters.push([field, value]);
            return chain;
          },
          is: (field: string, value: unknown) => {
            if (table === 'intelligence_domain_owners') ownerFilters.push([field, value]);
            return chain;
          },
          maybeSingle: async () => table === 'intelligence_source_identity_maps'
            ? { data: mapping, error: null }
            : { data: { metadata: { organization_context_snapshot: context } }, error: null },
        };
        return chain;
      },
    },
  };
}

describe('active organization measurement context loader', () => {
  it('uses the exact agency-client tenant owner instead of the broader agency account', async () => {
    const harness = supabase({ canonical_domain_id: '11111111-1111-4111-8111-111111111111', mapping_status: 'mapped' });
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: harness.client as never,
      config: config(),
    });
    expect(result.status).toBe('ready');
    expect(harness.ownerFilters).toEqual([
      ['domain_id', '11111111-1111-4111-8111-111111111111'],
      ['owner_type', 'agency_client'],
      ['owner_id', '33333333-3333-4333-8333-333333333333'],
    ]);
  });

  it('fails closed when the operational domain has no canonical identity mapping', async () => {
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: supabase(null).client as never,
      config: config(),
    });
    expect(result).toEqual({ status: 'blocked', reasons: ['identity_mapping_missing'] });
  });

  it('fails closed when the stored snapshot belongs to another tenant', async () => {
    const context = confirmedContext();
    const wrongOwner = { ...context, owner: { ...context.owner, id: '55555555-5555-4555-8555-555555555555' } };
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: supabase({ canonical_domain_id: '11111111-1111-4111-8111-111111111111', mapping_status: 'mapped' }, wrongOwner).client as never,
      config: config(),
    });
    expect(result).toEqual({ status: 'blocked', reasons: ['organization_context_owner_mismatch'] });
  });

  it('fails closed without throwing when the stored context is only a legacy partial', async () => {
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: supabase(
        { canonical_domain_id: '11111111-1111-4111-8111-111111111111', mapping_status: 'mapped' },
        { owner: { type: 'agency_client', id: '33333333-3333-4333-8333-333333333333' }, organization: {}, market: {} } as never,
      ).client as never,
      config: config(),
    });
    expect(result).toEqual({ status: 'blocked', reasons: ['organization_context_missing'] });
  });
});
