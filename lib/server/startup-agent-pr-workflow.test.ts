import { describe, expect, it } from 'vitest';
import {
  queueStartupExecutionPrRun,
  queueStartupRecommendationPrRun,
  updateStartupAgentPrRunStatus,
} from './startup-agent-pr-workflow';

function createWorkflowMock(options?: {
  recommendationStatus?: 'approved' | 'in_progress' | 'shipped';
  runStatus?: 'queued' | 'running' | 'pr_opened';
}) {
  const state = {
    recommendationStatus: options?.recommendationStatus ?? ('approved' as 'approved' | 'in_progress' | 'shipped'),
    runStatus: options?.runStatus ?? ('running' as 'queued' | 'running' | 'pr_opened'),
    executionStatus: 'plan_ready' as 'plan_ready' | 'executing' | 'completed' | 'failed',
    taskStatuses: {
      'task-1': 'todo',
      'task-2': 'todo',
    } as Record<string, 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed'>,
    recommendationUpdates: [] as Array<Record<string, unknown>>,
    executionUpdates: [] as Array<Record<string, unknown>>,
    runUpdates: [] as Array<Record<string, unknown>>,
    taskUpdates: [] as Array<Record<string, unknown>>,
    runEvents: [] as Array<Record<string, unknown>>,
    recommendationEvents: [] as Array<Record<string, unknown>>,
    insertedRun: null as Record<string, unknown> | null,
  };

  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: unknown = null;

      const api = {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        order() {
          return this;
        },
        maybeSingle() {
          if (table === 'startup_github_installations') {
            return Promise.resolve({
              data: { id: 'install-1', status: 'connected' },
              error: null,
            });
          }
          if (table === 'startup_github_installation_repositories') {
            return Promise.resolve({
              data: { id: 'repo-1', is_enabled: true },
              error: null,
            });
          }
          if (table === 'startup_recommendations') {
            return Promise.resolve({
              data: {
                id: 'rec-1',
                startup_workspace_id: 'ws-1',
                scan_id: null,
                report_id: null,
                source_kind: 'markdown_audit',
                source_ref: null,
                title: 'Fix schema',
                summary: null,
                team_lane: 'dev',
                priority: 'high',
                status: state.recommendationStatus,
                status_changed_at: '2026-04-04T00:00:00.000Z',
                status_reason: null,
                status_updated_by_user_id: null,
                confidence: null,
                evidence: {},
                metadata: {},
                created_by_user_id: 'user-1',
                created_at: '2026-04-04T00:00:00.000Z',
                updated_at: '2026-04-04T00:00:00.000Z',
              },
              error: null,
            });
          }
          if (table === 'startup_agent_pr_runs') {
            return Promise.resolve({
              data: {
                id: 'run-1',
                startup_workspace_id: 'ws-1',
                recommendation_id: 'rec-1',
                execution_id: 'exec-1',
                plan_task_ids: ['task-1'],
                repository_owner: 'acme',
                repository_name: 'geo-pulse',
                branch_name: 'agent/fix-schema',
                pull_request_number: null,
                pull_request_url: null,
                status: state.runStatus,
                error_message: null,
                created_at: '2026-04-04T00:00:00.000Z',
                completed_at: null,
              },
              error: null,
            });
          }
          if (table === 'startup_audit_executions') {
            return Promise.resolve({
              data: {
                id: 'exec-1',
                startup_workspace_id: 'ws-1',
                scan_id: 'scan-1',
                report_id: 'report-1',
                source_kind: 'markdown_audit',
                source_ref: 'audit://1',
                status: state.executionStatus,
                summary: 'Execution plan ready.',
                error_message: null,
                created_by_user_id: 'user-1',
                completed_at: null,
                metadata: {
                  approval_status: 'approved_for_execution',
                  approval_requested_at: '2026-04-04T00:00:00.000Z',
                  approval_approved_at: '2026-04-04T00:10:00.000Z',
                  approval_approved_by_user_id: 'founder-1',
                },
                created_at: '2026-04-04T00:00:00.000Z',
                updated_at: '2026-04-04T00:10:00.000Z',
              },
              error: null,
            });
          }
          if (table === 'startup_implementation_plan_tasks') {
            const taskId = String(filters['id'] ?? 'task-1');
            return Promise.resolve({
              data: {
                id: taskId,
                plan_id: 'plan-1',
                recommendation_id: null,
                team_lane: 'dev',
                task_kind: 'implementation',
                title: taskId === 'task-2' ? 'Verify output' : 'Persist worker metadata',
                detail: null,
                priority: taskId === 'task-2' ? 'medium' : 'high',
                confidence: 0.9,
                evidence: {},
                execution_mode: 'approval_required',
                depends_on_task_ids: [],
                acceptance_criteria: [],
                evidence_required: [],
                artifact_refs: [],
                status: state.taskStatuses[taskId] ?? 'todo',
                sort_order: taskId === 'task-2' ? 1 : 0,
                blocked_reason: null,
                agent_role: 'execution_worker',
                manual_instructions: null,
                created_at: '2026-04-04T00:00:00.000Z',
              },
              error: null,
            });
          }
          if (table === 'startup_implementation_plans') {
            return Promise.resolve({
              data: {
                id: 'plan-1',
                startup_workspace_id: 'ws-1',
                metadata: {
                  execution_id: 'exec-1',
                },
              },
              error: null,
            });
          }
          throw new Error(`Unexpected maybeSingle on ${table}`);
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          if (table === 'startup_recommendations') {
            state.recommendationUpdates.push(payload);
            if (typeof payload.status === 'string') {
              state.recommendationStatus = payload.status as typeof state.recommendationStatus;
            }
          }
          if (table === 'startup_agent_pr_runs') {
            state.runUpdates.push(payload);
            if (typeof payload.status === 'string') {
              state.runStatus = payload.status as typeof state.runStatus;
            }
          }
          if (table === 'startup_audit_executions') {
            state.executionUpdates.push(payload);
            if (typeof payload.status === 'string') {
              state.executionStatus = payload.status as typeof state.executionStatus;
            }
          }
          if (table === 'startup_implementation_plan_tasks') {
            state.taskUpdates.push(payload);
          }
          return this;
        },
        insert(payload: unknown) {
          insertPayload = payload;
          if (table === 'startup_agent_pr_run_events') {
            state.runEvents.push(payload as Record<string, unknown>);
            return Promise.resolve({ error: null });
          }
          if (table === 'startup_recommendation_status_events') {
            state.recommendationEvents.push(payload as Record<string, unknown>);
            return Promise.resolve({ error: null });
          }
          if (table === 'startup_agent_pr_runs') {
            state.insertedRun = payload as Record<string, unknown>;
            return this;
          }
          return Promise.resolve({ error: null });
        },
        limit() {
          if (table === 'startup_agent_pr_runs') {
            const insertedRun = state.insertedRun ?? {};
            return Promise.resolve({
              data: [
                {
                  id: 'run-1',
                  startup_workspace_id: 'ws-1',
                  recommendation_id:
                    Object.prototype.hasOwnProperty.call(insertedRun, 'recommendation_id')
                      ? ((insertedRun.recommendation_id as string | null | undefined) ?? null)
                      : 'rec-1',
                  execution_id:
                    Object.prototype.hasOwnProperty.call(insertedRun, 'execution_id')
                      ? ((insertedRun.execution_id as string | null | undefined) ?? null)
                      : 'exec-1',
                  plan_task_ids:
                    Object.prototype.hasOwnProperty.call(insertedRun, 'plan_task_ids')
                      ? ((insertedRun.plan_task_ids as string[] | undefined) ?? [])
                      : ['task-1'],
                  repository_owner: 'acme',
                  repository_name: 'geo-pulse',
                  branch_name:
                    (updatePayload?.branch_name as string | null | undefined) ??
                    ((state.insertedRun?.branch_name as string | undefined) ?? null),
                  pull_request_number:
                    (updatePayload?.pull_request_number as number | null | undefined) ?? null,
                  pull_request_url: (updatePayload?.pull_request_url as string | null | undefined) ?? null,
                  status:
                    (updatePayload?.status as string | undefined) ??
                    ((state.insertedRun?.status as string | undefined) ?? 'queued'),
                  error_message: (updatePayload?.error_message as string | null | undefined) ?? null,
                  created_at: '2026-04-04T00:00:00.000Z',
                  completed_at: (updatePayload?.completed_at as string | null | undefined) ?? null,
                },
              ],
              error: null,
            });
          }
          if (table === 'startup_audit_executions') {
            return Promise.resolve({
              data: [
                {
                  id: 'exec-1',
                  startup_workspace_id: 'ws-1',
                  scan_id: 'scan-1',
                  report_id: 'report-1',
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: state.executionStatus,
                  summary: 'Execution plan ready.',
                  error_message: updatePayload?.error_message ?? null,
                  created_by_user_id: 'user-1',
                  completed_at: updatePayload?.completed_at ?? null,
                  metadata: updatePayload?.metadata ?? {
                    approval_status: 'approved_for_execution',
                    approval_requested_at: '2026-04-04T00:00:00.000Z',
                    approval_approved_at: '2026-04-04T00:10:00.000Z',
                    approval_approved_by_user_id: 'founder-1',
                  },
                  created_at: '2026-04-04T00:00:00.000Z',
                  updated_at: '2026-04-04T00:20:00.000Z',
                },
              ],
              error: null,
            });
          }
          if (table === 'startup_recommendations') {
            return Promise.resolve({
              data: [
                {
                  id: 'rec-1',
                  startup_workspace_id: 'ws-1',
                  scan_id: null,
                  report_id: null,
                  source_kind: 'markdown_audit',
                  source_ref: null,
                  title: 'Fix schema',
                  summary: null,
                  team_lane: 'dev',
                  priority: 'high',
                  status: updatePayload?.status ?? state.recommendationStatus,
                  status_changed_at: '2026-04-04T00:00:00.000Z',
                  status_reason: updatePayload?.status_reason ?? null,
                  status_updated_by_user_id: updatePayload?.status_updated_by_user_id ?? null,
                  confidence: null,
                  evidence: {},
                  metadata: updatePayload?.metadata ?? {},
                  created_by_user_id: 'user-1',
                  created_at: '2026-04-04T00:00:00.000Z',
                  updated_at: '2026-04-04T00:00:00.000Z',
                },
              ],
              error: null,
            });
          }
          if (table === 'startup_implementation_plan_tasks') {
            const taskId = String(filters['id'] ?? 'task-1');
            if (typeof updatePayload?.status === 'string') {
              state.taskStatuses[taskId] = updatePayload.status as typeof state.taskStatuses[string];
            }
            return Promise.resolve({
              data: [
                {
                  id: taskId,
                  plan_id: 'plan-1',
                  recommendation_id: null,
                  team_lane: 'dev',
                  task_kind: 'implementation',
                  title: taskId === 'task-2' ? 'Verify output' : 'Persist worker metadata',
                  detail: null,
                  priority: taskId === 'task-2' ? 'medium' : 'high',
                  confidence: 0.9,
                  evidence: {},
                  execution_mode: 'approval_required',
                  depends_on_task_ids: [],
                  acceptance_criteria: [],
                  evidence_required: [],
                  artifact_refs: [],
                  status: state.taskStatuses[taskId],
                  sort_order: taskId === 'task-2' ? 1 : 0,
                  blocked_reason: updatePayload?.blocked_reason ?? null,
                  agent_role: 'execution_worker',
                  manual_instructions: null,
                  created_at: '2026-04-04T00:00:00.000Z',
                },
              ],
              error: null,
            });
          }
          throw new Error(`Unexpected limit on ${table}`);
        },
      };

      return api;
    },
  } as any;

  return { supabase, state };
}

