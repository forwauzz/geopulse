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
        runMode: 'ungrounded_inference',
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
          (call.payload as Record<string, unknown>).status === 'completed' &&
          ((call.payload as Record<string, unknown>).metadata as Record<string, unknown>)['run_mode'] ===
            'ungrounded_inference'
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
                      grounding_evidence_id: record.grounding_evidence_id ?? null,
                      grounding_page_url: record.grounding_page_url ?? null,
                      grounding_page_type: record.grounding_page_type ?? null,
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
        runMode: 'ungrounded_inference',
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
        grounding_evidence_id: null,
        grounding_page_url: null,
        grounding_page_type: null,
        citation_type: 'explicit_url',
        metadata: {
          grounding_provenance: {
            status: 'unresolved',
          },
        },
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
        runMode: 'ungrounded_inference',
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

  it('records grounded mode and grounding availability when grounded context exists', async () => {
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
                      metadata: {
                        grounding_context: {
                          evidence: [
                            {
                              page_url: 'https://www.example.com/about',
                              page_type: 'about',
                              evidence_label: 'About page',
                              excerpt: 'Example is a healthcare technology consulting firm.',
                            },
                          ],
                        },
                      },
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
                        status: 'completed',
                        response_text: 'Example is a healthcare technology consulting firm.',
                        response_metadata: { mode: 'custom' },
                        error_message: null,
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
                            label: 'grounded',
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
      async executeQuery(_query, context) {
        expect(context.runMode).toBe('grounded_site');
        expect(context.groundingContext?.evidence).toHaveLength(1);
        return {
          status: 'completed',
          responseText: 'Example is a healthcare technology consulting firm.',
          responseMetadata: { mode: 'custom', run_mode: context.runMode },
          errorMessage: null,
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
        runMode: 'grounded_site',
        runLabel: 'grounded',
      },
      adapter
    );

    const runGroupInsert = calls.find(
      (call) => call.table === 'benchmark_run_groups' && call.op === 'insert'
    );
    expect(runGroupInsert?.payload).toMatchObject({
      metadata: {
        run_mode: 'grounded_site',
        grounding_context_available: true,
        grounding_context_source: 'metadata',
        grounding_context_error: null,
        grounding_evidence_count: 1,
        grounding_evidence: [
          {
            source_label: 'About page',
            page_type: 'about',
            page_url: 'https://www.example.com/about',
            evidence_label: 'About page',
            excerpt: 'Example is a healthcare technology consulting firm.',
          },
        ],
      },
    });

    const metricInsert = calls.find(
      (call) => call.table === 'benchmark_domain_metrics' && call.op === 'insert'
    );
    expect(metricInsert?.payload).toMatchObject({
      metrics: {
        run_mode: 'grounded_site',
        exact_page_quality_rate: 0,
      },
    });

    const runGroupUpdate = calls.find(
      (call) => call.table === 'benchmark_run_groups' && call.op === 'update'
    );
    expect(runGroupUpdate?.payload).toMatchObject({
      metadata: {
        grounding_context_source: 'metadata',
        grounding_evidence_count: 1,
        exact_page_quality_rate: 0,
      },
    });
  });

  it('matches exact grounded evidence URLs when storing citations', async () => {
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
                      metadata: {
                        grounding_context: {
                          evidence: [
                            {
                              page_url: 'https://www.example.com/about',
                              page_type: 'about',
                              evidence_label: 'About page',
                              excerpt: 'Example is a healthcare technology consulting firm.',
                            },
                          ],
                        },
                      },
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
                        status: 'completed',
                        response_text: 'See https://www.example.com/about for company background.',
                        response_metadata: { mode: 'custom' },
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
                      grounding_evidence_id: record.grounding_evidence_id ?? null,
                      grounding_page_url: record.grounding_page_url ?? null,
                      grounding_page_type: record.grounding_page_type ?? null,
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
                            label: 'grounded',
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
          status: 'completed',
          responseText: 'See https://www.example.com/about for company background.',
          responseMetadata: { mode: 'custom' },
          errorMessage: null,
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
        runMode: 'grounded_site',
        runLabel: 'grounded',
      },
      adapter
    );

    expect(
      calls.find((call) => call.table === 'query_citations' && call.op === 'insert')?.payload
    ).toMatchObject([
      {
        query_run_id: 'query-run-1',
        cited_domain: 'example.com',
        cited_url: 'https://www.example.com/about',
        grounding_page_url: 'https://www.example.com/about',
        grounding_page_type: 'about',
        citation_type: 'explicit_url',
        metadata: {
          grounding_provenance: {
            status: 'matched',
            match_method: 'exact_url',
          },
          grounding_claim_match: {
            status: 'weak_overlap',
          },
        },
      },
    ]);
  });

  it('builds grounded evidence from the site when metadata evidence is absent', async () => {
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
                      site_url: 'https://example.com/',
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
                        status: 'completed',
                        response_text: 'Example is a healthcare technology consulting firm.',
                        response_metadata: { mode: 'custom' },
                        error_message: null,
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
                            label: 'grounded',
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

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://example.com/') {
        return new Response(
          `
            <html>
              <head><title>Example</title></head>
              <body>
                <p>${'Example helps healthcare organizations modernize workflows. '.repeat(12)}</p>
                <a href="/about">About</a>
              </body>
            </html>
          `,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (url === 'https://example.com/about') {
        return new Response(
          `
            <html>
              <head><title>About Example</title></head>
              <body><p>${'Example is a healthcare technology consulting firm. '.repeat(12)}</p></body>
            </html>
          `,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    }) as typeof fetch;

    const adapter: BenchmarkExecutionAdapter = {
      async executeQuery(_query, context) {
        expect(context.groundingContext?.evidence.length).toBeGreaterThanOrEqual(1);
        expect(context.groundingContext?.evidence[0]?.pageType).toBe('homepage');
        return {
          status: 'completed',
          responseText: 'Example is a healthcare technology consulting firm.',
          responseMetadata: { mode: 'custom', run_mode: context.runMode },
          errorMessage: null,
          executedAt: '2026-03-26T00:00:30.000Z',
        };
      },
    };

    try {
      await runBenchmarkGroupSkeleton(
        supabase,
        {
          domainId: '11111111-1111-4111-8111-111111111111',
          querySetId: '22222222-2222-4222-8222-222222222222',
          modelId: 'gemini-2.0-flash',
          runMode: 'grounded_site',
          runLabel: 'grounded',
        },
        adapter
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    const runGroupInsert = calls.find(
      (call) => call.table === 'benchmark_run_groups' && call.op === 'insert'
    );
    expect(runGroupInsert?.payload).toMatchObject({
      metadata: {
        grounding_context_available: true,
        grounding_context_source: 'site_builder',
      },
    });

    const groundingEvidence = ((runGroupInsert?.payload as Record<string, unknown>)['metadata'] as Record<
      string,
      unknown
    >)['grounding_evidence'] as Array<Record<string, unknown>>;
    expect(groundingEvidence[0]).toMatchObject({
      page_type: 'homepage',
      page_url: 'https://example.com/',
    });
  });
});
