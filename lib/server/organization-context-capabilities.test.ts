import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./organization-context-repository', () => ({
  createOrganizationContextRepository: vi.fn(),
}));
vi.mock('../intelligence/evidence-retrieval', () => ({
  retrieveIntelligenceEvidence: vi.fn(),
}));
vi.mock('./load-agency-report-snapshot', () => ({
  loadLatestAgencyReport: vi.fn(),
}));
vi.mock('./buyer-intelligence-snapshot-repository', () => ({
  createBuyerIntelligenceSnapshotRepository: vi.fn(),
}));
vi.mock('../intelligence/buyer-intelligence-view-model', () => ({
  buildBuyerIntelligenceView: vi.fn(),
}));
vi.mock('./organization-resolver', () => ({
  resolveOrganizationWebsite: vi.fn(),
}));
vi.mock('./agency-report-pdf', () => ({
  buildAgencyReportPdf: vi.fn(),
}));

import { ORGANIZATION_CAPABILITY_CONTRACT_VERSION } from '../intelligence/organization-context-capabilities';
import { retrieveIntelligenceEvidence } from '../intelligence/evidence-retrieval';
import { buildAgencyReportPdf } from './agency-report-pdf';
import { loadLatestAgencyReport } from './load-agency-report-snapshot';
import { createOrganizationContextRepository } from './organization-context-repository';
import { buildBuyerIntelligenceView } from '../intelligence/buyer-intelligence-view-model';
import { createBuyerIntelligenceSnapshotRepository } from './buyer-intelligence-snapshot-repository';
import { executeOrganizationCapability } from './organization-context-capabilities';

const ids = {
  actor: '40000000-0000-4000-8000-000000000001',
  client: '40000000-0000-4000-8000-000000000002',
  otherClient: '40000000-0000-4000-8000-000000000003',
  domain: '40000000-0000-4000-8000-000000000004',
};

const target = { type: 'agency_client' as const, id: ids.client };
const audit = {
  requestId: 'request-1',
  actorId: ids.actor,
  requestedAt: '2026-08-02T12:00:00.000Z',
  purpose: 'Internal customer-safe operation',
};
const access = {
  actorId: ids.actor,
  isPlatformAdmin: false,
  scopes: [target],
  permissions: {
    read: true,
    generateArtifact: true,
    previewArtifact: true,
    externalDelivery: false,
  },
};
const runtime = { supabase: {} as never };

const context = {
  contractVersion: 'organization-context-v1',
  policyVersion: 'organization-context-precedence-v1',
  contextId: 'oc:test',
  contextVersion: 'ocv1-12345678',
  contentHash: 'fnv1a32:12345678',
  owner: target,
  organization: {
    identityId: ids.domain,
    displayName: 'Example Clinic',
    canonicalDomain: 'example.ca',
    aliases: [],
    category: 'private clinic',
    services: ['preventive medicine'],
  },
  market: {
    scope: 'local',
    countryCode: 'CA',
    subdivisionCode: 'CA-QC',
    locality: 'Montreal',
    serviceAreas: ['West Island'],
    languages: ['en-CA', 'fr-CA'],
    timezone: 'America/Toronto',
    buyer: 'patients',
    approvedCompetitorDomains: ['competitor.ca'],
  },
  status: 'confirmed',
  evidence: [],
  conflicts: [],
  confirmation: { actorType: 'user', actorId: ids.actor, confirmedAt: '2026-08-02T00:00:00.000Z' },
  versionReasonCodes: ['tenant_confirmation'],
  projectedAt: '2026-08-02T00:00:00.000Z',
} as const;

function request(fields: Record<string, unknown>) {
  return {
    contractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
    audit,
    target,
    ...fields,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createOrganizationContextRepository).mockReturnValue({
    getByOwnerAndDomain: vi.fn().mockResolvedValue({ status: 'ready', context }),
  });
  vi.mocked(createBuyerIntelligenceSnapshotRepository).mockReturnValue({
    list: vi.fn().mockResolvedValue([]),
  } as never);
});

