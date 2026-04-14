import {
  persistStartupAuditExecutionDbReview,
  persistStartupAuditExecutionRepoReview,
  persistStartupAuditExecutionRiskReview,
  updateStartupAuditExecutionApproval,
  updateStartupAuditExecutionStatus,
  type StartupAuditExecutionRecord,
} from './startup-audit-execution';
import {
  createStartupImplementationPlanFromPlannerOutput,
  type StartupImplementationPlanRecord,
} from './startup-implementation-plan';
import {
  resolveStartupAuditOrchestrationModelPolicies,
  type StartupAuditOrchestrationRole,
  type StartupResolvedModelPolicy,
} from './startup-model-policy';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

type WorkflowPolicyMap = Record<StartupAuditOrchestrationRole, StartupResolvedModelPolicy>;

export type StartupAuditPlanningWorkflowResult = {
  readonly execution: StartupAuditExecutionRecord;
  readonly plan: {
    readonly id: string;
    readonly taskCount: number;
    readonly summary: string;
  };
  readonly modelPolicies: WorkflowPolicyMap;
};

async function getStartupAuditExecution(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
}): Promise<StartupAuditExecutionRecord> {
  const { data, error } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Startup audit execution not found.');

  return {
    id: data.id,
    startupWorkspaceId: data.startup_workspace_id,
    scanId: data.scan_id,
    reportId: data.report_id,
    sourceKind: data.source_kind,
    sourceRef: data.source_ref,
    status: data.status,
    summary: data.summary,
    errorMessage: data.error_message,
    createdByUserId: data.created_by_user_id,
    completedAt: data.completed_at,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
    approval: {
      status:
        data.status === 'plan_ready'
          ? 'ready_for_review'
          : data.status === 'executing' ||
              data.status === 'waiting_manual' ||
              data.status === 'completed'
            ? 'approved_for_execution'
            : 'draft',
      requestedAt: null,
      requestedByUserId: null,
      approvedAt: null,
      approvedByUserId: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
      note: null,
    },
    repoReviewArtifact: null,
    dbReviewArtifact: null,
    riskReviewArtifact: null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function runStartupAuditPlanningWorkflow(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly changedByUserId?: string | null;
  readonly repoReview: unknown;
  readonly dbReview: unknown;
  readonly riskReview: unknown;
  readonly plannerOutput: unknown;
  readonly fallbackProvider: string;
  readonly fallbackModel: string;
  readonly supportedProviders?: readonly string[];
  readonly estimatedCostsUsd?: Partial<Record<StartupAuditOrchestrationRole, number | null>>;
}): Promise<StartupAuditPlanningWorkflowResult> {
  const execution = await getStartupAuditExecution({
    supabase: args.supabase,
    executionId: args.executionId,
  });

  const modelPolicies = await resolveStartupAuditOrchestrationModelPolicies({
    supabase: args.supabase,
    startupWorkspaceId: execution.startupWorkspaceId,
    fallbackProvider: args.fallbackProvider,
    fallbackModel: args.fallbackModel,
    supportedProviders: args.supportedProviders,
    estimatedCostsUsd: args.estimatedCostsUsd,
  });

  await updateStartupAuditExecutionStatus({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    toStatus: 'planning',
    changedByUserId: args.changedByUserId ?? null,
    note: 'Started startup audit planning workflow',
    metadata: {
      planning_workflow_started: true,
      planning_model_policies: modelPolicies,
    },
  });

  const repoReview = await persistStartupAuditExecutionRepoReview({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    changedByUserId: args.changedByUserId ?? null,
    repoReview: args.repoReview,
    metadata: {
      review_model_policy: modelPolicies.repoReview,
    },
  });

  const dbReview = await persistStartupAuditExecutionDbReview({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    changedByUserId: args.changedByUserId ?? null,
    dbReview: args.dbReview,
    metadata: {
      review_model_policy: modelPolicies.dbReview,
    },
  });

  const riskReview = await persistStartupAuditExecutionRiskReview({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    changedByUserId: args.changedByUserId ?? null,
    riskReview: args.riskReview,
    metadata: {
      review_model_policy: modelPolicies.riskReview,
    },
  });

  const plan = await createStartupImplementationPlanFromPlannerOutput({
    supabase: args.supabase,
    startupWorkspaceId: execution.startupWorkspaceId,
    sourceRef: execution.sourceRef ?? `execution://${execution.id}`,
    executionId: execution.id,
    scanId: execution.scanId,
    reportId: execution.reportId,
    createdByUserId: args.changedByUserId ?? execution.createdByUserId ?? null,
    plannerOutput: args.plannerOutput,
    plannerModelPolicy: modelPolicies.planner,
  });

  const plannedExecution = await updateStartupAuditExecutionStatus({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    toStatus: 'plan_ready',
    changedByUserId: args.changedByUserId ?? null,
    note: 'Startup audit planning workflow completed',
    summary: plan.plannerOutput.summary,
    metadata: {
      plan_id: plan.planId,
      plan_task_count: plan.taskCount,
      planning_model_policies: modelPolicies,
      planner_summary: plan.plannerOutput.summary,
      repo_review_summary: repoReview.repoReview.summary,
      db_review_summary: dbReview.dbReview.summary,
      risk_review_summary: riskReview.riskReview.summary,
    },
  });

  const reviewReadyExecution = await updateStartupAuditExecutionApproval({
    supabase: args.supabase,
    executionId: execution.id,
    expectedWorkspaceId: execution.startupWorkspaceId,
    toStatus: 'ready_for_review',
    changedByUserId: args.changedByUserId ?? null,
    note: 'Startup audit plan is ready for founder/admin review',
    metadata: {
      plan_id: plan.planId,
    },
  });

  structuredLog(
    'startup_audit_planning_workflow_completed',
    {
      startup_workspace_id: execution.startupWorkspaceId,
      execution_id: execution.id,
      plan_id: plan.planId,
      plan_task_count: plan.taskCount,
      changed_by_user_id: args.changedByUserId ?? null,
      planner_model: modelPolicies.planner.effectiveModel,
      repo_review_model: modelPolicies.repoReview.effectiveModel,
      db_review_model: modelPolicies.dbReview.effectiveModel,
      risk_review_model: modelPolicies.riskReview.effectiveModel,
    },
    'info'
  );

  return {
    execution: reviewReadyExecution,
    plan: {
      id: plan.planId,
      taskCount: plan.taskCount,
      summary: plan.plannerOutput.summary,
    },
    modelPolicies,
  };
}
