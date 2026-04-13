import { z } from 'zod';

export const STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION = 'startup_audit_db_review_v1' as const;

const dbRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const startupOrchestratorDbReviewOutputSchema = z.object({
  contractVersion: z.literal(STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION).default(
    STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION
  ),
  summary: z.string().trim().min(1).max(2000),
  migrationRequired: z.boolean(),
  backfillRequired: z.boolean(),
  affectedTables: z.array(z.string().trim().min(1).max(200)).max(25).default([]),
  schemaChanges: z.array(z.string().trim().min(1).max(400)).max(25).default([]),
  manualActions: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
  risks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        level: dbRiskLevelSchema,
        detail: z.string().trim().min(1).max(400),
      })
    )
    .max(20)
    .default([]),
});

export type StartupOrchestratorDbReviewOutput = z.infer<typeof startupOrchestratorDbReviewOutputSchema>;

export function parseStartupOrchestratorDbReviewOutput(input: unknown): StartupOrchestratorDbReviewOutput {
  return startupOrchestratorDbReviewOutputSchema.parse(input);
}