describe('startup agent pr workflow', () => {
  it('queues a PR run from approved recommendation and moves recommendation to in_progress', async () => {
    const { supabase, state } = createWorkflowMock({ recommendationStatus: 'approved', runStatus: 'queued' });

    const run = await queueStartupRecommendationPrRun({
      supabase,
      startupWorkspaceId: 'ws-1',
      recommendationId: 'rec-1',
      repoFullName: 'acme/geo-pulse',
      queuedByUserId: 'user-1',
    });

    expect(run.status).toBe('queued');
    expect(run.executionId).toBe(null);
    expect(run.planTaskIds).toEqual([]);
    expect(state.recommendationUpdates.some((payload) => payload.status === 'in_progress')).toBe(true);
    expect(state.runEvents.some((event) => event.to_status === 'queued')).toBe(true);
  });

  it('queues a PR run from approved execution context without requiring recommendation linkage', async () => {
    const { supabase, state } = createWorkflowMock({ recommendationStatus: 'approved', runStatus: 'queued' });

    const run = await queueStartupExecutionPrRun({
      supabase,
      startupWorkspaceId: 'ws-1',
      executionId: 'exec-1',
      repoFullName: 'acme/geo-pulse',
      queuedByUserId: 'user-1',
      planTaskIds: ['task-1', 'task-2'],
    });

    expect(run.executionId).toBe('exec-1');
    expect(run.planTaskIds).toEqual(['task-1', 'task-2']);
    expect(state.insertedRun?.['execution_id']).toBe('exec-1');
    expect(state.runEvents.some((event) => event.execution_id === 'exec-1')).toBe(true);
    expect(state.taskStatuses['task-1']).toBe('in_progress');
    expect(state.taskStatuses['task-2']).toBe('in_progress');
  });

  it('syncs recommendation to shipped when PR is opened', async () => {
    const { supabase, state } = createWorkflowMock({ recommendationStatus: 'in_progress', runStatus: 'running' });

    const run = await updateStartupAgentPrRunStatus({
      supabase,
      startupWorkspaceId: 'ws-1',
      runId: 'run-1',
      toStatus: 'pr_opened',
      changedByUserId: 'user-1',
      pullRequestNumber: 42,
      pullRequestUrl: 'https://github.com/acme/geo-pulse/pull/42',
      branchName: 'agent/fix-schema',
    });

    expect(run.status).toBe('pr_opened');
    expect(state.executionUpdates.some((payload) => payload.status === 'executing')).toBe(true);
    expect(state.recommendationUpdates.some((payload) => payload.status === 'shipped')).toBe(true);
    expect(state.runEvents.some((event) => event.to_status === 'pr_opened')).toBe(true);
  });

  it('syncs recommendation to validated when PR is merged', async () => {
    const { supabase, state } = createWorkflowMock({ recommendationStatus: 'shipped', runStatus: 'pr_opened' });
    state.executionStatus = 'executing';

    const run = await updateStartupAgentPrRunStatus({
      supabase,
      startupWorkspaceId: 'ws-1',
      runId: 'run-1',
      toStatus: 'merged',
      changedByUserId: 'user-1',
      pullRequestNumber: 42,
      pullRequestUrl: 'https://github.com/acme/geo-pulse/pull/42',
    });

    expect(run.status).toBe('merged');
    expect(state.executionUpdates.some((payload) => payload.status === 'completed')).toBe(true);
    expect(state.recommendationUpdates.some((payload) => payload.status === 'validated')).toBe(true);
    expect(state.taskStatuses['task-1']).toBe('done');
  });

  it('syncs linked execution tasks to failed when PR execution fails', async () => {
    const { supabase, state } = createWorkflowMock({ recommendationStatus: 'in_progress', runStatus: 'running' });
    state.taskStatuses['task-1'] = 'in_progress';

    const run = await updateStartupAgentPrRunStatus({
      supabase,
      startupWorkspaceId: 'ws-1',
      runId: 'run-1',
      toStatus: 'failed',
      changedByUserId: 'user-1',
      errorMessage: 'Checks failed in CI',
    });

    expect(run.status).toBe('failed');
    expect(state.executionUpdates.some((payload) => payload.status === 'failed')).toBe(true);
    expect(state.taskStatuses['task-1']).toBe('failed');
  });
});
