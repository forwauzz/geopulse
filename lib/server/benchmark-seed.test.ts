import { describe, expect, it } from 'vitest';
import { seedBenchmarkFixture } from './benchmark-seed';

describe('seedBenchmarkFixture', () => {
  it('seeds one domain and one query set with queries', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown; options?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          select() {
            if (table === 'benchmark_domains') {
              return {
                eq() {
                  return this;
                },
                maybeSingle() {
                  calls.push({ table, op: 'select' });
                  return Promise.resolve({ data: null, error: null });
                },
              };
            }
            return this;
          },
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, op: 'upsert', payload, options });
            return {
              select() {
                return {
                  single() {
                    if (table === 'benchmark_domains') {
                      return Promise.resolve({
                        data: {
                          id: 'domain-1',
                          domain: 'www.example.com',
                          canonical_domain: 'example.com',
                          site_url: 'https://www.example.com/',
                          display_name: 'Example',
                          vertical: 'saas',
                          subvertical: null,
                          geo_region: null,
                          is_customer: true,
                          is_competitor: false,
                          metadata: {},
                          created_at: '2026-03-26T00:00:00.000Z',
                          updated_at: '2026-03-26T00:00:00.000Z',
                        },
                        error: null,
                      });
                    }

                    return Promise.resolve({
                      data: {
                        id: 'query-set-1',
                        name: 'brand-baseline',
                        vertical: 'saas',
                        version: 'v1',
                        description: 'starter set',
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
          delete() {
            calls.push({ table, op: 'delete' });
            return {
              eq(column: string, value: unknown) {
                calls.push({ table, op: 'delete.eq', payload: { column, value } });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload });
            return {
              select() {
                return Promise.resolve({
                  data: [
                    {
                      id: 'query-1',
                      query_set_id: 'query-set-1',
                      query_key: 'brand-overview',
                      query_text: 'What is Example?',
                      intent_type: 'direct',
                      topic: 'brand',
                      weight: 1,
                      metadata: {},
                      created_at: '2026-03-26T00:00:00.000Z',
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      },
    } as any;

    const result = await seedBenchmarkFixture(supabase, {
      domain: {
        siteUrl: 'https://www.example.com/',
        displayName: 'Example',
        vertical: 'saas',
        isCustomer: true,
      },
      querySet: {
        name: 'brand-baseline',
        version: 'v1',
        vertical: 'saas',
        description: 'starter set',
        status: 'active',
        queries: [
          {
            queryKey: 'brand-overview',
            queryText: 'What is Example?',
            intentType: 'direct',
            topic: 'brand',
          },
        ],
      },
    });

    expect(result).toEqual({
      domainId: 'domain-1',
      querySetId: 'query-set-1',
      queryCount: 1,
    });
    expect(calls.some((call) => call.table === 'benchmark_domains' && call.op === 'upsert')).toBe(true);
    expect(calls.some((call) => call.table === 'benchmark_query_sets' && call.op === 'upsert')).toBe(true);
    expect(calls.some((call) => call.table === 'benchmark_queries' && call.op === 'insert')).toBe(true);
  });
});
