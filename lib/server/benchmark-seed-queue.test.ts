import { describe, expect, it } from 'vitest';
import {
  filterBenchmarkSeedRows,
  parseBenchmarkSeedCsv,
  toBenchmarkSeedDomainInput,
} from './benchmark-seed-queue';

describe('benchmark seed queue helpers', () => {
  it('parses the benchmark seed csv rows', () => {
    const rows = parseBenchmarkSeedCsv(
      ['url,domain,industry,status,priority', 'https://example.com,example.com,law_firms,pending,1'].join(
        '\n'
      )
    );

    expect(rows).toEqual([
      {
        url: 'https://example.com',
        domain: 'example.com',
        industry: 'law_firms',
        status: 'pending',
        priority: 1,
      },
    ]);
  });

  it('filters one category and priority slice', () => {
    const rows = [
      {
        url: 'https://example.com',
        domain: 'example.com',
        industry: 'law_firms',
        status: 'pending',
        priority: 1,
      },
      {
        url: 'https://example-2.com',
        domain: 'example-2.com',
        industry: 'law_firms',
        status: 'pending',
        priority: 2,
      },
      {
        url: 'https://example-3.com',
        domain: 'example-3.com',
        industry: 'real_estate',
        status: 'pending',
        priority: 1,
      },
    ] as const;

    expect(
      filterBenchmarkSeedRows(rows, {
        industry: 'law_firms',
        priorities: [1],
      })
    ).toEqual([rows[0]]);
  });

  it('maps seed rows into explicit schedule-enabled benchmark domains', () => {
    expect(
      toBenchmarkSeedDomainInput({
        url: 'https://example.com',
        domain: 'example.com',
        industry: 'law_firms',
        status: 'pending',
        priority: 1,
      })
    ).toEqual({
      siteUrl: 'https://example.com',
      domain: 'example.com',
      vertical: 'law_firms',
      isCustomer: false,
      isCompetitor: false,
      metadata: {
        seed_source: 'benchmark_seed.csv',
        seed_status: 'pending',
        seed_priority: 1,
        schedule_enabled: true,
      },
    });
  });
});
