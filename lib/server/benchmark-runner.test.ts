import { describe, expect, it } from 'vitest';
import { runBenchmarkGroupSkeleton } from './benchmark-runner';
import type { BenchmarkExecutionAdapter } from './benchmark-execution';

describe('runBenchmarkGroupSkeleton', () => {
  it('creates a skeleton run group, skipped query runs, and starter metrics', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            if (table === 'benchmark_domains' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
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
                },
              };
            }

            if (table === 'benchmark_query_sets' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
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
            }

            if (table === 'benchmark_queries' && column === 'query_set_id') {
              return {
                order() {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'query-1',
                        query_set_id: String(value),
                        query_key: 'brand-overview',
                        query_text: 'What is Example?',
                        intent_type: 'direct',
                        topic: 'brand',
                        weight: 1,
                        metadata: {},
                        created_at: '2026-03-26T00:00:00.000Z',
                      },
                      {
                        id: 'query-2',
                        query_set_id: String(value),
                        query_key: 'comparison',
                        query_text: 'How does Example compare?',
                        intent_type: 'comparative',
                        topic: 'competition',
                        weight: 1,
                        metadata: {},
                        created_at: '2026-03-26T00:00:00.000Z',
                      },
                    ],
                    error: null,
                  });
                },
              };
            }

            if (table === 'benchmark_run_groups') {
              return {
                select() {
                  return {
                    single() {
                      const payload = calls.find(
                        (call) => call.table === 'benchmark_run_groups' && call.op === 'insert'
                      )?.payload as Record<string, unknown>;

                      return Promise.resolve({
                        data: {
                          id: 'run-group-1',
                          query_set_id: payload.query_set_id,
                          label: payload.label,
                          run_scope: payload.run_scope,
                          model_set_version: payload.model_set_version,
                          status: 'completed',
                          notes: payload.notes ?? null,
                          metadata: payload.metadata ?? {},
                          started_at: payload.started_at ?? null,
                          completed_at: '2026-03-26T00:01:00.000Z',
                          created_at: '2026-03-26T00:00:00.000Z',
                        },
                        error: null,
                      });
                    },
                  };
                },
              };
            }

            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload });
            return {
              select() {
                if (table === 'benchmark_run_groups') {
                  return {
                    single() {
                      const record = payload as Record<string, unknown>;
                      return Promise.resolve({
                        data: {
                          id: 'run-group-1',
                          query_set_id: record.query_set_id,
                          label: record.label,
                          run_scope: record.run_scope,
                          model_set_version: record.model_set_version,
                          status: record.status,
                          notes: record.notes ?? null,
                          metadata: record.metadata ?? {},
                          started_at: record.started_at ?? null,
                          completed_at: null,
                          created_at: '2026-03-26T00:00:00.000Z',
                        },
                        error: null,
                      });
                    },
                  };
                }

                if (table === 'query_runs') {
                  return Promise.resolve({
                    data: (payload as Array<Record<string, unknown>>).map((record, index) => ({
                      id: `query-run-${index + 1}`,
                      run_group_id: record.run_group_id,
                      domain_id: record.domain_id,
                      query_id: record.query_id,
                      model_id: record.model_id,
                      auditor_model_id: record.auditor_model_id ?? null,
                      status: record.status,
                      response_text: null,
                      response_metadata: record.response_metadata ?? {},
                      error_message: record.error_message ?? null,
                      executed_at: null,
                      created_at: '2026-03-26T00:00:00.000Z',
                    })),
                    error: null,
                  });
                }

                if (table === 'query_citations') {
                  return Promise.resolve({
                    data: [],
                    error: null,
                  });
                }

                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          update(payload: unknown) {
            calls.push({ table, op: 'update', payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      single() {
                        return Promise.resolve({
                          data: {
                            id: 'run-group-1',
                            query_set_id: 'query-set-1',
                            label: 'baseline',
                            run_scope: 'internal_benchmark',
                            model_set_version: 'openai/gpt-4.1-mini',
                            status: (payload as Record<string, unknown>).status,
                            notes: (payload as Record<string, unknown>).notes ?? null,
                            metadata: (payload as Record<string, unknown>).metadata ?? {},
                            started_at: '2026-03-26T00:00:00.000Z',
                            completed_at:
                              (payload as Record<string, unknown>).completed_at ?? null,
                            created_at: '2026-03-26T00:00:00.000Z',
                          },
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as any;

    const adapter: BenchmarkExecutionAdapter = {
      async executeQuery(query) {
        return {
          status: 'not_implemented',
          responseText: null,
          responseMetadata: {
            mode: 'stub',
            query_key: query.query_key,
          },
          errorMessage: 'benchmark_execution_adapter_not_implemented',
          executedAt: null,
        };
      },
    };

    const result = await runBenchmarkGroupSkeleton(
      supabase,
      {
      domainId: '11111111-1111-4111-8111-111111111111',
      querySetId: '22222222-2222-4222-8222-222222222222',
      modelId: 'openai/gpt-4.1-mini',
      runLabel: 'baseline',
      },
      adapter
    );

    expect(result).toEqual({
      runGroupId: 'run-group-1',
      queryRunCount: 2,
      skippedQueryCount: 2,
    });
    expect(calls.some((call) => call.table === 'benchmark_run_groups' && call.op === 'insert')).toBe(true);
    expect(calls.some((call) => call.table === 'query_runs' && call.op === 'insert')).toBe(true);
    expect(
      calls.some((call) => call.table === 'benchmark_domain_metrics' && call.op === 'insert')
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.table === 'benchmark_run_groups' &&
          call.op === 'update' &&
          (call.payload as Record<string, unknown>).status === 'completed'
      )
    ).toBe(true);
  });

  it('writes query citations from completed responses and updates metrics', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            if (table === 'benchmark_domains' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
                      domain: 'www.geopulse.ai',
                      canonical_domain: 'geopulse.ai',
                      site_url: 'https://www.geopulse.ai/',
                      display_name: 'GeoPulse',
                      vertical: 'saas',
                      subvertical: null,
                      geo_region: null,
                      is_customer: true,
                      is_competitor: false,
                      metadata: { brand_aliases: ['Geo Pulse'] },
                      created_at: '2026-03-26T00:00:00.000Z',
                      updated_at: '2026-03-26T00:00:00.000Z',
                    },
                    error: null,
                  });
                },
              };
            }

            if (table === 'benchmark_query_sets' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
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
            }

            if (table === 'benchmark_queries' && column === 'query_set_id') {
              return {
                order() {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'query-1',
                        query_set_id: String(value),
                        query_key: 'brand-overview',
                        query_text: 'What is GeoPulse?',
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
            }

            return this;
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload });
            return {
              select() {
                if (table === 'benchmark_run_groups') {
                  const record = payload as Record<string, unknown>;
                  return {
                    single() {
                      return Promise.resolve({
                        data: {
                          id: 'run-group-1',
                          query_set_id: record.query_set_id,
                          label: record.label,
                          run_scope: record.run_scope,
                          model_set_version: record.model_set_version,
                          status: record.status,
                          notes: record.notes ?? null,
                          metadata: record.metadata ?? {},
                          started_at: record.started_at ?? null,
                          completed_at: null,
                          created_at: '2026-03-26T00:00:00.000Z',
                        },
                        error: null,
                      });
                    },
                  };
                }

                if (table === 'query_runs') {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'query-run-1',
                        run_group_id: 'run-group-1',
                        domain_id: '11111111-1111-4111-8111-111111111111',
                        query_id: 'query-1',
                        model_id: 'openai/gpt-4.1-mini',
                        auditor_model_id: null,
                        status: 'completed',
                        response_text: 'See https://www.geopulse.ai/pricing and GeoPulse.',
                        response_metadata: { mode: 'stub' },
                        error_message: null,
                        executed_at: '2026-03-26T00:00:30.000Z',
                        created_at: '2026-03-26T00:00:00.000Z',
                      },
                    ],
                    error: null,
                  });
                }

                if (table === 'query_citations') {
                  return Promise.resolve({
                    data: (payload as Array<Record<string, unknown>>).map((record, index) => ({
                      id: `citation-${index + 1}`,
                      query_run_id: record.query_run_id,
                      cited_domain: record.cited_domain ?? null,
                      cited_url: record.cited_url ?? null,
                      rank_position: record.rank_position ?? null,
                      citation_type: record.citation_type,
                      sentiment: null,
                      confidence: record.confidence ?? null,
                      metadata: record.metadata ?? {},
                      created_at: '2026-03-26T00:00:00.000Z',
                    })),
                    error: null,
                  });
                }

                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          update(payload: unknown) {
            calls.push({ table, op: 'update', payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      single() {
                        return Promise.resolve({
                          data: {
                            id: 'run-group-1',
                            query_set_id: 'query-set-1',
                            label: 'baseline',
                            run_scope: 'internal_benchmark',
                            model_set_version: 'openai/gpt-4.1-mini',
                            status: (payload as Record<string, unknown>).status,
                            notes: (payload as Record<string, unknown>).notes ?? null,
                            metadata: (payload as Record<string, unknown>).metadata ?? {},
                            started_at: '2026-03-26T00:00:00.000Z',
                            completed_at:
                              (payload as Record<string, unknown>).completed_at ?? null,
                            created_at: '2026-03-26T00:00:00.000Z',
                          },
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as any;

    const adapter: BenchmarkExecutionAdapter = {
      async executeQuery() {
        return {
          status: 'completed',
          responseText: 'See https://www.geopulse.ai/pricing and GeoPulse.',
          responseMetadata: { mode: 'stub' },
          errorMessage: null,
          executedAt: '2026-03-26T00:00:30.000Z',
        };
      },
    };

    const result = await runBenchmarkGroupSkeleton(
      supabase,
      {
        domainId: '11111111-1111-4111-8111-111111111111',
        querySetId: '22222222-2222-4222-8222-222222222222',
        modelId: 'openai/gpt-4.1-mini',
        runLabel: 'baseline',
      },
      adapter
    );

    expect(result.skippedQueryCount).toBe(0);
    const queryCitationInsert = calls.find(
      (call) => call.table === 'query_citations' && call.op === 'insert'
    );
    expect(queryCitationInsert).toBeTruthy();
    expect(queryCitationInsert?.payload).toMatchObject([
      {
        query_run_id: 'query-run-1',
        cited_domain: 'geopulse.ai',
        cited_url: 'https://www.geopulse.ai/pricing',
        citation_type: 'explicit_url',
      },
    ]);
    const metricInsert = calls.find(
      (call) => call.table === 'benchmark_domain_metrics' && call.op === 'insert'
    );
    expect(metricInsert?.payload).toMatchObject({
      citation_rate: 1,
      share_of_voice: 1,
      query_coverage: 1,
    });
  });

  it('marks the run group as failed when every query run fails', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            if (table === 'benchmark_domains' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
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
                },
              };
            }

            if (table === 'benchmark_query_sets' && column === 'id') {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: String(value),
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
            }

            if (table === 'benchmark_queries' && column === 'query_set_id') {
              return {
                order() {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'query-1',
                        query_set_id: String(value),
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
            }

            return this;
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload });
            return {
              select() {
                if (table === 'benchmark_run_groups') {
                  const record = payload as Record<string, unknown>;
                  return {
                    single() {
                      return Promise.resolve({
                        data: {
                          id: 'run-group-1',
                          query_set_id: record.query_set_id,
                          label: record.label,
                          run_scope: record.run_scope,
                          model_set_version: record.model_set_version,
                          status: record.status,
                          notes: record.notes ?? null,
                          metadata: record.metadata ?? {},
                          started_at: record.started_at ?? null,
                          completed_at: null,
                          created_at: '2026-03-26T00:00:00.000Z',
                        },
                        error: null,
                      });
                    },
                  };
                }

                if (table === 'query_runs') {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'query-run-1',
                        run_group_id: 'run-group-1',
                        domain_id: '11111111-1111-4111-8111-111111111111',
                        query_id: 'query-1',
                        model_id: 'gemini-2.0-flash',
                        auditor_model_id: null,
                        status: 'failed',
                        response_text: null,
                        response_metadata: { response_body: '{"error":{"message":"Model not found"}}' },
                        error_message: 'benchmark_gemini_http_400',
                        executed_at: '2026-03-26T00:00:30.000Z',
                        created_at: '2026-03-26T00:00:00.000Z',
                      },
                    ],
                    error: null,
                  });
                }

                if (table === 'query_citations') {
                  return Promise.resolve({ data: [], error: null });
                }

                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          update(payload: unknown) {
            calls.push({ table, op: 'update', payload });
            return {
              eq() {
                return {
                  select() {
                    return {
                      single() {
                        return Promise.resolve({
                          data: {
                            id: 'run-group-1',
                            query_set_id: 'query-set-1',
                            label: 'baseline',
                            run_scope: 'internal_benchmark',
                            model_set_version: 'gemini-2.0-flash',
                            status: (payload as Record<string, unknown>).status,
                            notes: (payload as Record<string, unknown>).notes ?? null,
                            metadata: (payload as Record<string, unknown>).metadata ?? {},
                            started_at: '2026-03-26T00:00:00.000Z',
                            completed_at:
                              (payload as Record<string, unknown>).completed_at ?? null,
                            created_at: '2026-03-26T00:00:00.000Z',
                          },
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as any;

    const adapter: BenchmarkExecutionAdapter = {
      async executeQuery() {
        return {
          status: 'failed',
          responseText: null,
          responseMetadata: {
            provider: 'gemini',
            response_body: '{"error":{"message":"Model not found"}}',
          },
          errorMessage: 'benchmark_gemini_http_400',
          executedAt: '2026-03-26T00:00:30.000Z',
        };
      },
    };

    await runBenchmarkGroupSkeleton(
      supabase,
      {
        domainId: '11111111-1111-4111-8111-111111111111',
        querySetId: '22222222-2222-4222-8222-222222222222',
        modelId: 'gemini-2.0-flash',
        runLabel: 'baseline',
      },
      adapter
    );

    expect(
      calls.some(
        (call) =>
          call.table === 'benchmark_run_groups' &&
          call.op === 'update' &&
          (call.payload as Record<string, unknown>).status === 'failed'
      )
    ).toBe(true);
  });
});
