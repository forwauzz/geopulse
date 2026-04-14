import type { ScanApiEnv } from './cf-env';
import { listStartupAgentPrRuns, queueStartupExecutionPrRun, type StartupAgentPrRun } from './startup-agent-pr-workflow';
import { getStartupAuditExecution, isStartupAuditExecutionApprovedForExecution } from './startup-audit-execution';
import { getLatestStartupImplementationPlan, selectStartupExecutionPrTaskBatch } from './startup-implementation-plan';
import { getStartupGithubIntegrationState } from './startup-github-integration';
import { resolveStartupServiceModelPolicy } from './startup-model-policy';
import { resolveStartupWorkspaceRolloutFlags } from './startup-rollout-flags';
import { resolveStartupDashboardUiGates } from './startup-service-gates';
import { structuredError, structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

const STARTUP_EXECUTION_DISPATCH_SCAN_LIMIT = 20;
const STARTUP_EXECUTION_ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'pr_opened']);

type CandidateExecutionRow = {
  readonly id: string;
  readonly startup_workspace_id: string;
};

type StartupExecutionDispatchDependencies = {
  readonly getExecution?: typeof getStartupAuditExecution;
  readonly resolveRolloutFlags?: typeof resolveStartupWorkspaceRolloutFlags;
  readonly resolveUiGates?: typeof resolveStartupDashboardUiGates;
  readonly getGithubState?: typeof getStartupGithubIntegrationState;
  readonly getLatestPlan?: typeof getLatestStartupImplementationPlan;
  readonly listPrRuns?: typeof listStartupAgentPrRuns;
  readonly resolveModelPolicy?: typeof resolveStartupServiceModelPolicy;
  readonly queueExecutionPrRun?: typeof queueStartupExecutionPrRun;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
};

export type StartupExecutionDispatchStatus = 'disabled' | 'completed';

export type StartupExecutionDispatchSummary = {
  readonly status: StartupExecutionDispatchStatus;
  readonly scanned: number;
  readonly queued: number;
  readonly skippedNotApproved: number;
  readonly skippedMissingActor: number;
  readonly skippedBlocked: number;
  readonly skippedActiveRun: number;
  readonly skippedPlanMismatch: number;
  readonly skippedNoTasks: number;
  readonly skippedRepoSelection: number;
  readonly failed: number;
};

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function isGloballyEnabled(env: Pick<
  ScanApiEnv,
  'STARTUP_DASHBOARD_ENABLED' | 'STARTUP_GITHUB_AGENT_ENABLED' | 'STARTUP_AUTO_PR_ENABLED'
>): boolean {
  return (
    parseBoolean(env.STARTUP_DASHBOARD_ENABLED) &&
    parseBoolean(env.STARTUP_GITHUB_AGENT_ENABLED) &&
    parseBoolean(env.STARTUP_AUTO_PR_ENABLED)
  );
}

function emptySummary(status: StartupExecutionDispatchStatus): StartupExecutionDispatchSummary {
  return {
    status,
    scanned: 0,
    queued: 0,
    skippedNotApproved: 0,
    skippedMissingActor: 0,
    skippedBlocked: 0,
    skippedActiveRun: 0,
    skippedPlanMismatch: 0,
    skippedNoTasks: 0,
    skippedRepoSelection: 0,
    failed: 0,
  };
}

type MutableStartupExecutionDispatchSummary = {
  -readonly [K in keyof StartupExecutionDispatchSummary]: StartupExecutionDispatchSummary[K];
};

function buildExecutionModelPolicyMetadata(policy: Awaited<ReturnType<typeof resolveStartupServiceModelPolicy>>) {
  return {
    source: policy.source,
    bundle_key: policy.bundleKey,
    requested_provider: policy.requestedProvider,
    requested_model: policy.requestedModel,
    effective_provider: policy.effectiveProvider,
    effective_model: policy.effectiveModel,
    max_cost_usd: policy.maxCostUsd,
    budget_exceeded: policy.budgetExceeded,
    fallback_reason: policy.fallbackReason,
  };
}

