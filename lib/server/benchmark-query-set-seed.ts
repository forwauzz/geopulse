import { z } from 'zod';
import { createBenchmarkRepository } from './benchmark-repository';

const benchmarkQuerySetSeedSchema = z.object({
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
});

export type BenchmarkQuerySetSeed = z.infer<typeof benchmarkQuerySetSeedSchema>;

export async function seedBenchmarkQuerySet(
  supabase: any,
  input: unknown
): Promise<{
  querySetId: string;
  queryCount: number;
}> {
  const fixture = benchmarkQuerySetSeedSchema.parse(input);
  const repo = createBenchmarkRepository(supabase);

  const querySetRow = await repo.upsertQuerySet({
    name: fixture.name,
    version: fixture.version,
    vertical: fixture.vertical,
    description: fixture.description,
    status: fixture.status,
    metadata: fixture.metadata,
  });
  const queryRows = await repo.replaceQueries(querySetRow.id, fixture.queries);

  return {
    querySetId: querySetRow.id,
    queryCount: queryRows.length,
  };
}
