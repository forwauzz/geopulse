import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), build: vi.fn() }));
vi.mock('./buyer-intelligence-snapshot-repository', () => ({
  createBuyerIntelligenceSnapshotRepository: vi.fn(() => ({ list: mocks.list })),
}));
vi.mock('../intelligence/buyer-intelligence-view-model', async (original) => {
  const actual = await original<typeof import('../intelligence/buyer-intelligence-view-model')>();
  return { ...actual, buildBuyerIntelligenceView: mocks.build };
});

import { loadCanonicalMonitorSummary, renderCanonicalMonitorSummary } from './monitor-buyer-intelligence-summary';

function supabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return query; },
        in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return query; },
        limit: (count: number) => { rows = rows.slice(0, count); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
  } as never;
}

describe('canonical monitor intelligence summary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('renders a bounded monthly brief without raw lineage or unsafe html', () => {
    const html = renderCanonicalMonitorSummary({
      contractVersion: 'buyer-intelligence-view-v1', kind: 'monthly_brief', snapshotId: 'safe', manifest: [],
      identity: { displayName: 'Clinic', canonicalDomain: 'clinic.example', category: 'health', marketLabel: 'Montreal' },
      period: { start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z', previousSnapshotId: null },
      headline: '<Clinic> monthly verification brief', summary: 'One <signal> changed.', observations: [], benchmark: null,
      recommendations: [],
      change: { comparable: true, reasons: [], changes: [{ key: 'visibility', direction: 'improved', before: 1, after: 2 }] },
      unavailableMeasurements: ['chatgpt:unavailable'], provenance: null, limitations: [], cta: null,
    } as never);
    expect(html).toContain('&lt;Clinic&gt;');
    expect(html).toContain('1 improved · 0 regressed · 1 unavailable');
    expect(html).not.toContain('snapshotId');
  });

  it('loads a canonical snapshot only through an active matching account membership', async () => {
    const snapshot = { snapshotId: 'canonical' } as never;
    mocks.list.mockResolvedValue([snapshot]);
    mocks.build.mockReturnValue({
      kind: 'monthly_brief', headline: 'Monthly brief', summary: 'Comparable.',
      change: { changes: [] }, unavailableMeasurements: [],
    });
    const html = await loadCanonicalMonitorSummary({
      supabase: supabase({
        agency_clients: [{ id: 'client-1', agency_account_id: 'account-1', canonical_domain: 'clinic.example', status: 'active' }],
        agency_users: [{ agency_account_id: 'account-1', user_id: 'user-1', status: 'active' }],
      }),
      userId: 'user-1',
      domain: 'https://www.clinic.example/path',
    });
    expect(html).toContain('Monthly brief');
    expect(mocks.list).toHaveBeenCalledWith(
      { type: 'agency_client', id: 'client-1' },
      { eligibility: 'eligible', limit: 1 },
    );
    expect(mocks.build).toHaveBeenCalledWith({ kind: 'monthly_brief', snapshot });
  });

  it('fails closed to the bounded fallback when the user is not an active member', async () => {
    const html = await loadCanonicalMonitorSummary({
      supabase: supabase({
        agency_clients: [{ id: 'client-1', agency_account_id: 'account-1', canonical_domain: 'clinic.example', status: 'active' }],
        agency_users: [],
      }),
      userId: 'other-user',
      domain: 'clinic.example',
    });
    expect(html).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
