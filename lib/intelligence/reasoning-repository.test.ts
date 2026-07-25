import { describe, expect, it } from 'vitest';
import { SupabaseReasoningFactReader } from './reasoning-repository';

function query(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'limit', 'eq', 'in', 'contains']) {
    builder[method] = () => builder;
  }
  builder['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe('Supabase reasoning fact reader', () => {
  it('enriches mart rows with evidence linked through canonical runs', async () => {
    const db = {
      from: (table: string) => table === 'intelligence_evidence_objects'
        ? query({ data: [{ stable_evidence_id: 'ev-1', run_id: 'run-1' }], error: null })
        : query({
            data: [{
              canonical_domain_id: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
              citation_rate: 0.5,
              observed_at: '2026-07-25T00:00:00Z',
              source_evidence_ids: [],
              source_run_ids: ['run-1'],
              model_id: 'model-v1',
            }],
            error: null,
          }),
    };
    const facts = await new SupabaseReasoningFactReader(db as never).read({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
      limit: 25,
    }, {
      actorId: 'admin',
      isPlatformAdmin: true,
      tenantType: null,
      tenantId: null,
    });
    expect(facts[0]).toMatchObject({
      evidenceIds: ['ev-1'],
      compatibleRunIds: ['run-1'],
      modelVersion: 'model-v1',
    });
  });

  it('fails closed for tenant callers until a tenant-scoped reader is supplied', async () => {
    const reader = new SupabaseReasoningFactReader({} as never);
    await expect(reader.read({
      capability: 'domain_timeline',
      canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
      limit: 25,
    }, {
      actorId: 'user',
      isPlatformAdmin: false,
      tenantType: 'workspace',
      tenantId: 'tenant-1',
    })).rejects.toMatchObject({ code: 'tenant_scope_violation' });
  });
});