export async function runScheduledStartupExecutionDispatch(args: {
  readonly supabase: SupabaseLike;
  readonly env: Pick<
    ScanApiEnv,
    | 'STARTUP_DASHBOARD_ENABLED'
    | 'STARTUP_GITHUB_AGENT_ENABLED'
    | 'STARTUP_AUTO_PR_ENABLED'
    | 'BENCHMARK_EXECUTION_PROVIDER'
    | 'BENCHMARK_EXECUTION_MODEL'
    | 'GEMINI_MODEL'
  >;
  readonly deps?: StartupExecutionDispatchDependencies;
}): Promise<StartupExecutionDispatchSummary> {
  if (!isGloballyEnabled(args.env)) {
    return emptySummary('disabled');
  }

  const getExecution = args.deps?.getExecution ?? getStartupAuditExecution;
  const resolveRolloutFlags = args.deps?.resolveRolloutFlags ?? resolveStartupWorkspaceRolloutFlags;
  const resolveUiGates = args.deps?.resolveUiGates ?? resolveStartupDashboardUiGates;
  const getGithubState = args.deps?.getGithubState ?? getStartupGithubIntegrationState;
  const getLatestPlan = args.deps?.getLatestPlan ?? getLatestStartupImplementationPlan;
  const listPrRuns = args.deps?.listPrRuns ?? listStartupAgentPrRuns;
  const resolveModelPolicy = args.deps?.resolveModelPolicy ?? resolveStartupServiceModelPolicy;
  const queueExecutionPrRun = args.deps?.queueExecutionPrRun ?? queueStartupExecutionPrRun;
  const log = args.deps?.structuredLog ?? structuredLog;
  const logError = args.deps?.structuredError ?? structuredError;

  const summary: MutableStartupExecutionDispatchSummary = emptySummary('completed');

  const { data, error } = await args.supabase
    .from('startup_audit_executions')
    .select('id,startup_workspace_id')
    .eq('status', 'plan_ready')
    .order('created_at', { ascending: true })
    .limit(STARTUP_EXECUTION_DISPATCH_SCAN_LIMIT);
  if (error) throw error;

  const candidates = ((data ?? []) as CandidateExecutionRow[]).filter(
    (row) => typeof row?.id === 'string' && typeof row?.startup_workspace_id === 'string'
  );

  for (const candidate of candidates) {
    summary.scanned += 1;

    try {
      const execution = await getExecution({
        supabase: args.supabase,
        executionId: candidate.id,
        expectedWorkspaceId: candidate.startup_workspace_id,
      });

      if (!isStartupAuditExecutionApprovedForExecution(execution)) {
        summary.skippedNotApproved += 1;
        continue;
      }

      const actorUserId = execution.approval.approvedByUserId ?? execution.createdByUserId;
      if (!actorUserId) {
        summary.skippedMissingActor += 1;
        continue;
      }

      const rollout = await resolveRolloutFlags({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
        env: args.env,
      });
      if (!rollout.startupDashboard || !rollout.githubAgent || !rollout.autoPr) {
        summary.skippedBlocked += 1;
        continue;
      }

      const gates = await resolveUiGates({
        memberSupabase: args.supabase,
        serviceSupabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
        userId: actorUserId,
      });
      if (!gates.githubIntegration.enabled || !gates.agentPrExecution.enabled) {
        summary.skippedBlocked += 1;
        continue;
      }

      const activeRuns = await listPrRuns({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
        limit: 50,
      });
      if (
        activeRuns.some(
          (run) =>
            run.executionId === execution.id &&
            STARTUP_EXECUTION_ACTIVE_RUN_STATUSES.has(run.status)
        )
      ) {
        summary.skippedActiveRun += 1;
        continue;
      }

      const latestPlan = await getLatestPlan({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
      });
      if (!latestPlan || latestPlan.executionId !== execution.id) {
        summary.skippedPlanMismatch += 1;
        continue;
      }

      const taskBatch = selectStartupExecutionPrTaskBatch({
        tasks: latestPlan.tasks,
      });
      if (taskBatch.length === 0) {
        summary.skippedNoTasks += 1;
        continue;
      }

      const githubState = await getGithubState({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
      });
      const enabledRepos = githubState.repositories.filter((repo) => repo.enabled);
      if (enabledRepos.length !== 1) {
        summary.skippedRepoSelection += 1;
        log(
          'startup_execution_dispatch_repo_selection_skipped',
          {
            startup_workspace_id: execution.startupWorkspaceId,
            execution_id: execution.id,
            enabled_repo_count: enabledRepos.length,
          },
          'info'
        );
        continue;
      }

      const prPolicy = await resolveModelPolicy({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
        serviceKey: 'startup_audit_execution',
        fallbackProvider: args.env.BENCHMARK_EXECUTION_PROVIDER || 'gemini',
        fallbackModel: args.env.BENCHMARK_EXECUTION_MODEL || args.env.GEMINI_MODEL || 'gemini-2.0-flash',
        supportedProviders: ['gemini', 'openai', 'anthropic', 'custom'],
        estimatedCostUsd: null,
      });

      await queueExecutionPrRun({
        supabase: args.supabase,
        startupWorkspaceId: execution.startupWorkspaceId,
        executionId: execution.id,
        repoFullName: enabledRepos[0]!.fullName,
        queuedByUserId: actorUserId,
        planTaskIds: taskBatch.map((task) => task.id),
        executionModelPolicy: buildExecutionModelPolicyMetadata(prPolicy),
      });

      summary.queued += 1;
      log(
        'startup_execution_dispatch_queued',
        {
          startup_workspace_id: execution.startupWorkspaceId,
          execution_id: execution.id,
          queued_by_user_id: actorUserId,
          repo_full_name: enabledRepos[0]!.fullName,
          task_count: taskBatch.length,
        },
        'info'
      );
    } catch (error) {
      summary.failed += 1;
      logError('startup_execution_dispatch_failed', {
        startup_workspace_id: candidate.startup_workspace_id,
        execution_id: candidate.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return summary;
}
