import { describe, expect, it } from 'vitest';
import { createBenchmarkAdminData } from './benchmark-admin-data';

describe('createBenchmarkAdminData', () => {
  it('hydrates benchmark run groups with domain, query set, and metrics', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'benchmark_run_groups') {
          return {
            select() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'run-1',
                    query_set_id: 'set-1',
                    label: 'baseline',
                    run_scope: 'internal_benchmark',
                    model_set_version: 'openai/gpt-4.1-mini',
                    status: 'completed',
                    notes: null,
                    metadata: {},
                    started_at: '2026-03-26T00:00:00.000Z',
                    completed_at: '2026-03-26T00:01:00.000Z',
                    created_at: '2026-03-26T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
            eq() {
              return this;
            },
          };
        }

        if (table === 'query_runs') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ run_group_id: 'run-1', domain_id: 'domain-1' }],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_domain_metrics') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    run_group_id: 'run-1',
                    domain_id: 'domain-1',
                    model_id: 'openai/gpt-4.1-mini',
                    query_coverage: 1,
                    citation_rate: 0.5,
                    share_of_voice: 0.25,
                    metrics: {
                      measured_domain_citation_rate: 0.5,
                    },
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_query_sets') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ id: 'set-1', name: 'brand-baseline', version: 'v1' }],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_domains') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    id: 'domain-1',
                    domain: 'www.geopulse.ai',
                    canonical_domain: 'geopulse.ai',
                    site_url: 'https://www.geopulse.ai/',
                    display_name: 'GeoPulse',
                  },
                ],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const data = await createBenchmarkAdminData(supabase).getRunGroups();

    expect(data).toHaveLength(1);
    expect(data[0]?.query_set_name).toBe('brand-baseline');
    expect(data[0]?.display_name).toBe('GeoPulse');
    expect(data[0]?.citation_rate).toBe(0.5);
  });

  it('hydrates benchmark run-group detail with query runs and citations', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'benchmark_run_groups') {
          return {
            select() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'run-1',
                    query_set_id: 'set-1',
                    label: 'baseline',
                    run_scope: 'internal_benchmark',
                    model_set_version: 'openai/gpt-4.1-mini',
                    status: 'completed',
                    notes: null,
                    metadata: {},
                    started_at: null,
                    completed_at: null,
                    created_at: '2026-03-26T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
            eq() {
              return this;
            },
          };
        }

        if (table === 'query_runs') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ run_group_id: 'run-1', domain_id: 'domain-1' }],
                error: null,
              });
            },
            eq() {
              return Promise.resolve({
                data: [
                  {
                    id: 'query-run-1',
                    query_id: 'query-1',
                    status: 'completed',
                    response_text: 'See https://geopulse.ai',
                    response_metadata: {},
                    error_message: null,
                    executed_at: '2026-03-26T00:00:30.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_domain_metrics') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    run_group_id: 'run-1',
                    domain_id: 'domain-1',
                    model_id: 'openai/gpt-4.1-mini',
                    query_coverage: 1,
                    citation_rate: 1,
                    share_of_voice: 1,
                    metrics: {
                      measured_domain_citation_rate: 1,
                    },
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_query_sets') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ id: 'set-1', name: 'brand-baseline', version: 'v1' }],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_domains') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    id: 'domain-1',
                    domain: 'www.geopulse.ai',
                    canonical_domain: 'geopulse.ai',
                    site_url: 'https://www.geopulse.ai/',
                    display_name: 'GeoPulse',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_queries') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    id: 'query-1',
                    query_key: 'brand-overview',
                    query_text: 'What is GeoPulse?',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'query_citations') {
          return {
            select() {
              return this;
            },
            in(_column: string, values: string[]) {
              if (values[0] === 'query-run-1') {
                return Promise.resolve({
                  data: [
                    {
                      id: 'citation-1',
                      query_run_id: 'query-run-1',
                      cited_domain: 'geopulse.ai',
                      cited_url: 'https://geopulse.ai/',
                      grounding_evidence_id: 'ge-home',
                      grounding_page_url: 'https://geopulse.ai/',
                      grounding_page_type: 'homepage',
                      rank_position: 1,
                      citation_type: 'explicit_url',
                      confidence: 1,
                      metadata: {},
                      created_at: '2026-03-26T00:00:31.000Z',
                    },
                  ],
                  error: null,
                });
              }

              return Promise.resolve({ data: [], error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const detail = await createBenchmarkAdminData(supabase).getRunGroupDetail('run-1');

    expect(detail?.runGroup.id).toBe('run-1');
    expect(detail?.queryRuns).toHaveLength(1);
    expect(detail?.queryRuns[0]?.query_key).toBe('brand-overview');
    expect(detail?.queryRuns[0]?.citation_count).toBe(1);
    expect(detail?.citations).toHaveLength(1);
    expect(detail?.citations[0]?.grounding_page_type).toBe('homepage');
  });

  it('builds domain history from hydrated run groups', async () => {
    const adminData = createBenchmarkAdminData({
      from() {
        throw new Error('not used directly');
      },
    } as any);

    adminData.getRunGroups = async () => [
      {
        id: 'run-1',
        query_set_id: 'set-1',
        label: 'baseline',
        run_scope: 'internal_benchmark',
        model_set_version: 'openai/gpt-4.1-mini',
        status: 'completed',
        notes: null,
        metadata: {
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0.4,
        },
        started_at: null,
        completed_at: null,
        created_at: '2026-03-26T00:00:00.000Z',
        domain_id: 'domain-1',
        domain: 'www.geopulse.ai',
        canonical_domain: 'geopulse.ai',
        site_url: 'https://www.geopulse.ai/',
        display_name: 'GeoPulse',
        query_set_name: 'brand-baseline',
        query_set_version: 'v1',
        query_coverage: 1,
        citation_rate: 0.5,
        measured_domain_citation_rate: 0.5,
        share_of_voice: 0.25,
      },
    ];

    const history = await adminData.getDomainHistory('domain-1');
    expect(history).toEqual([
      {
        runGroupId: 'run-1',
        label: 'baseline',
        modelId: 'openai/gpt-4.1-mini',
        querySetId: 'set-1',
        querySetName: 'brand-baseline',
        querySetVersion: 'v1',
        runMode: 'grounded_site',
        status: 'completed',
        createdAt: '2026-03-26T00:00:00.000Z',
        queryCoverage: 1,
        citationRate: 0.5,
        measuredDomainCitationRate: 0.5,
        shareOfVoice: 0.25,
        exactPageQualityRate: 0.4,
      },
    ]);
  });

  it('returns benchmark domain options from benchmark_domains', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('benchmark_domains');
        return {
          select() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                { id: 'domain-1', display_name: 'GeoPulse', canonical_domain: 'geopulse.ai' },
                { id: 'domain-2', display_name: null, canonical_domain: 'example.com' },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const options = await createBenchmarkAdminData(supabase).getDomainOptions();
    expect(options).toEqual([
      { id: 'domain-1', label: 'GeoPulse' },
      { id: 'domain-2', label: 'example.com' },
    ]);
  });

  it('returns benchmark query set options from benchmark_query_sets', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('benchmark_query_sets');
        return {
          select() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                { id: 'set-1', name: 'brand-baseline', version: 'v1', status: 'active' },
                { id: 'set-2', name: 'discovery', version: 'v2', status: 'draft' },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const options = await createBenchmarkAdminData(supabase).getQuerySetOptions();
    expect(options).toEqual([
      { id: 'set-1', label: 'brand-baseline · v1' },
      { id: 'set-2', label: 'discovery · v2 · draft' },
    ]);
  });

  it('builds narrow active cohort snapshots for one domain', async () => {
    const adminData = createBenchmarkAdminData({
      from(table: string) {
        if (table === 'benchmark_cohort_members') {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({
                data: [
                  {
                    cohort_id: 'cohort-1',
                    domain_id: 'domain-1',
                    role: 'measured_customer',
                  },
                ],
                error: null,
              });
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    cohort_id: 'cohort-1',
                    domain_id: 'domain-1',
                    role: 'measured_customer',
                  },
                  {
                    cohort_id: 'cohort-1',
                    domain_id: 'domain-2',
                    role: 'competitor',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_cohorts') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            eq() {
              return Promise.resolve({
                data: [
                  {
                    id: 'cohort-1',
                    name: 'Healthcare visibility frame',
                    query_set_id: 'set-1',
                    model_id: 'gemini-2.5-flash-lite',
                    run_mode: 'grounded_site',
                    benchmark_window_label: '2026-W13',
                    description: 'Internal healthcare comparison',
                    status: 'active',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_domains') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [
                  {
                    id: 'domain-1',
                    display_name: 'GeoPulse',
                    canonical_domain: 'geopulse.ai',
                  },
                  {
                    id: 'domain-2',
                    display_name: 'Competitor Co',
                    canonical_domain: 'competitor.example',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'benchmark_query_sets') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ id: 'set-1', name: 'brand-baseline', version: 'v1' }],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any);

    adminData.getRunGroups = async () => [
      {
        id: 'run-1',
        query_set_id: 'set-1',
        label: 'customer-run',
        run_scope: 'internal_benchmark',
        model_set_version: 'gemini-2.5-flash-lite',
        status: 'completed',
        notes: null,
        metadata: {
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0.5,
        },
        started_at: null,
        completed_at: null,
        created_at: '2026-03-28T10:00:00.000Z',
        domain_id: 'domain-1',
        domain: 'geopulse.ai',
        canonical_domain: 'geopulse.ai',
        site_url: 'https://geopulse.ai/',
        display_name: 'GeoPulse',
        query_set_name: 'brand-baseline',
        query_set_version: 'v1',
        query_coverage: 0.8,
        citation_rate: 0.5,
        measured_domain_citation_rate: 0.4,
        share_of_voice: 0.4,
      },
      {
        id: 'run-2',
        query_set_id: 'set-1',
        label: 'competitor-run',
        run_scope: 'internal_benchmark',
        model_set_version: 'gemini-2.5-flash-lite',
        status: 'completed',
        notes: null,
        metadata: {
          run_mode: 'grounded_site',
          exact_page_quality_rate: 0.2,
        },
        started_at: null,
        completed_at: null,
        created_at: '2026-03-28T09:00:00.000Z',
        domain_id: 'domain-2',
        domain: 'competitor.example',
        canonical_domain: 'competitor.example',
        site_url: 'https://competitor.example/',
        display_name: 'Competitor Co',
        query_set_name: 'brand-baseline',
        query_set_version: 'v1',
        query_coverage: 0.6,
        citation_rate: 0.3,
        measured_domain_citation_rate: 0.2,
        share_of_voice: 0.2,
      },
    ];

    const cohorts = await adminData.getCohortsForDomain('domain-1');

    expect(cohorts).toEqual([
      {
        cohortId: 'cohort-1',
        cohortName: 'Healthcare visibility frame',
        querySetId: 'set-1',
        querySetName: 'brand-baseline',
        querySetVersion: 'v1',
        modelId: 'gemini-2.5-flash-lite',
        runMode: 'grounded_site',
        benchmarkWindowLabel: '2026-W13',
        description: 'Internal healthcare comparison',
        members: [
          {
            domainId: 'domain-1',
            displayName: 'GeoPulse',
            canonicalDomain: 'geopulse.ai',
            role: 'measured_customer',
            latestRunGroupId: 'run-1',
            latestRunCreatedAt: '2026-03-28T10:00:00.000Z',
            queryCoverage: 0.8,
            citationRate: 0.5,
            measuredDomainCitationRate: 0.4,
            shareOfVoice: 0.4,
            exactPageQualityRate: 0.5,
            status: 'completed',
          },
          {
            domainId: 'domain-2',
            displayName: 'Competitor Co',
            canonicalDomain: 'competitor.example',
            role: 'competitor',
            latestRunGroupId: 'run-2',
            latestRunCreatedAt: '2026-03-28T09:00:00.000Z',
            queryCoverage: 0.6,
            citationRate: 0.3,
            measuredDomainCitationRate: 0.2,
            shareOfVoice: 0.2,
            exactPageQualityRate: 0.2,
            status: 'completed',
          },
        ],
      },
    ]);
  });
});
