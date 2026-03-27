import { z } from 'zod';
import { createBenchmarkRepository } from './benchmark-repository';

export const benchmarkSeedFixtureSchema = z.object({
  domain: z.object({
    siteUrl: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    displayName: z.string().optional(),
    vertical: z.string().optional(),
    subvertical: z.string().optional(),
    geoRegion: z.string().optional(),
    isCustomer: z.boolean().optional(),
    isCompetitor: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  querySet: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    vertical: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['draft', 'active', 'archived']).default('active'),
    metadata: z.record(z.string(), z.unknown()).optional(),
    queries: z
      .array(
        z.object({
          queryKey: z.string().min(1),
          queryText: z.string().min(1),
          intentType: z.enum(['direct', 'comparative', 'discovery']),
          topic: z.string().optional(),
          weight: z.number().positive().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .min(1),
  }),
});

export type BenchmarkSeedFixture = z.infer<typeof benchmarkSeedFixtureSchema>;

export async function seedBenchmarkFixture(
  supabase: any,
  input: unknown
): Promise<{
  domainId: string;
  querySetId: string;
  queryCount: number;
}> {
  const fixture = benchmarkSeedFixtureSchema.parse(input);
  const repo = createBenchmarkRepository(supabase);

  const domainRow = await repo.upsertDomain(fixture.domain);
  const querySetRow = await repo.upsertQuerySet({
    name: fixture.querySet.name,
    version: fixture.querySet.version,
    vertical: fixture.querySet.vertical,
    description: fixture.querySet.description,
    status: fixture.querySet.status,
    metadata: fixture.querySet.metadata,
  });
  const queryRows = await repo.replaceQueries(querySetRow.id, fixture.querySet.queries);

  return {
    domainId: domainRow.id,
    querySetId: querySetRow.id,
    queryCount: queryRows.length,
  };
}
