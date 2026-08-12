import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buyerIntelligenceFixtureAssembly } from '../intelligence/testing/buyer-intelligence-fixtures';

const list = vi.fn();
const store = vi.fn();
vi.mock('./buyer-intelligence-snapshot-repository', () => ({
  createBuyerIntelligenceSnapshotRepository: () => ({ list, store }),
}));
vi.mock('./organization-measurement-context', () => ({
  loadConfirmedOrganizationContextByHost: vi.fn(async () => buyerIntelligenceFixtureAssembly().context),
}));

import { ensureAgencyClientBuyerIntelligenceSnapshot } from './buyer-intelligence-snapshot-assembly';

function scanQuery(scan: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ data: scan, error: null });
  return chain;
}

describe('buyer intelligence snapshot assembly', () => {
  beforeEach(() => { list.mockReset(); store.mockReset(); });

  it('projects real scan evidence and stores an eligible snapshot with a fix', async () => {
    list.mockResolvedValue([]);
    store.mockImplementation(async (snapshot) => ({ snapshot, created: true }));
    const scan = {
      id: 'scan-alie-1', created_at: '2026-08-12T14:00:00.000Z', score: 42,
      issues_json: [],
      full_results_json: { checkCatalogVersion: 'checks-v24', issues: [
        { checkId: 'title-tag', check: 'Title tag', status: 'FAIL', finding: 'Missing.', fix: 'Add a concise title.', confidence: 'high' },
        { checkId: 'json-ld', check: 'JSON-LD', status: 'PASS', finding: 'Present.', confidence: 'high' },
      ] },
    };
    const result = await ensureAgencyClientBuyerIntelligenceSnapshot({
      supabase: { from: () => scanQuery(scan) } as never,
      agencyAccountId: '11111111-1111-4111-8111-111111111111',
      agencyClientId: '22222222-2222-4222-8222-222222222222',
      canonicalDomain: 'northstar.example',
    });
    expect(result.created).toBe(true);
    expect(result.snapshot.reportEligibility.state).toBe('eligible');
    expect(result.snapshot.provenance.runIds).toEqual(['scan-alie-1']);
    expect(result.snapshot.recommendations[0]?.action).toBe('Add a concise title.');
    expect(store).toHaveBeenCalledOnce();
  });

  it('reuses the snapshot already attached to the latest scan', async () => {
    const existing = { provenance: { runIds: ['scan-alie-1'] } };
    list.mockResolvedValue([existing]);
    const result = await ensureAgencyClientBuyerIntelligenceSnapshot({
      supabase: { from: () => scanQuery({
        id: 'scan-alie-1', created_at: '2026-08-12T14:00:00.000Z', score: 42,
        issues_json: [{ checkId: 'title-tag', status: 'FAIL' }], full_results_json: {},
      }) } as never,
      agencyAccountId: '11111111-1111-4111-8111-111111111111',
      agencyClientId: '22222222-2222-4222-8222-222222222222',
      canonicalDomain: 'northstar.example',
    });
    expect(result).toEqual({ snapshot: existing, created: false });
    expect(store).not.toHaveBeenCalled();
  });
});
