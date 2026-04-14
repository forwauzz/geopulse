import { canTransitionRecommendationStatus, transitionStartupRecommendationStatus } from './startup-recommendation-lifecycle';
import {
  getStartupAuditExecution,
  isStartupAuditExecutionApprovedForExecution,
  updateStartupAuditExecutionStatus,
} from './startup-audit-execution';
import {
  canTransitionStartupImplementationTaskStatus,
  getStartupImplementationPlanTask,
  updateStartupImplementationPlanTaskStatus,
  type StartupImplementationTaskStatus,
} from './startup-implementation-plan';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupAgentPrRunStatus =
  | 'queued'
  | 'running'
  | 'pr_opened'
  | 'merged'
  | 'closed'
  | 'failed'
  | 'cancelled';

export type StartupAgentPrRun = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly recommendationId: string | null;
  readonly executionId: string | null;
  readonly planTaskIds: string[];
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly branchName: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestUrl: string | null;
  readonly status: StartupAgentPrRunStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

function parseRepoFullName(repo: string): { owner: string; name: string } {
  const cleaned = repo.trim().toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(cleaned)) {
    throw new Error('Repository must be in owner/repo format.');
  }
  const parts = cleaned.split('/');
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name) throw new Error('Repository must be in owner/repo format.');
  return { owner, name };
}

function canTransitionRunStatus(from: StartupAgentPrRunStatus, to: StartupAgentPrRunStatus): boolean {
  if (from === to) return true;
  const map: Record<StartupAgentPrRunStatus, readonly StartupAgentPrRunStatus[]> = {
    queued: ['running', 'pr_opened', 'failed', 'cancelled'],
    running: ['pr_opened', 'failed', 'cancelled'],
    pr_opened: ['merged', 'closed', 'failed'],
    merged: [],
    closed: [],
    failed: [],
    cancelled: [],
  };
  return map[from].includes(to);
}

function toRun(row: {
  id: string;
  startup_workspace_id: string;
  recommendation_id: string | null;
  execution_id: string | null;
  plan_task_ids: string[] | null;
  repository_owner: string;
  repository_name: string;
  branch_name: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  status: StartupAgentPrRunStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}): StartupAgentPrRun {
  return {
    id: row.id,
    startupWorkspaceId: row.startup_workspace_id,
    recommendationId: row.recommendation_id,
    executionId: row.execution_id,
    planTaskIds: row.plan_task_ids ?? [],
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    branchName: row.branch_name,
    pullRequestNumber: row.pull_request_number,
    pullRequestUrl: row.pull_request_url,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function syncExecutionTasksForRun(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly taskIds: readonly string[];
  readonly toStatus: StartupImplementationTaskStatus;
  readonly changedByUserId: string;
}): Promise<void> {
  const boundedTaskIds = Array.from(new Set(args.taskIds.map((value) => value.trim()).filter(Boolean)));
  if (boundedTaskIds.length === 0) return;

  for (const taskId of boundedTaskIds) {
    const current = await getStartupImplementationPlanTask({
      supabase: args.supabase,
      taskId,
      expectedWorkspaceId: args.startupWorkspaceId,
    });
    if (
      !canTransitionStartupImplementationTaskStatus({
        from: current.status,
        to: args.toStatus,
      })
    ) {
      continue;
    }

    await updateStartupImplementationPlanTaskStatus({
      supabase: args.supabase,
      taskId,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: args.toStatus,
      changedByUserId: args.changedByUserId,
    });
  }
}

export async function listStartupAgentPrRuns(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly limit?: number;
}): Promise<StartupAgentPrRun[]> {
  const { data, error } = await args.supabase
    .from('startup_agent_pr_runs')
    .select(
      'id,startup_workspace_id,recommendation_id,execution_id,plan_task_ids,repository_owner,repository_name,branch_name,pull_request_number,pull_request_url,status,error_message,created_at,completed_at'
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(args.limit ?? 20, 100)));
  if (error) throw error;
  return ((data ?? []) as Array<Parameters<typeof toRun>[0]>).map(toRun);
}

