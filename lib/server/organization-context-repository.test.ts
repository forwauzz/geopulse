import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import {
  confirmedOrganizationContextMetadata,
  createOrganizationContextRepository,
  projectOrganizationContext,
  type OrganizationContextProjectionRows,
} from './organization-context-repository';

const ids = {
  domain: '20000000-0000-4000-8000-000000000001',
  agencyClient: '20000000-0000-4000-8000-000000000002',
  otherClient: '20000000-0000-4000-8000-000000000003',
  confirmer: '20000000-0000-4000-8000-000000000004',
};

const confirmedContext = {
  displayName: 'SanoMed Solutions',
  canonicalDomain: 'sanomedsolutions.com',
  category: 'private medical clinic',
  services: ['preventive medicine', 'travel medicine', 'same-day care'],
  buyer: 'patients seeking private medical care',
  marketScope: 'local',
  countryCode: 'CA',
  subdivisionCode: 'CA-QC',
  locality: 'Pointe-Claire',
  serviceAreas: ["Montreal's West Island"],
  languages: ['en-CA', 'fr-CA'],
  timezone: 'America/Toronto',
  approvedCompetitorDomains: ['clinique360.com', 'unionmd.ca'],
  confirmation: {
    actorType: 'user', actorId: ids.confirmer, confirmedAt: '2026-08-02T00:00:00.000Z',
  },
  versionReasonCodes: ['initial_projection', 'tenant_confirmation'],
};

describe('confirmed Organization Context writes', () => {
  it('creates an auditable, normalized tenant confirmation payload', () => {
    expect(confirmedOrganizationContextMetadata({
      ownerType: 'agency_client',
      ownerId: ids.agencyClient,
      actorId: ids.confirmer,
      canonicalDomain: 'WWW.Example.CA',
      displayName: ' Example Clinic ',
      category: ' preventive medicine clinic ',
      services: ['travel health', 'travel health'],
      buyer: ' patients ',
      marketScope: 'local',
      countryCode: 'ca',
      subdivisionCode: 'ca-qc',
      locality: 'Pointe-Claire',
      serviceAreas: ["Montreal's West Island"],
      languages: ['fr-CA', 'en-CA'],
      timezone: 'America/Toronto',
      approvedCompetitorDomains: ['UNIONMD.CA'],
    }, '2026-08-02T00:00:00.000Z')).toMatchObject({
      displayName: 'Example Clinic',
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      services: ['travel health'],
      approvedCompetitorDomains: ['unionmd.ca'],
      confirmation: {
        actorType: 'user',
        actorId: ids.confirmer,
        confirmedAt: '2026-08-02T00:00:00.000Z',
      },
      versionReasonCodes: ['initial_projection', 'tenant_confirmation'],
    });
  });
});

function projectionRows(overrides: Partial<OrganizationContextProjectionRows> = {}): OrganizationContextProjectionRows {
  return {
    domain: {
      id: ids.domain,
      normalized_host: 'sanomedsolutions.com',
      display_name: 'SanoMed Solutions',
      vertical: 'healthcare',
      subvertical: 'private medical clinic',
      geography: {
        scope: 'local', country_code: 'CA', subdivision_code: 'CA-QC', locality: 'Pointe-Claire',
        service_areas: ["Montreal's West Island"], languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto',
      },
      review_state: 'verified',
      normalization_version: 'domain-page-v1',
      metadata: {},
    },
    owner: {
      domain_id: ids.domain,
      owner_type: 'agency_client',
      owner_id: ids.agencyClient,
      visibility: 'tenant',
      metadata: { organization_context: confirmedContext },
    },
    aliases: [
      { alias_host: 'sanomed.ca', relationship: 'redirect', review_state: 'verified' },
      { alias_host: 'sanomed.co.uk', relationship: 'observed_alias', review_state: 'rejected' },
    ],
    evidence: [],
    projectedAt: '2026-08-02T01:00:00.000Z',
    ...overrides,
  };
}

