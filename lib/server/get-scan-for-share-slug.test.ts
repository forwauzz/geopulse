import { afterEach, describe, expect, it, vi } from 'vitest';
import { getScanForShareSlug } from '@/lib/server/get-scan-for-public-share';

const createServiceRoleClientMock = vi.fn();

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClientMock(...args),
}));

vi.mock('@/lib/server/structured-log', () => ({
  structuredLog: vi.fn(),
}));

type QueryResponse = { data: unknown; error: { message: string } | null };

/** A thenable-free query builder whose terminal `.maybeSingle()` resolves the given response. */
function queryBuilder(response: QueryResponse) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  return builder;
}

function mockClient(byTable: Record<string, QueryResponse>) {
  createServiceRoleClientMock.mockReturnValue({
    from: vi.fn((table: string) => queryBuilder(byTable[table] ?? { data: null, error: null })),
  });
}

const VALID_SLUG = 'a'.repeat(32);

function recurringScan(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: '11111111-1111-1111-1111-111111111111',
      url: 'https://example.com',
      domain: 'example.com',
      score: 72,
      letter_grade: 'B',
      issues_json: [],
      full_results_json: {},
      created_at: new Date().toISOString(),
      run_source: 'recurring',
      ...overrides,
    },
    error: null,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('getScanForShareSlug', () => {
  it('rejects a malformed slug before touching the database', async () => {
    const res = await getScanForShareSlug('short', 'https://db', 'key');
    expect(res).toEqual({ ok: false, code: 'invalid_id' });
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
  });

  it('returns not_found when no scan matches the slug', async () => {
    mockClient({ scans: { data: null, error: null } });
    const res = await getScanForShareSlug(VALID_SLUG, 'https://db', 'key');
    expect(res).toEqual({ ok: false, code: 'not_found' });
  });

  it('forbids a non-recurring scan even if the slug matches', async () => {
    mockClient({ scans: recurringScan({ run_source: 'self_serve' }) });
    const res = await getScanForShareSlug(VALID_SLUG, 'https://db', 'key');
    expect(res).toEqual({ ok: false, code: 'forbidden' });
  });

  it('expires a recurring scan older than the 90-day window', async () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    mockClient({ scans: recurringScan({ created_at: old }) });
    const res = await getScanForShareSlug(VALID_SLUG, 'https://db', 'key');
    expect(res).toEqual({ ok: false, code: 'expired' });
  });

  it('serves a fresh recurring scan regardless of its owner user_id', async () => {
    mockClient({
      scans: recurringScan({ user_id: '99999999-9999-9999-9999-999999999999' }),
      payments: { data: null, error: null },
      reports: { data: null, error: null },
    });
    const res = await getScanForShareSlug(VALID_SLUG, 'https://db', 'key');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.scanId).toBe('11111111-1111-1111-1111-111111111111');
      expect(res.data.url).toBe('https://example.com');
      expect(res.data.score).toBe(72);
    }
  });
});