export async function queueStartupRecommendationPrRun(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly recommendationId: string;
  readonly repoFullName: string;
  readonly queuedByUserId: string;
  readonly executionModelPolicy?: Record<string, unknown> | null;
}): Promise<StartupAgentPrRun> {
  const { owner, name } = parseRepoFullName(args.repoFullName);

  const { data: installation, error: installationError } = await args.supabase
    .from('startup_github_installations')
    .select('id,status')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github')
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.id || installation.status !== 'connected') {
    throw new Error('GitHub installation is not connected for this workspace.');
  }

  const { data: repoRow, error: repoError } = await args.supabase
    .from('startup_github_installation_repositories')
    .select('id,is_enabled')
    .eq('installation_row_id', installation.id)
    .eq('repo_owner', owner)
    .eq('repo_name', name)
    .maybeSingle();
  if (repoError) throw repoError;
  if (!repoRow?.id || !repoRow.is_enabled) {
    throw new Error('Repository is not allowlisted for this startup workspace.');
  }

  const { data: recommendation, error: recommendationError } = await args.supabase
    .from('startup_recommendations')
    .select('id,status')
    .eq('id', args.recommendationId)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .maybeSingle();
  if (recommendationError) throw recommendationError;
  if (!recommendation?.id) throw new Error('Recommendation not found in startup workspace.');

  const recommendationStatus = recommendation.status as
    | 'suggested'
    | 'approved'
    | 'in_progress'
    | 'shipped'
    | 'validated'
    | 'failed';
  if (recommendationStatus !== 'approved' && recommendationStatus !== 'in_progress') {
    throw new Error('Recommendation must be approved before starting PR execution.');
  }

  if (
    recommendationStatus === 'approved' &&
    canTransitionRecommendationStatus({ from: 'approved', to: 'in_progress' })
  ) {
    await transitionStartupRecommendationStatus({
      supabase: args.supabase,
      recommendationId: args.recommendationId,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'in_progress',
      changedByUserId: args.queuedByUserId,
      reason: 'Queued for PR execution',
      metadata: { source: 'startup_agent_pr_workflow' },
    });
  }

  const { data: rows, error: insertError } = await args.supabase
    .from('startup_agent_pr_runs')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      recommendation_id: args.recommendationId,
      execution_id: null,
      plan_task_ids: [],
      github_installation_row_id: installation.id,
      github_repository_row_id: repoRow.id,
      repository_owner: owner,
      repository_name: name,
      status: 'queued',
      queued_by_user_id: args.queuedByUserId,
      metadata: {
        source: 'manual_queue',
        model_policy: args.executionModelPolicy ?? null,
      },
    })
    .select(
      'id,startup_workspace_id,recommendation_id,execution_id,plan_task_ids,repository_owner,repository_name,branch_name,pull_request_number,pull_request_url,status,error_message,created_at,completed_at'
    )
    .limit(1);
  if (insertError) throw insertError;
  const runRow = (rows?.[0] ?? null) as Parameters<typeof toRun>[0] | null;
  if (!runRow) throw new Error('Could not queue PR run.');

  await args.supabase.from('startup_agent_pr_run_events').insert({
    startup_workspace_id: args.startupWorkspaceId,
    run_id: runRow.id,
    recommendation_id: args.recommendationId,
    execution_id: null,
    plan_task_ids: [],
    from_status: null,
    to_status: 'queued',
    changed_by_user_id: args.queuedByUserId,
    note: 'Queued recommendation for PR execution',
    metadata: {},
  });

  structuredLog(
    'startup_pr_run_queued',
    {
      startup_workspace_id: args.startupWorkspaceId,
      run_id: runRow.id,
      recommendation_id: args.recommendationId,
      queued_by_user_id: args.queuedByUserId,
      repository_owner: owner,
      repository_name: name,
    },
    'info'
  );

  return toRun(runRow);
}

