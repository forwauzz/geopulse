import { describe, expect, it, vi } from 'vitest';
import { buyerIntelligenceFixtureSnapshot } from '@/lib/intelligence/testing/buyer-intelligence-fixtures';
import { GEO_PULSE_BRAND } from '@workers/report/report-branding';
import type { BuyerIntelligenceGeneration } from './buyer-intelligence-generation-repository';
import { generateBuyerIntelligenceArtifact } from './buyer-intelligence-generation-service';

const generation: BuyerIntelligenceGeneration = {
  id: '44444444-4444-4444-8444-444444444444', agencyAccountId: '11111111-1111-4111-8111-111111111111',
  agencyClientId: '22222222-2222-4222-8222-222222222222', snapshotId: 'snapshot:client:2026-08',
  viewKind: 'prospect_preview', idempotencyKey: 'generate:client:2026-08:preview',
  requestedByUserId: '33333333-3333-4333-8333-333333333333', branding: {}, heroR2Key: null,
  status: 'queued', artifactR2Key: null, attempts: 1, errorCode: null, startedAt: null,
  completedAt: null, createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
};

describe('buyer intelligence artifact generation', () => {
  it('renders, stores, and records one artifact', async () => {
    const put = vi.fn(async () => undefined);
    const repository = {
      claim: vi.fn(async () => ({ generation, execute: true })),
      start: vi.fn(async () => ({ ...generation, status: 'rendering' as const })),
      succeed: vi.fn(async (row: BuyerIntelligenceGeneration, key: string) => ({ ...row, status: 'succeeded' as const, artifactR2Key: key })),
      fail: vi.fn(),
    };
    const result = await generateBuyerIntelligenceArtifact({
      request: generation,
      snapshot: buyerIntelligenceFixtureSnapshot(generation.agencyClientId),
      brand: GEO_PULSE_BRAND,
      repository,
      bucket: { get: vi.fn(), put },
    });
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
    expect(result.generation.status).toBe('succeeded');
    expect(put).toHaveBeenCalledOnce();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('returns the stored artifact for an exact successful replay', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const succeeded = { ...generation, status: 'succeeded' as const, artifactR2Key: 'stored.pdf' };
    const repository = {
      claim: vi.fn(async () => ({ generation: succeeded, execute: false })), start: vi.fn(), succeed: vi.fn(), fail: vi.fn(),
    };
    const result = await generateBuyerIntelligenceArtifact({
      request: generation, snapshot: buyerIntelligenceFixtureSnapshot(generation.agencyClientId), brand: GEO_PULSE_BRAND,
      repository, bucket: { get: vi.fn(async () => ({ arrayBuffer: async () => bytes.buffer })), put: vi.fn() },
    });
    expect(result).toMatchObject({ reused: true, bytes });
    expect(repository.start).not.toHaveBeenCalled();
  });
});
