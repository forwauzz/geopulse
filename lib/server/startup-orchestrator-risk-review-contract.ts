import { z } from 'zod';

export const STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION = 'startup_audit_risk_review_v1' as const;

const riskSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const startupOrchestratorRiskReviewOutputSchema = z.object({
  contractVersion: z.literal(STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION).default(
    STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION
  ),
  summary: z.string().trim().min(1).max(2000),
  releaseRisk: riskSeveritySchema,
  regressionAreas: z.array(z.string().trim().min(1).max(240)).max(25).default([]),
  externalDependencies: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  manualChecks: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
  rolloutNotes: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
  blockers: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
});

export type StartupOrchestratorRiskReviewOutput = z.infer<typeof startupOrchestratorRiskReviewOutputSchema>;

export function parseStartupOrchestratorRiskReviewOutput(
  input: unknown
): StartupOrchestratorRiskReviewOutput {
  return startupOrchestratorRiskReviewOutputSchema.parse(input);
}
