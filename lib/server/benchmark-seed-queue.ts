import { z } from 'zod';

const benchmarkSeedRowSchema = z.object({
  url: z.string().url(),
  domain: z.string().min(1),
  industry: z.string().min(1),
  status: z.string().min(1),
  priority: z.coerce.number().int().positive(),
});

export type BenchmarkSeedRow = z.infer<typeof benchmarkSeedRowSchema>;

export function parseBenchmarkSeedCsv(csvText: string): BenchmarkSeedRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) return [];

  return lines.slice(1).map((line, index) => {
    const [url = '', domain = '', industry = '', status = '', priority = ''] = line.split(',');
    return benchmarkSeedRowSchema.parse(
      {
        url,
        domain,
        industry,
        status,
        priority,
      },
      {
        path: ['benchmark_seed.csv', index + 2],
      }
    );
  });
}

export function filterBenchmarkSeedRows(
  rows: readonly BenchmarkSeedRow[],
  args: {
    readonly industry: string;
    readonly priorities: readonly number[];
    readonly statuses?: readonly string[];
    readonly limit?: number | null;
  }
): BenchmarkSeedRow[] {
  const normalizedIndustry = args.industry.trim().toLowerCase();
  const normalizedStatuses = new Set(
    (args.statuses ?? ['pending']).map((status) => status.trim().toLowerCase())
  );
  const normalizedPriorities = new Set(args.priorities);

  const filtered = rows.filter((row) => {
    if (row.industry.trim().toLowerCase() !== normalizedIndustry) return false;
    if (!normalizedPriorities.has(row.priority)) return false;
    return normalizedStatuses.has(row.status.trim().toLowerCase());
  });

  if (args.limit && args.limit > 0) {
    return filtered.slice(0, args.limit);
  }

  return filtered;
}

export function toBenchmarkSeedDomainInput(row: BenchmarkSeedRow): {
  readonly siteUrl: string;
  readonly domain: string;
  readonly vertical: string;
  readonly isCustomer: boolean;
  readonly isCompetitor: boolean;
  readonly metadata: Record<string, unknown>;
} {
  return {
    siteUrl: row.url,
    domain: row.domain,
    vertical: row.industry,
    isCustomer: false,
    isCompetitor: false,
    metadata: {
      seed_source: 'benchmark_seed.csv',
      seed_status: row.status,
      seed_priority: row.priority,
      schedule_enabled: true,
    },
  };
}
