import { z } from 'zod';
import {
  benchmarkRunModeSchema,
  DEFAULT_BENCHMARK_RUN_MODE,
} from './benchmark-grounding';

export const benchmarkRunnerInputSchema = z.object({
  domainId: z.string().uuid(),
  querySetId: z.string().uuid(),
  modelId: z.string().min(1),
  auditorModelId: z.string().min(1).optional(),
  runMode: benchmarkRunModeSchema.default(DEFAULT_BENCHMARK_RUN_MODE),
  runLabel: z.string().min(1).max(160).optional(),
  notes: z.string().max(2000).optional(),
});

export type BenchmarkRunnerInput = z.infer<typeof benchmarkRunnerInputSchema>;

export function parseBenchmarkRunnerInput(
  input: unknown
): BenchmarkRunnerInput {
  return benchmarkRunnerInputSchema.parse(input);
}
