import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('./organization-context-repository', () => ({
  createOrganizationContextRepository: vi.fn(() => ({ getByOwnerAndDomain: mocks.lookup })),
}));

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

function supabase(mapping: Record<string, unknown> | null) {
  return {
    from(table: string) {
      expect(table).toBe('intelligence_source_identity_maps');
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: mapping, error: null }),
      };
      return chain;
    },
  };
}

describe('active organization measurement context loader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the exact agency-client tenant owner instead of the broader agency account', async () => {
    mocks.lookup.mockResolvedValue({ status: 'ready', context: confirmedContext() });
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: supabase({ canonical_domain_id: '11111111-1111-4111-8111-111111111111', mapping_status: 'mapped' }) as never,
      config: config(),
    });
    expect(result.status).toBe('ready');
    expect(mocks.lookup).toHaveBeenCalledWith({
      ownerType: 'agency_client',
      ownerId: '33333333-3333-4333-8333-333333333333',
      domainId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('fails closed when the operational domain has no canonical identity mapping', async () => {
    const result = await loadActiveOrganizationMeasurementContext({
      supabase: supabase(null) as never,
      config: config(),
    });
    expect(result).toEqual({ status: 'blocked', reasons: ['identity_mapping_missing'] });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
