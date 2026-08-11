import { describe, expect, it, vi } from 'vitest';
import { assembleBuyerIntelligenceSnapshot } from '../intelligence/buyer-intelligence-assembler';
import { projectBuyerIntelligenceEvidence } from '../intelligence/buyer-intelligence-projector';
import type { BuyerIntelligenceSnapshot } from '../intelligence/buyer-intelligence-contract';
import {
  BuyerIntelligenceSnapshotConflictError,
  createBuyerIntelligenceSnapshotRepositoryFromPersistence,
} from './buyer-intelligence-snapshot-repository';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(): BuyerIntelligenceSnapshot {
  const context = {
    contractVersion: 'organization-context-v1' as const,
    policyVersion: 'organization-context-precedence-v1' as const,
    contextId: 'context-primary', contextVersion: 'context-v1', contentHash: 'fnv1a32:1234abcd',
    owner: { type: 'startup_workspace' as const, id: OWNER_ID },
    organization: {
      identityId: IDENTITY_ID, displayName: 'Northstar Technology Services',
      canonicalDomain: 'northstar.example', aliases: [{ host: 'northstar.example', relationship: 'canonical' as const, reviewState: 'verified' as const }],
      category: 'managed service provider', services: ['managed IT services'],
    },
    market: {
      scope: 'regional' as const, countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal',
      serviceAreas: ['Montreal'], languages: ['en-CA'], timezone: 'America/Toronto',
      buyer: 'Small and mid-sized businesses', approvedCompetitorDomains: [],
    },
    status: 'confirmed' as const, evidence: [], conflicts: [],
    confirmation: { actorType: 'user' as const, actorId: OWNER_ID, confirmedAt: '2026-08-01T12:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation' as const], projectedAt: '2026-08-01T12:00:00.000Z',
  };
  const projection = projectBuyerIntelligenceEvidence({
    context: { contextVersion: context.contextVersion, status: context.status },
    generatedAt: '2026-08-11T12:00:00.000Z', staleAfterHours: 72,
    audit: {
      runId: 'run-audit-1', contextVersion: context.contextVersion, qualityState: 'valid',
      collectedAt: '2026-08-10T12:00:00.000Z',
      issues: [{ checkId: 'ai-crawler-access', status: 'WARNING', evidenceId: 'ev-access', evidenceStatus: 'present', contextVersion: context.contextVersion }],
    },
    benchmark: null,
  });
  return assembleBuyerIntelligenceSnapshot({
    context, projection,
    period: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' },
    measurement: {
      querySetId: 'msp-buyer-questions', querySetVersion: 'msp-buyer-questions-v1',
      qualityPolicyVersion: 'quality-policy-v1', evaluatorVersion: 'buyer-readiness-eval-v1',
      providerQualityVersion: 'provider-quality-v1',
      providers: [{ key: 'deep_audit', status: 'measured', runIds: ['run-audit-1'] }],
    },
    recommendations: [], previousSnapshot: null, generatedAt: '2026-08-11T12:00:00.000Z',
  });
}

function memoryPersistence() {
  const rows = new Map<string, any>();
  return {
    rows,
    persistence: {
      async find(id: string, owner: BuyerIntelligenceSnapshot['owner']) {
        const row = rows.get(id) ?? null;
        return row?.owner_type === owner.type && row?.owner_id === owner.id ? row : null;
      },
      async insert(row: any) {
        if (rows.has(row.snapshot_id)) throw new Error('unique_violation');
        rows.set(row.snapshot_id, structuredClone(row));
      },
    },
  };
}

describe('buyer intelligence snapshot repository', () => {
  it('stores and loads an exact canonical snapshot', async () => {
    const memory = memoryPersistence();
    const repository = createBuyerIntelligenceSnapshotRepositoryFromPersistence(memory.persistence);
    const source = snapshot();
    await expect(repository.store(source)).resolves.toEqual({ snapshot: source, created: true });
    await expect(repository.load(source.snapshotId, source.owner)).resolves.toEqual(source);
  });

  it('makes identical writes idempotent', async () => {
    const memory = memoryPersistence();
    const repository = createBuyerIntelligenceSnapshotRepositoryFromPersistence(memory.persistence);
    const source = snapshot();
    await repository.store(source);
    await expect(repository.store(structuredClone(source))).resolves.toEqual({ snapshot: source, created: false });
    expect(memory.rows).toHaveLength(1);
  });

  it('fails closed and audits when the same ID carries different content', async () => {
    const memory = memoryPersistence();
    const audit = vi.fn(async () => undefined);
    const repository = createBuyerIntelligenceSnapshotRepositoryFromPersistence(memory.persistence, audit);
    const source = snapshot();
    await repository.store(source);
    const conflicting = { ...source, limitations: ['changed after identity assignment'] };
    await expect(repository.store(conflicting)).rejects.toBeInstanceOf(BuyerIntelligenceSnapshotConflictError);
    expect(audit).toHaveBeenCalledOnce();
    await expect(repository.load(source.snapshotId, source.owner)).resolves.toEqual(source);
  });

  it('does not return a snapshot to a different owner', async () => {
    const memory = memoryPersistence();
    const repository = createBuyerIntelligenceSnapshotRepositoryFromPersistence(memory.persistence);
    const source = snapshot();
    await repository.store(source);
    await expect(repository.load(source.snapshotId, {
      type: 'startup_workspace', id: '33333333-3333-4333-8333-333333333333',
    })).resolves.toBeNull();
  });

  it('rejects column-to-payload corruption on load', async () => {
    const memory = memoryPersistence();
    const repository = createBuyerIntelligenceSnapshotRepositoryFromPersistence(memory.persistence);
    const source = snapshot();
    await repository.store(source);
    memory.rows.get(source.snapshotId).context_version = 'context-tampered';
    await expect(repository.load(source.snapshotId, source.owner)).rejects.toThrow('buyer_intelligence_snapshot_corrupt');
  });
});
