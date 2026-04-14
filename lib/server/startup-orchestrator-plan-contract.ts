import { z } from 'zod';

const startupImplementationTeamLaneSchema = z.enum([
  'founder',
  'dev',
  'content',
  'ops',
  'cross_functional',
]);

const startupImplementationTaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const startupImplementationTaskKindSchema = z.enum([
  'implementation',
  'review',
  'manual_action',
  'approval',
  'verification',
]);

const startupImplementationTaskExecutionModeSchema = z.enum(['auto', 'manual', 'approval_required']);

const startupImplementationTaskAgentRoleSchema = z.enum([
  'orchestrator',
  'repo_review',
  'db_review',
  'risk_review',
  'execution_worker',
  'manual_operator',
  'founder_approval',
  'qa_verification',
]);

const plannerRiskSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION = 'startup_audit_planner_v1' as const;

export const startupPlannerRiskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  severity: plannerRiskSeveritySchema,
  detail: z.string().trim().min(1).max(2000),
});

export const startupPlannerManualActionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(2000),
  teamLane: startupImplementationTeamLaneSchema,
  evidenceRequired: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  artifactRefs: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
});

export const startupPlannerTaskSchema = z.object({
  teamLane: startupImplementationTeamLaneSchema,
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(2000).nullable().default(null),
  priority: startupImplementationTaskPrioritySchema.default('medium'),
  confidence: z.number().min(0).max(1).nullable().default(null),
  evidence: z.record(z.string(), z.unknown()).default({}),
  taskKind: startupImplementationTaskKindSchema.default('implementation'),
  executionMode: startupImplementationTaskExecutionModeSchema.default('approval_required'),
  dependsOnTaskIds: z.array(z.string().uuid()).max(20).default([]),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  evidenceRequired: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  artifactRefs: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  blockedReason: z.string().trim().max(500).nullable().default(null),
  agentRole: startupImplementationTaskAgentRoleSchema.nullable().default(null),
  manualInstructions: z.string().trim().max(2000).nullable().default(null),
});

export const startupOrchestratorPlannerOutputSchema = z.object({
  contractVersion: z.literal(STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION).default(
    STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION
  ),
  summary: z.string().trim().min(1).max(2000),
  touchedAreas: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  risks: z.array(startupPlannerRiskSchema).max(20).default([]),
  manualActions: z.array(startupPlannerManualActionSchema).max(20).default([]),
  tasks: z.array(startupPlannerTaskSchema).min(1).max(100),
});

export type StartupPlannerRisk = z.infer<typeof startupPlannerRiskSchema>;
export type StartupPlannerManualAction = z.infer<typeof startupPlannerManualActionSchema>;
export type StartupPlannerTaskInput = z.infer<typeof startupPlannerTaskSchema>;
export type StartupOrchestratorPlannerOutput = z.infer<typeof startupOrchestratorPlannerOutputSchema>;

export function parseStartupOrchestratorPlannerOutput(input: unknown): StartupOrchestratorPlannerOutput {
  return startupOrchestratorPlannerOutputSchema.parse(input);
}