export async function queueStartupExecutionPrRun(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly executionId: string;
  readonly repoFullName: string;
  readonly queuedByUserId: string;
  readonly recommendationId?: string | null;
  readonly planTaskIds?: readonly string[];
  readonly executionModelPolicy?: Record<string, unknown> | null;
}): Promise<StartupAgentPrRun> {
  const { owner, name } = parseRepoFullName(args.repoFullName);

  const { data: installation, error: installationError } = await args.supabase
    .from('startup_github_installations')
    .select('id,status')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github')
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.id || installation.status !== 'connected') {
    throw new Error('GitHub installation is not connected for this workspace.');
  }

  const { data: repoRow, error: repoError } = await args.supabase
    .from('startup_github_installation_repositories')
    .select('id,is_enabled')
    .eq('installation_row_id', installation.id)
    .eq('repo_owner', owner)
    .eq('repo_name', name)
    .maybeSingle();
  if (repoError) throw repoError;
  if (!repoRow?.id || !repoRow.is_enabled) {
    throw new Error('Repository is not allowlisted for this startup workspace.');
  }

  const execution = await getStartupAuditExecution({
    supabase: args.supabase,
    executionId: args.executionId,
    expectedWorkspaceId: args.startupWorkspaceId,
  });
  if (execution.status !== 'plan_ready') {
    throw new Error('Execution must be plan_ready before a PR run can be queued.');
  }
  if (!isStartupAuditExecutionApprovedForExecution(execution)) {
    throw new Error('Execution must be approved before a PR run can be queued.');
  }

  const boundedTaskIds = Array.from(new Set((args.planTaskIds ?? []).map((value) => value.trim()).filter(Boolean)));

  const { data: rows, error: insertError } = await args.supabase
    .from('startup_agent_pr_runs')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      recommendation_id: args.recommendationId ?? null,
      execution_id: args.executionId,
      plan_task_ids: boundedTaskIds,
      github_installation_row_id: installation.id,
      github_repository_row_id: repoRow.id,
      repository_owner: owner,
      repository_name: name,
      status: 'queued',
      queued_by_user_id: args.queuedByUserId,
      metadata: {
        source: 'execution_queue',
        model_policy: args.executionModelPolicy ?? null,
      },
    })
    .select(
      'id,startup_workspace_id,recommendation_id,execution_id,plan_task_ids,repository_owner,repository_name,branch_name,pull_request_number,pull_request_url,status,error_message,created_at,completed_at'
    )
    .limit(1);
  if (insertError) throw insertError;
  const runRow = (rows?.[0] ?? null) as Parameters<typeof toRun>[0] | null;
  if (!runRow) throw new Error('Could not queue execution PR run.');

  await args.supabase.from('startup_agent_pr_run_events').insert({
    startup_workspace_id: args.startupWorkspaceId,
    run_id: runRow.id,
    recommendation_id: args.recommendationId ?? null,
    execution_id: args.executionId,
    plan_task_ids: boundedTaskIds,
    from_status: null,
    to_status: 'queued',
    changed_by_user_id: args.queuedByUserId,
    note: 'Queued execution task group for PR execution',
    metadata: {},
  });

  structuredLog(
    'startup_pr_run_queued',
    {
      startup_workspace_id: args.startupWorkspaceId,
      run_id: runRow.id,
      recommendation_id: args.recommendationId ?? null,
      execution_id: args.executionId,
      plan_task_count: boundedTaskIds.length,
      queued_by_user_id: args.queuedByUserId,
      repository_owner: owner,
      repository_name: name,
    },
    'info'
  );

  await syncExecutionTasksForRun({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
    taskIds: boundedTaskIds,
    toStatus: 'in_progress',
    changedByUserId: args.queuedByUserId,
  });

  return toRun(runRow);
}

