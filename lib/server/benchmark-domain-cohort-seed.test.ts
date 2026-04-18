import { describe, expect, it } from 'vitest';
import { seedBenchmarkDomainCohort } from './benchmark-domain-cohort-seed';

describe('seedBenchmarkDomainCohort', () => {
  it('upserts a domain cohort and merges shared metadata into each domain', async () => {
    const upserts: unknown[] = [];

    const supabase = {
      from(table: string) {
        if (table === 'benchmark_domains') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: null, error: null });
                    },
                  };
                },
              };
            },
            upsert(payload: any) {
              upserts.push(payload);
              return {
                select() {
                  return {
                    single() {
                      return Promise.resolve({
                        data: {
                          id: `domain-${upserts.length}`,
                          domain: payload.domain,
                          canonical_domain: payload.canonical_domain,
                          site_url: payload.site_url,
                          display_name: payload.display_name,
                          vertical: payload.vertical,
                          subvertical: payload.subvertical,
                          geo_region: payload.geo_region,
                          is_customer: payload.is_customer,
                          is_competitor: payload.is_competitor,
                          metadata: payload.metadata,
                          created_at: '2026-04-16T00:00:00.000Z',
                          updated_at: '2026-04-16T00:00:00.000Z',
                        },
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`unexpected table: ${table}`);
      },
    } as any;

    const result = await seedBenchmarkDomainCohort(supabase, {
      name: 'tech-startups-b2b-software-v1',
      vertical: 'tech_startups',
      metadata: {
        seed_source: 'fixture',
        schedule_enabled: false,
      },
      domains: [
        {
          siteUrl: 'https://supabase.com/',
          domain: 'supabase.com',
          displayName: 'Supabase',
          subvertical: 'developer_tools',
          metadata: {
            seed_priority: 1,
          },
        },
      ],
    });

    expect(result).toEqual({
      cohortName: 'tech-startups-b2b-software-v1',
      vertical: 'tech_startups',
      domainCount: 1,
      domains: [
        {
          id: 'domain-1',
          canonicalDomain: 'supabase.com',
        },
      ],
    });

    expect(upserts).toEqual([
      {
        domain: 'supabase.com',
        canonical_domain: 'supabase.com',
        site_url: 'https://supabase.com/',
        display_name: 'Supabase',
        vertical: 'tech_startups',
        subvertical: 'developer_tools',
        geo_region: null,
        is_customer: false,
        is_competitor: false,
        metadata: {
          seed_source: 'fixture',
          schedule_enabled: false,
          seed_priority: 1,
          seed_cohort_name: 'tech-startups-b2b-software-v1',
        },
      },
    ]);
  });
});
