import { z } from 'zod';
import { createBenchmarkRepository } from './benchmark-repository';

const benchmarkDomainSeedEntrySchema = z.object({
  siteUrl: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  displayName: z.string().optional(),
  vertical: z.string().optional(),
  subvertical: z.string().optional(),
  geoRegion: z.string().optional(),
  isCustomer: z.boolean().optional(),
  isCompetitor: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const benchmarkDomainCohortSeedSchema = z.object({
  name: z.string().min(1),
  vertical: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  domains: z.array(benchmarkDomainSeedEntrySchema).min(1),
});

export type BenchmarkDomainCohortSeed = z.infer<typeof benchmarkDomainCohortSeedSchema>;

export async function seedBenchmarkDomainCohort(
  supabase: any,
  input: unknown
): Promise<{
  cohortName: string;
  vertical: string;
  domainCount: number;
  domains: { id: string; canonicalDomain: string }[];
}> {
  const fixture = benchmarkDomainCohortSeedSchema.parse(input);
  const repo = createBenchmarkRepository(supabase);

  const rows = [];
  for (const domain of fixture.domains) {
    const row = await repo.upsertDomain({
      ...domain,
      vertical: domain.vertical ?? fixture.vertical,
      metadata: {
        ...(fixture.metadata ?? {}),
        ...(domain.metadata ?? {}),
        seed_cohort_name: fixture.name,
      },
    });
    rows.push({
      id: row.id,
      canonicalDomain: row.canonical_domain,
    });
  }

  return {
    cohortName: fixture.name,
    vertical: fixture.vertical,
    domainCount: rows.length,
    domains: rows,
  };
}
