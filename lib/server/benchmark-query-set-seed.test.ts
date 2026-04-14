import { describe, expect, it } from 'vitest';
import { seedBenchmarkQuerySet } from './benchmark-query-set-seed';

describe('seedBenchmarkQuerySet', () => {
  it('upserts one query set and replaces its queries', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown; options?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          upsert(payload: unknown, options: unknown) {
            calls.push({ table, op: 'upsert', payload, options });
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: {
                        id: 'query-set-1',
                        name: 'law-firms-p1-core',
                        vertical: 'law_firms',
                        version: 'v1',
                        description: 'starter set',
                        status: 'active',
                        metadata: {},
                        created_at: '2026-03-29T00:00:00.000Z',
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
                      query_key: 'best-law-firm-for-injury',
                      query_text: 'Which law firms are best for personal injury cases?',
                      intent_type: 'discovery',
                      topic: 'personal_injury',
                      weight: 1.25,
                      metadata: {},
                      created_at: '2026-03-29T00:00:00.000Z',
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

    const result = await seedBenchmarkQuerySet(supabase, {
      name: 'law-firms-p1-core',
      version: 'v1',
      vertical: 'law_firms',
      description: 'starter set',
      status: 'active',
      queries: [
        {
          queryKey: 'best-law-firm-for-injury',
          queryText: 'Which law firms are best for personal injury cases?',
          intentType: 'discovery',
          topic: 'personal_injury',
          weight: 1.25,
        },
      ],
    });

    expect(result).toEqual({
      querySetId: 'query-set-1',
      queryCount: 1,
    });
    expect(calls.some((call) => call.table === 'benchmark_query_sets' && call.op === 'upsert')).toBe(
      true
    );
    expect(calls.some((call) => call.table === 'benchmark_queries' && call.op === 'insert')).toBe(
      true
    );
  });
});