describe('Organization Context projection', () => {
  it('projects the Canadian SanoMed identity and market without the rejected UK lookalike', () => {
    const result = projectOrganizationContext(projectionRows());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context).toMatchObject({
      owner: { type: 'agency_client', id: ids.agencyClient },
      organization: {
        displayName: 'SanoMed Solutions',
        canonicalDomain: 'sanomedsolutions.com',
        aliases: [{ host: 'sanomed.ca', relationship: 'redirect', reviewState: 'verified' }],
        category: 'private medical clinic',
      },
      market: {
        scope: 'local', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire',
        languages: ['en-CA', 'fr-CA'], timezone: 'America/Toronto',
      },
      status: 'confirmed',
      conflicts: [],
    });
    expect(result.context.organization.aliases).not.toContainEqual(expect.objectContaining({ host: 'sanomed.co.uk' }));
  });

  it('keeps the tenant-confirmed Canadian value but fails closed on UK evidence', () => {
    const result = projectOrganizationContext(projectionRows({
      evidence: [{
        stable_evidence_id: 'ev-uk', source_kind: 'website', source_id: 'sanomed-uk',
        evidence_kind: 'official_website_profile', artifact_status: 'present', privacy: 'public',
        tenant_type: null, tenant_id: null, collected_at: '2026-08-01T00:00:00.000Z',
        metadata: { source_tier: 'exact_official_website', confidence: 0.95, organization_facts: { country_code: 'GB' } },
      }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.market.countryCode).toBe('CA');
    expect(result.context.status).toBe('conflicted');
    expect(result.context.conflicts).toContainEqual(expect.objectContaining({
      code: 'country_conflict', retainedValue: 'CA', proposedValue: 'GB', material: true,
    }));
    expect(result.context.versionReasonCodes).toContain('material_conflict_detected');
  });

  it('projects evidence timestamps that arrive with a Postgres offset rather than a Z suffix', () => {
    // Every other fixture uses the canonical Z form, which is why this reached
    // production: `timestamptz` comes back as `+00:00`, and the schema rejects
    // offsets. The projection threw instead of returning needs_review, so the
    // backfill preview could not classify a single record.
    const result = projectOrganizationContext(projectionRows({
      evidence: [{
        stable_evidence_id: 'ev-offset', source_kind: 'website', source_id: 'sanomed-ca',
        evidence_kind: 'official_website_profile', artifact_status: 'present', privacy: 'public',
        tenant_type: null, tenant_id: null, collected_at: '2026-08-04 14:01:59.900828+00',
        metadata: { source_tier: 'exact_official_website', confidence: 0.9 },
      }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.evidence[0]?.collectedAt).toBe('2026-08-04T14:01:59.900Z');
  });

  it('does not change the context version merely because it is projected later', () => {
    const first = projectOrganizationContext(projectionRows());
    const later = projectOrganizationContext(projectionRows({ projectedAt: '2026-08-03T01:00:00.000Z' }));
    expect(first.ok && later.ok).toBe(true);
    if (!first.ok || !later.ok) return;
    expect(later.context.contentHash).toBe(first.context.contentHash);
    expect(later.context.contextVersion).toBe(first.context.contextVersion);
  });

  it.each([
    [{ country_code: null }, 'country_code_missing'],
    [{ country_code: 'Canada' }, 'country_code_invalid'],
    [{ subdivision_code: 'Quebec' }, 'subdivision_code_invalid'],
    [{ languages: [] }, 'language_missing'],
    [{ languages: ['English'] }, 'language_invalid'],
    [{ timezone: null }, 'timezone_missing'],
    [{ timezone: 'Montreal time' }, 'timezone_invalid'],
    [{ scope: null }, 'market_scope_missing'],
    [{ scope: 'West Island only' }, 'market_scope_invalid'],
  ] as const)('returns a stable reason when structured market context is incomplete', (geography, reason) => {
    const base = projectionRows();
    const ownerContext = { ...confirmedContext } as Record<string, unknown>;
    if ('country_code' in geography) delete ownerContext.countryCode;
    if ('subdivision_code' in geography) delete ownerContext.subdivisionCode;
    if ('languages' in geography) delete ownerContext.languages;
    if ('timezone' in geography) delete ownerContext.timezone;
    if ('scope' in geography) delete ownerContext.marketScope;
    const result = projectOrganizationContext(projectionRows({
      domain: { ...base.domain, geography: { ...base.domain.geography, ...geography } },
      owner: { ...base.owner, metadata: { organization_context: ownerContext } },
    }));
    expect(result).toEqual({ ok: false, reason });
  });

  it('fails closed with a stable reason when stored confirmation is malformed', () => {
    const base = projectionRows();
    const result = projectOrganizationContext(projectionRows({
      owner: {
        ...base.owner,
        metadata: { organization_context: { ...confirmedContext, confirmation: { actorType: 'user' } } },
      },
    }));
    expect(result).toEqual({ ok: false, reason: 'confirmation_invalid' });
  });
});

function filteredQuery<T>(rows: readonly T[], single = false) {
  const filters = new Map<string, unknown>();
  const matches = (row: T) => [...filters.entries()].every(([column, value]) =>
    (row as Record<string, unknown>)[column] === value
  );
  const chain = {
    eq(column: string, value: unknown) { filters.set(column, value); return chain; },
    is(column: string, value: unknown) { filters.set(column, value); return chain; },
    maybeSingle: async () => ({ data: rows.filter(matches)[0] ?? null, error: null }),
    then(resolve: (result: { data: readonly T[]; error: null }) => unknown) {
      const data = rows.filter(matches);
      return Promise.resolve({ data: single ? data.slice(0, 1) : data, error: null }).then(resolve);
    },
  };
  return chain;
}

describe('Organization Context repository tenancy', () => {
  function repository() {
    const hits: string[] = [];
    const base = projectionRows();
    const tables: Record<string, readonly Record<string, unknown>[]> = {
      intelligence_domain_owners: [base.owner],
      intelligence_domains: [base.domain],
      intelligence_domain_aliases: base.aliases,
      intelligence_evidence_objects: [
        {
          stable_evidence_id: 'ev-public', source_kind: 'website', source_id: 'public',
          evidence_kind: 'official_website_profile', artifact_status: 'present', privacy: 'public',
          tenant_type: null, tenant_id: null, collected_at: '2026-08-01T00:00:00.000Z', metadata: {},
          canonical_domain_id: ids.domain,
        },
        {
          stable_evidence_id: 'ev-owner', source_kind: 'note', source_id: 'owner',
          evidence_kind: 'tenant_confirmation', artifact_status: 'present', privacy: 'private_tenant',
          tenant_type: 'agency_client', tenant_id: ids.agencyClient, collected_at: '2026-08-01T00:00:00.000Z', metadata: {},
          canonical_domain_id: ids.domain,
        },
        {
          stable_evidence_id: 'ev-other', source_kind: 'note', source_id: 'other',
          evidence_kind: 'tenant_confirmation', artifact_status: 'present', privacy: 'private_tenant',
          tenant_type: 'agency_client', tenant_id: ids.otherClient, collected_at: '2026-08-01T00:00:00.000Z', metadata: {},
          canonical_domain_id: ids.domain,
        },
        {
          stable_evidence_id: 'ev-internal', source_kind: 'review', source_id: 'internal',
          evidence_kind: 'operator_review', artifact_status: 'present', privacy: 'internal',
          tenant_type: null, tenant_id: null, collected_at: '2026-08-01T00:00:00.000Z', metadata: {},
          canonical_domain_id: ids.domain,
        },
      ],
    };
    const supabase = {
      from(table: string) {
        hits.push(table);
        return { select: () => filteredQuery(tables[table] ?? []) };
      },
    };
    return { repo: createOrganizationContextRepository(supabase as never), hits };
  }

  it('returns only public/shared and exact-owner private evidence', async () => {
    const { repo } = repository();
    const result = await repo.getByOwnerAndDomain({
      ownerType: 'agency_client', ownerId: ids.agencyClient, domainId: ids.domain,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.evidence.map((evidence) => evidence.evidenceId)).toEqual(['ev-owner', 'ev-public']);
  });

  it('fails before reading canonical or evidence rows when the owner link is absent', async () => {
    const { repo, hits } = repository();
    const result = await repo.getByOwnerAndDomain({
      ownerType: 'agency_client', ownerId: ids.otherClient, domainId: ids.domain,
    });
    expect(result).toEqual({ status: 'unauthorized', reason: 'owner_scope_missing' });
    expect(hits).toEqual(['intelligence_domain_owners']);
  });

  it('rejects invalid owner shapes without any database read', async () => {
    const { repo, hits } = repository();
    expect(await repo.getByOwnerAndDomain({
      ownerType: 'startup_workspace', ownerId: null, domainId: ids.domain,
    })).toEqual({ status: 'unauthorized', reason: 'owner_shape_invalid' });
    expect(hits).toEqual([]);
  });

  it('rejects malformed tenant IDs without any database read', async () => {
    const { repo, hits } = repository();
    expect(await repo.getByOwnerAndDomain({
      ownerType: 'agency_client', ownerId: 'not-a-uuid', domainId: ids.domain,
    })).toEqual({ status: 'unauthorized', reason: 'owner_shape_invalid' });
    expect(hits).toEqual([]);
  });
});