export async function updateStartupAgentPrRunStatus(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly runId: string;
  readonly toStatus: StartupAgentPrRunStatus;
  readonly changedByUserId: string;
  readonly note?: string | null;
  readonly pullRequestNumber?: number | null;
  readonly pullRequestUrl?: string | null;
  readonly branchName?: string | null;
  readonly commitSha?: string | null;
  readonly errorMessage?: string | null;
}): Promise<StartupAgentPrRun> {
  const { data: runRow, error: runError } = await args.supabase
    .from('startup_agent_pr_runs')
    .select(
      'id,startup_workspace_id,recommendation_id,execution_id,plan_task_ids,repository_owner,repository_name,branch_name,pull_request_number,pull_request_url,status,error_message,created_at,completed_at'
    )
    .eq('id', args.runId)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .maybeSingle();
  if (runError) throw runError;
  if (!runRow?.id) throw new Error('PR run not found in startup workspace.');

  const fromStatus = runRow.status as StartupAgentPrRunStatus;
  if (!canTransitionRunStatus(fromStatus, args.toStatus)) {
    throw new Error(`Invalid PR run transition: ${fromStatus} -> ${args.toStatus}`);
  }

  const completedAt =
    args.toStatus === 'merged' ||
    args.toStatus === 'closed' ||
    args.toStatus === 'failed' ||
    args.toStatus === 'cancelled'
      ? new Date().toISOString()
      : null;

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_agent_pr_runs')
    .update({
      status: args.toStatus,
      pull_request_number: args.pullRequestNumber ?? runRow.pull_request_number,
      pull_request_url: args.pullRequestUrl ?? runRow.pull_request_url,
      branch_name: args.branchName ?? runRow.branch_name,
      commit_sha: args.commitSha ?? null,
      error_message: args.errorMessage ?? null,
      started_at: args.toStatus === 'running' ? new Date().toISOString() : runRow.started_at ?? null,
      completed_at: completedAt,
      metadata: { last_status_actor: args.changedByUserId },
    })
    .eq('id', args.runId)
    .select(
      'id,startup_workspace_id,recommendation_id,execution_id,plan_task_ids,repository_owner,repository_name,branch_name,pull_request_number,pull_request_url,status,error_message,created_at,completed_at'
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof toRun>[0] | null;
  if (!updated) throw new Error('PR run update failed.');

  await args.supabase.from('startup_agent_pr_run_events').insert({
    startup_workspace_id: args.startupWorkspaceId,
    run_id: args.runId,
    recommendation_id: runRow.recommendation_id,
    execution_id: runRow.execution_id,
    plan_task_ids: runRow.plan_task_ids ?? [],
    from_status: fromStatus,
    to_status: args.toStatus,
    changed_by_user_id: args.changedByUserId,
    note: args.note ?? null,
    metadata: {
      pull_request_number: args.pullRequestNumber ?? runRow.pull_request_number ?? null,
      pull_request_url: args.pullRequestUrl ?? runRow.pull_request_url ?? null,
    },
  });

  structuredLog(
    'startup_pr_run_status_updated',
    {
      startup_workspace_id: args.startupWorkspaceId,
      run_id: args.runId,
      recommendation_id: runRow.recommendation_id,
      execution_id: runRow.execution_id,
      plan_task_count: Array.isArray(runRow.plan_task_ids) ? runRow.plan_task_ids.length : 0,
      from_status: fromStatus,
      to_status: args.toStatus,
      changed_by_user_id: args.changedByUserId,
      pull_request_number: args.pullRequestNumber ?? runRow.pull_request_number ?? null,
      pull_request_url: args.pullRequestUrl ?? runRow.pull_request_url ?? null,
      error_message: args.errorMessage ?? null,
    },
    'info'
  );

  if (runRow.execution_id && args.toStatus === 'running') {
    await syncExecutionTasksForRun({
      supabase: args.supabase,
      startupWorkspaceId: args.startupWorkspaceId,
      taskIds: runRow.plan_task_ids ?? [],
      toStatus: 'in_progress',
      changedByUserId: args.changedByUserId,
    });
  } else if (runRow.execution_id && args.toStatus === 'merged') {
    await syncExecutionTasksForRun({
      supabase: args.supabase,
      startupWorkspaceId: args.startupWorkspaceId,
      taskIds: runRow.plan_task_ids ?? [],
      toStatus: 'done',
      changedByUserId: args.changedByUserId,
    });
  } else if (runRow.execution_id && args.toStatus === 'failed') {
    await syncExecutionTasksForRun({
      supabase: args.supabase,
      startupWorkspaceId: args.startupWorkspaceId,
      taskIds: runRow.plan_task_ids ?? [],
      toStatus: 'failed',
      changedByUserId: args.changedByUserId,
    });
  } else if (runRow.execution_id && (args.toStatus === 'closed' || args.toStatus === 'cancelled')) {
    await syncExecutionTasksForRun({
      supabase: args.supabase,
      startupWorkspaceId: args.startupWorkspaceId,
      taskIds: runRow.plan_task_ids ?? [],
      toStatus: 'todo',
      changedByUserId: args.changedByUserId,
    });
  }

  if (runRow.execution_id && (args.toStatus === 'running' || args.toStatus === 'pr_opened')) {
    await updateStartupAuditExecutionStatus({
      supabase: args.supabase,
      executionId: runRow.execution_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'executing',
      changedByUserId: args.changedByUserId,
      note:
        args.toStatus === 'running'
          ? 'PR execution started for startup audit execution'
          : 'PR opened for startup audit execution',
      metadata: {
        pr_run_id: args.runId,
        pr_status: args.toStatus,
      },
    });
  } else if (runRow.execution_id && args.toStatus === 'merged') {
    await updateStartupAuditExecutionStatus({
      supabase: args.supabase,
      executionId: runRow.execution_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'completed',
      changedByUserId: args.changedByUserId,
      note: 'PR merged for startup audit execution',
      metadata: {
        pr_run_id: args.runId,
        pr_status: args.toStatus,
      },
    });
  } else if (runRow.execution_id && args.toStatus === 'failed') {
    await updateStartupAuditExecutionStatus({
      supabase: args.supabase,
      executionId: runRow.execution_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'failed',
      changedByUserId: args.changedByUserId,
      note: args.errorMessage ?? 'PR execution failed for startup audit execution',
      errorMessage: args.errorMessage ?? 'PR execution failed',
      metadata: {
        pr_run_id: args.runId,
        pr_status: args.toStatus,
      },
    });
  }

  if (runRow.recommendation_id && args.toStatus === 'pr_opened') {
    await transitionStartupRecommendationStatus({
      supabase: args.supabase,
      recommendationId: runRow.recommendation_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'shipped',
      changedByUserId: args.changedByUserId,
      reason: 'PR opened for recommendation',
      metadata: { run_id: args.runId },
    });
  } else if (runRow.recommendation_id && args.toStatus === 'merged') {
    await transitionStartupRecommendationStatus({
      supabase: args.supabase,
      recommendationId: runRow.recommendation_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'validated',
      changedByUserId: args.changedByUserId,
      reason: 'PR merged for recommendation',
      metadata: { run_id: args.runId },
    });
  } else if (runRow.recommendation_id && args.toStatus === 'failed') {
    await transitionStartupRecommendationStatus({
      supabase: args.supabase,
      recommendationId: runRow.recommendation_id,
      expectedWorkspaceId: args.startupWorkspaceId,
      toStatus: 'failed',
      changedByUserId: args.changedByUserId,
      reason: args.errorMessage ?? 'PR execution failed',
      metadata: { run_id: args.runId },
    });
  }

  return toRun(updated);
}
