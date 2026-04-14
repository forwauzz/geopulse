import { z } from 'zod';

const startupImplementationTeamLaneSchema = z.enum([
  'founder',
  'dev',
  'content',
  'ops',
  'cross_functional',
]);

export const STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION = 'startup_audit_repo_review_v1' as const;

export const startupOrchestratorRepoReviewOutputSchema = z.object({
  contractVersion: z.literal(STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION).default(
    STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION
  ),
  summary: z.string().trim().min(1).max(2000),
  touchedAreas: z.array(z.string().trim().min(1).max(240)).min(1).max(25),
  likelyFiles: z.array(z.string().trim().min(1).max(400)).min(1).max(40),
  existingSystems: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  implementationSurface: z.array(z.string().trim().min(1).max(400)).min(1).max(25),
  recommendedLanes: z.array(startupImplementationTeamLaneSchema).min(1).max(5),
  risks: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
});

export type StartupOrchestratorRepoReviewOutput = z.infer<typeof startupOrchestratorRepoReviewOutputSchema>;

export function parseStartupOrchestratorRepoReviewOutput(
  input: unknown
): StartupOrchestratorRepoReviewOutput {
  return startupOrchestratorRepoReviewOutputSchema.parse(input);
}
