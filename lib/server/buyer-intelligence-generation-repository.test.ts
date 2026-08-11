import { describe, expect, it } from 'vitest';
import {
  BuyerIntelligenceGenerationConflictError,
  createBuyerIntelligenceGenerationRepository,
  type BuyerIntelligenceGeneration,
  type BuyerIntelligenceGenerationPersistence,
  type BuyerIntelligenceGenerationRequest,
} from './buyer-intelligence-generation-repository';

const request: BuyerIntelligenceGenerationRequest = {
  agencyAccountId: '11111111-1111-4111-8111-111111111111',
  agencyClientId: '22222222-2222-4222-8222-222222222222',
  snapshotId: 'snapshot:client:2026-08',
  viewKind: 'prospect_preview',
  idempotencyKey: 'generate:client:2026-08:preview',
  requestedByUserId: '33333333-3333-4333-8333-333333333333',
  branding: { companyName: 'Northstar MSP' },
  heroR2Key: 'buyer-intelligence/heroes/northstar.png',
};

function fixture() {
  let sequence = 0;
  const rows: BuyerIntelligenceGeneration[] = [];
  const persistence: BuyerIntelligenceGenerationPersistence = {
    async findById(id, accountId, clientId) {
      return rows.find((row) => row.id === id && row.agencyAccountId === accountId && row.agencyClientId === clientId) ?? null;
    },
    async list(accountId, clientId, limit) {
      return rows.filter((row) => row.agencyAccountId === accountId && row.agencyClientId === clientId).slice(0, limit);
    },
    async findByIdempotencyKey(accountId, key) {
      return rows.find((row) => row.agencyAccountId === accountId && row.idempotencyKey === key) ?? null;
    },
    async insert(input) {
      sequence += 1;
      const now = `2026-08-11T12:00:0${sequence}.000Z`;
      const row: BuyerIntelligenceGeneration = {
        ...input, id: `44444444-4444-4444-8444-44444444444${sequence}`,
        status: 'queued', artifactR2Key: null, attempts: 1, errorCode: null,
        startedAt: null, completedAt: null, createdAt: now, updatedAt: now,
      };
      rows.push(row);
      return row;
    },
    async transition(args) {
      const index = rows.findIndex((row) => row.id === args.id
        && row.agencyAccountId === args.agencyAccountId && args.from.includes(row.status));
      if (index < 0) return null;
      const current = rows[index]!;
      const now = '2026-08-11T12:01:00.000Z';
      const row: BuyerIntelligenceGeneration = {
        ...current,
        status: args.to,
        artifactR2Key: args.artifactR2Key === undefined ? current.artifactR2Key : args.artifactR2Key,
        errorCode: args.errorCode === undefined ? current.errorCode : args.errorCode,
        attempts: current.attempts + (args.incrementAttempts ? 1 : 0),
        startedAt: args.to === 'rendering' ? now : current.startedAt,
        completedAt: args.to === 'succeeded' || args.to === 'failed' ? now : null,
        updatedAt: now,
      };
      rows[index] = row;
      return row;
    },
  };
  return { repository: createBuyerIntelligenceGenerationRepository(persistence), rows };
}

describe('buyer intelligence generation repository', () => {
  it('claims once and reuses the exact same idempotent request', async () => {
    const { repository, rows } = fixture();
    const first = await repository.claim(request);
    const second = await repository.claim(request);
    expect(first.execute).toBe(true);
    expect(second).toEqual({ generation: first.generation, execute: false });
    expect(rows).toHaveLength(1);
    await expect(repository.load(first.generation.id, request.agencyAccountId, request.agencyClientId)).resolves.toEqual(first.generation);
    await expect(repository.load(first.generation.id, request.agencyAccountId, '55555555-5555-4555-8555-555555555555')).resolves.toBeNull();
  });

  it('rejects an idempotency key reused for different lineage', async () => {
    const { repository } = fixture();
    await repository.claim(request);
    await expect(repository.claim({ ...request, snapshotId: 'snapshot:client:other' }))
      .rejects.toBeInstanceOf(BuyerIntelligenceGenerationConflictError);
  });

  it('runs the queued-rendering-succeeded lifecycle once', async () => {
    const { repository } = fixture();
    const claimed = await repository.claim(request);
    const rendering = await repository.start(claimed.generation);
    const succeeded = await repository.succeed(rendering, 'buyer-intelligence/reports/output.pdf');
    expect(succeeded).toMatchObject({ status: 'succeeded', artifactR2Key: 'buyer-intelligence/reports/output.pdf', attempts: 1 });
    const replay = await repository.claim(request);
    expect(replay).toEqual({ generation: succeeded, execute: false });
  });

  it('requeues a failed generation and increments attempts', async () => {
    const { repository } = fixture();
    const claimed = await repository.claim(request);
    const failed = await repository.fail(claimed.generation, 'render_failed');
    expect(failed.status).toBe('failed');
    const retried = await repository.claim(request);
    expect(retried.execute).toBe(true);
    expect(retried.generation).toMatchObject({ status: 'queued', attempts: 2, errorCode: null });
  });

  it('fails closed on stale state transitions', async () => {
    const { repository } = fixture();
    const claimed = await repository.claim(request);
    await repository.start(claimed.generation);
    await expect(repository.start(claimed.generation)).rejects.toThrow('buyer_intelligence_generation_start_race');
  });
});
