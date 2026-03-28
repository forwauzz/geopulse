import { describe, expect, it } from 'vitest';
import { createBenchmarkRepository } from './benchmark-repository';

function createSelectBuilder(response: { data: unknown; error: unknown }) {
  return {
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(response);
    },
  };
}

function createUpsertBuilder(response: { data: unknown; error: unknown }) {
  return {
    select() {
      return this;
    },
    single() {
      return Promise.resolve(response);
    },
  };
}

describe('createBenchmarkRepository', () => {
  it('derives benchmark identity through the repository seam', () => {
    const repo = createBenchmarkRepository({} as any);
    const identity = repo.deriveDomainIdentity('https://www.example.com/path');

    expect(identity.domain).toBe('www.example.com');
    expect(identity.canonicalDomain).toBe('example.com');
  });

  it('upserts a normalized benchmark domain payload', async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    let onConflictValue: string | null = null;

    const supabase = {
      from(table: string) {
        expect(table).toBe('benchmark_domains');
        return {
          select() {
            return createSelectBuilder({ data: null, error: null });
          },
          upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
            upsertPayload = payload;
            onConflictValue = options.onConflict;
            return createUpsertBuilder({
              data: {
                id: 'domain-1',
                canonical_domain: 'example.com',
                domain: 'www.example.com',
                site_url: 'https://www.example.com/path',
                display_name: 'Example',
                vertical: 'saas',
                subvertical: null,
                geo_region: null,
                is_customer: true,
                is_competitor: false,
                metadata: { source: 'manual' },
                created_at: '2026-03-26T00:00:00.000Z',
                updated_at: '2026-03-26T00:00:00.000Z',
              },
              error: null,
            });
          },
        };
      },
    } as any;

    const repo = createBenchmarkRepository(supabase);
    const row = await repo.upsertDomain({
      siteUrl: 'https://www.example.com/path',
      displayName: 'Example',
      vertical: 'saas',
      isCustomer: true,
      metadata: { source: 'manual' },
    });

    expect(onConflictValue).toBe('canonical_domain');
    expect(upsertPayload).toMatchObject({
      domain: 'www.example.com',
      canonical_domain: 'example.com',
      site_url: 'https://www.example.com/path',
      display_name: 'Example',
      vertical: 'saas',
      is_customer: true,
      is_competitor: false,
      metadata: { source: 'manual' },
    });
    expect(row.canonical_domain).toBe('example.com');
  });

  it('gets an active query set by name and version', async () => {
    const eqCalls: Array<[string, unknown]> = [];

    const supabase = {
      from(table: string) {
        expect(table).toBe('benchmark_query_sets');
        return {
          select() {
            return {
              eq(column: string, value: unknown) {
                eqCalls.push([column, value]);
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: 'qs-1',
                    name: 'brand-baseline',
                    vertical: 'saas',
                    version: 'v1',
                    description: null,
                    status: 'active',
                    metadata: {},
                    created_at: '2026-03-26T00:00:00.000Z',
                  },
                  error: null,
                });
              },
            };
          },
        };
      },
    } as any;

    const repo = createBenchmarkRepository(supabase);
    const querySet = await repo.getActiveQuerySet('brand-baseline', 'v1');

    expect(eqCalls).toEqual([
      ['name', 'brand-baseline'],
      ['version', 'v1'],
      ['status', 'active'],
    ]);
    expect(querySet?.id).toBe('qs-1');
  });
});