describe('Organization capability authorization and safe outputs', () => {
  it('serves an authorized exact-tenant context through the existing repository', async () => {
    const onAudit = vi.fn();
    const result = await executeOrganizationCapability({
      runtime: { ...runtime, onAudit },
      access,
      request: request({ capability: 'read_context', domainId: ids.domain }),
    });
    expect(result).toMatchObject({
      status: 'ready',
      externalDeliveryAuthorized: false,
      value: { context: { owner: target, organization: { canonicalDomain: 'example.ca' } } },
    });
    expect(onAudit).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-1', actorId: ids.actor, capability: 'read_context', outcome: 'ready',
    }));
  });

  it('runs read-only exact-site detection without persisting the result', async () => {
    const resolveWebsite = vi.fn().mockResolvedValue({
      ok: true,
      resolution: {
        resolverVersion: 'organization-resolver-v1',
        geographicPolicyVersion: 'organization-geography-v1',
        resolvedAt: '2026-08-02T12:00:00.000Z',
        status: 'proposed', reasonCodes: [],
        identity: { requestedDomain: 'example.ca', canonicalDomain: 'example.ca', approvedAliases: [], redirectChain: [] },
        organization: { displayName: 'Example', category: 'clinic', services: [], buyer: null, publicEmail: null, publicTelephone: null },
        markets: [], evidence: [], confidence: 0.8, limitations: [],
      },
    });
    const result = await executeOrganizationCapability({
      runtime: { ...runtime, resolveWebsite },
      access,
      request: request({ capability: 'detect_context', url: 'https://example.ca', approvedAliasHosts: [] }),
    });
    expect(result).toMatchObject({ status: 'ready', value: { detection: { status: 'proposed' } } });
    expect(resolveWebsite).toHaveBeenCalledOnce();
    expect(createOrganizationContextRepository).not.toHaveBeenCalled();
  });

  it('lists market data as a portable domain contract', async () => {
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: request({ capability: 'list_markets', domainId: ids.domain }),
    });
    expect(result).toMatchObject({
      status: 'ready',
      value: { markets: [{ canonicalDomain: 'example.ca', countryCode: 'CA', locality: 'Montreal' }] },
    });
  });

  it('fails before data access for a cross-client portfolio request', async () => {
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: {
        ...request({ capability: 'read_context', domainId: ids.domain }),
        target: { type: 'agency_client', id: ids.otherClient },
      },
    });
    expect(result).toMatchObject({ status: 'denied', error: 'tenant_scope_violation' });
    expect(createOrganizationContextRepository).not.toHaveBeenCalled();
  });

  it('allows a portfolio operator to choose another client only when that exact scope is present', async () => {
    const otherContext = { ...context, owner: { type: 'agency_client' as const, id: ids.otherClient } };
    vi.mocked(createOrganizationContextRepository).mockReturnValue({
      getByOwnerAndDomain: vi.fn().mockResolvedValue({ status: 'ready', context: otherContext }),
    });
    const result = await executeOrganizationCapability({
      runtime,
      access: { ...access, scopes: [target, { type: 'agency_client', id: ids.otherClient }] },
      request: {
        ...request({ capability: 'read_context', domainId: ids.domain }),
        target: { type: 'agency_client', id: ids.otherClient },
      },
    });
    expect(result).toMatchObject({
      status: 'ready', value: { context: { owner: { id: ids.otherClient } } },
    });
  });

  it('removes storage, tenant, and metadata fields from retrieved evidence', async () => {
    vi.mocked(retrieveIntelligenceEvidence).mockResolvedValue({
      status: 'ready',
      limitations: [],
      evidence: [{
        evidenceId: 'ev-safe',
        sourceKind: 'website',
        sourceTable: 'private_rows',
        sourceId: 'row-secret',
        observedAt: '2026-08-02T00:00:00.000Z',
        excerpt: 'Public source-backed excerpt.',
        sourceUrl: 'https://example.ca/service',
        qualityState: 'valid',
        tenantType: 'agency_client',
        tenantId: ids.client,
        metadata: { private_note: 'must not escape' },
      }],
    });
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: request({ capability: 'retrieve_evidence', domainHost: 'example.ca', limit: 20 }),
    });
    expect(result.status).toBe('ready');
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('ev-safe');
    expect(serialized).not.toContain('private_rows');
    expect(serialized).not.toContain('row-secret');
    expect(serialized).not.toContain(ids.client);
    expect(serialized).not.toContain('private_note');
  });

  it('fails closed when no context-compatible measurement can support an explanation', async () => {
    vi.mocked(loadLatestAgencyReport).mockResolvedValue(null);
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: request({
        capability: 'explain_measurement',
        agencyClientId: ids.client,
        claim: 'observed_visibility',
      }),
    });
    expect(result).toMatchObject({
      status: 'insufficient_evidence',
      error: 'incompatible_measurement',
      externalDeliveryAuthorized: false,
    });
  });

  it('generates only an in-memory draft and never implies persistence, sharing, or delivery', async () => {
    vi.mocked(loadLatestAgencyReport).mockResolvedValue({
      reportId: 'report-1',
      agencyClientId: ids.client,
      pdfR2Key: 'existing/immutable.pdf',
      generatedAt: '2026-08-02T00:00:00.000Z',
      snapshot: { clientName: 'Example Clinic' } as never,
    });
    vi.mocked(buildAgencyReportPdf).mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: request({
        capability: 'generate_artifact',
        agencyClientId: ids.client,
        artifactKind: 'agency_visibility_report',
      }),
    });
    expect(result).toMatchObject({
      status: 'ready',
      externalDeliveryAuthorized: false,
      value: {
        artifact: {
          byteLength: 4,
          persisted: false,
          shared: false,
          delivered: false,
        },
      },
    });
    expect(createBuyerIntelligenceSnapshotRepository).not.toHaveBeenCalled();
  });

  it('enforces preview permission independently of read and generation', async () => {
    const result = await executeOrganizationCapability({
      runtime,
      access: { ...access, permissions: { ...access.permissions, previewArtifact: false } },
      request: request({
        capability: 'preview_artifact',
        agencyClientId: ids.client,
        artifactKind: 'agency_visibility_report',
      }),
    });
    expect(result).toMatchObject({ status: 'denied', error: 'permission_denied' });
    expect(createBuyerIntelligenceSnapshotRepository).not.toHaveBeenCalled();
  });

  it('previews only the canonical eligible buyer-intelligence snapshot', async () => {
    const snapshot = { snapshotId: 'bis-v1:canonical' } as never;
    vi.mocked(createBuyerIntelligenceSnapshotRepository).mockReturnValue({
      list: vi.fn().mockResolvedValue([snapshot]),
    } as never);
    vi.mocked(buildBuyerIntelligenceView).mockReturnValue({
      contractVersion: 'buyer-intelligence-view-v1',
      kind: 'prospect_preview',
      snapshotId: 'bis-v1:canonical',
      identity: { canonicalDomain: 'example.ca' },
    } as never);
    const result = await executeOrganizationCapability({
      runtime,
      access,
      request: request({
        capability: 'preview_artifact',
        agencyClientId: ids.client,
        artifactKind: 'agency_visibility_report',
      }),
    });
    expect(result).toMatchObject({
      status: 'ready', externalDeliveryAuthorized: false,
      value: { preview: { snapshotId: 'bis-v1:canonical', identity: { canonicalDomain: 'example.ca' } } },
    });
    expect(createBuyerIntelligenceSnapshotRepository).toHaveBeenCalledWith(runtime.supabase);
    expect(buildBuyerIntelligenceView).toHaveBeenCalledWith({ kind: 'prospect_preview', snapshot });
    expect(buildAgencyReportPdf).not.toHaveBeenCalled();
  });
});
