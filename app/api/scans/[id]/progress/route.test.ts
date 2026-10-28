import { beforeEach, describe, expect, it, vi } from 'vitest';

type FailureTarget =
  | 'scan_runs'
  | 'scan_pages_count'
  | 'scan_pages_latest'
  | 'reports';

const mocks = vi.hoisted(() => ({
  failure: null as { target: FailureTarget; mode: 'returned' | 'thrown' } | null,
}));

vi.mock('@/lib/server/cf-env', () => ({
  getScanApiEnv: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from(table: string) {
      let isCountQuery = false;
      const chain: Record<string, any> = {
        select(_columns: string, options?: { head?: boolean }) {
          isCountQuery = options?.head === true;
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        async maybeSingle() {
          const target: FailureTarget =
            table === 'scan_pages'
              ? 'scan_pages_latest'
              : table === 'scan_runs'
                ? 'scan_runs'
                : 'reports';
          const failure = mocks.failure?.target === target ? mocks.failure : null;
          if (failure?.mode === 'thrown') {
            throw new Error('sensitive provider detail');
          }
          if (failure?.mode === 'returned') {
            return {
              data: null,
              error: { code: 'PGRST000', message: 'sensitive provider detail' },
            };
          }
          if (table === 'scan_runs') {
            return { data: { id: 'run-1', config: { page_limit: 10 } }, error: null };
          }
          if (table === 'scan_pages') {
            return { data: { url: 'https://example.com/about' }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const failure =
            table === 'scan_pages' && isCountQuery && mocks.failure?.target === 'scan_pages_count'
              ? mocks.failure
              : null;
          if (failure?.mode === 'thrown') {
            return Promise.reject(new Error('sensitive provider detail')).then(resolve, reject);
          }
          return Promise.resolve(
            failure?.mode === 'returned'
              ? { count: null, error: { code: 'PGRST000', message: 'sensitive provider detail' } }
              : { count: 4, error: null },
          ).then(resolve, reject);
        },
      };
      return chain;
    },
  })),
}));

import { GET } from './route';

async function requestProgress(): Promise<Response> {
  return GET(
    new Request(
      'https://getgeopulse.com/api/scans/00000000-0000-4000-8000-000000000001/progress',
    ),
    { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
  );
}

async function expectSanitizedOutage(response: Response): Promise<void> {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('retry-after')).toBe('300');
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: 'service_unavailable',
      message: 'Audit progress is temporarily unavailable. Please try again shortly.',
    },
  });
  expect(JSON.stringify(body)).not.toContain('sensitive provider detail');
}

describe('scan progress outage contract', () => {
  beforeEach(() => {
    mocks.failure = null;
  });

  it.each([
    ['scan_runs', 'returned'],
    ['scan_runs', 'thrown'],
    ['scan_pages_count', 'returned'],
    ['scan_pages_count', 'thrown'],
    ['scan_pages_latest', 'returned'],
    ['scan_pages_latest', 'thrown'],
    ['reports', 'returned'],
    ['reports', 'thrown'],
  ] as const)('returns a sanitized retryable outage for %s %s failures', async (target, mode) => {
    mocks.failure = { target, mode };
    await expectSanitizedOutage(await requestProgress());
  });

  it('preserves healthy progress facts', async () => {
    const response = await requestProgress();
    const body = (await response.json()) as {
      phase: string;
      pagesDone: number;
      pageLimit: number;
      detail: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.phase).toBe('crawling');
    expect(body.pagesDone).toBe(4);
    expect(body.pageLimit).toBe(10);
    expect(body.detail).toContain('https://example.com/about');
  });
});
