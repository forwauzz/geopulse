import { describe, expect, it, vi } from 'vitest';
import { runScheduledStartupExecutionDispatch } from './startup-execution-dispatch-schedule';
import type { StartupAgentPrRun } from './startup-agent-pr-workflow';

function createScheduleSupabase(candidates: Array<{ id: string; startup_workspace_id: string }>) {
  return {
    from(table: string) {
      const api = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          if (table === 'startup_audit_executions') {
            return Promise.resolve({
              data: candidates,
              error: null,
            });
          }
          throw new Error(`Unexpected limit on ${table}`);
        },
      };

      return api;
    },
  } as any;
}

const enabledEnv = {
  STARTUP_DASHBOARD_ENABLED: 'true',
  STARTUP_GITHUB_AGENT_ENABLED: 'true',
  STARTUP_AUTO_PR_ENABLED: 'true',
  BENCHMARK_EXECUTION_PROVIDER: 'openai',
  BENCHMARK_EXECUTION_MODEL: 'gpt-5.4',
  GEMINI_MODEL: 'gemini-2.0-flash',
} as const;

describe('startup execution dispatch schedule', () => {
  it('returns disabled when startup auto-pr rollout is globally off', async () => {
    const summary = await runScheduledStartupExecutionDispatch({
      supabase: createScheduleSupabase([{ id: 'exec-1', startup_workspace_id: 'ws-1' }]),
      env: {
        ...enabledEnv,
        STARTUP_AUTO_PR_ENABLED: 'false',
      },
    });

    expect(summary).toEqual({
      status: 'disabled',
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
    });
  });

  it('queues the next approved execution batch when one enabled repo is available', async () => {
    const queueExecutionPrRun = vi.fn(async () => ({
      id: 'run-1',
      startupWorkspaceId: 'ws-1',
      recommendationId: null,
      executionId: 'exec-1',
      planTaskIds: ['task-1', 'task-2'],
      repositoryOwner: 'acme',
      repositoryName: 'geo-pulse',
      branchName: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
      status: 'queued',
      errorMessage: null,
      createdAt: '2026-04-14T12:00:00.000Z',
      completedAt: null,
    }));

    const summary = await runScheduledStartupExecutionDispatch({
      supabase: createScheduleSupabase([{ id: 'exec-1', startup_workspace_id: 'ws-1' }]),
      env: enabledEnv,
      deps: {
        getExecution: vi.fn(async () => ({
          id: 'exec-1',
          startupWorkspaceId: 'ws-1',
          scanId: null,
          reportId: null,
          sourceKind: 'markdown_audit' as const,
          sourceRef: null,
          status: 'plan_ready' as const,
          summary: 'Execution ready',
          errorMessage: null,
          createdByUserId: 'founder-1',
          completedAt: null,
          metadata: {},
          approval: {
            status: 'approved_for_execution',
            requestedAt: null,
            requestedByUserId: null,
            approvedAt: '2026-04-14T11:00:00.000Z',
            approvedByUserId: 'founder-1',
            rejectedAt: null,
            rejectedByUserId: null,
            rejectionReason: null,
            note: null,
          },
          repoReviewArtifact: null,
          dbReviewArtifact: null,
          riskReviewArtifact: null,
          createdAt: '2026-04-14T10:00:00.000Z',
          updatedAt: '2026-04-14T11:00:00.000Z',
        })) as any,
        resolveRolloutFlags: vi.fn(async () => ({
          startupDashboard: true,
          githubAgent: true,
          autoPr: true,
          slackAgent: true,
          slackAutoPost: true,
        })) as any,
        resolveUiGates: vi.fn(async () => ({
          githubIntegration: { enabled: true, blockedReason: null },
          agentPrExecution: { enabled: true, blockedReason: null },
          slackIntegration: { enabled: true, blockedReason: null },
          slackNotifications: { enabled: true, blockedReason: null },
        })) as any,
        listPrRuns: vi.fn(async () => []),
        getLatestPlan: vi.fn(async () => ({
          id: 'plan-1',
          startupWorkspaceId: 'ws-1',
          scanId: null,
          reportId: null,
          sourceKind: 'agent' as const,
          sourceRef: 'execution://exec-1',
          status: 'ready' as const,
          summary: 'Plan',
          executionId: 'exec-1',
          plannerArtifact: null,
          tasks: [
            {
              id: 'task-1',
              planId: 'plan-1',
              recommendationId: null,
              teamLane: 'dev',
              taskKind: 'implementation',
              title: 'Persist PR context',
              detail: null,
              priority: 'high',
              confidence: 0.9,
              evidence: {},
              executionMode: 'approval_required',
              dependsOnTaskIds: [],
              acceptanceCriteria: [],
              evidenceRequired: [],
              artifactRefs: [],
              status: 'todo',
              sortOrder: 0,
              blockedReason: null,
              agentRole: 'execution_worker',
              manualInstructions: null,
              createdAt: '2026-04-14T10:00:00.000Z',
            },
            {
              id: 'task-2',
              planId: 'plan-1',
              recommendationId: null,
              teamLane: 'dev',
              taskKind: 'implementation',
              title: 'Store execution metadata',
              detail: null,
              priority: 'medium',
              confidence: 0.85,
              evidence: {},
              executionMode: 'auto',
              dependsOnTaskIds: [],
              acceptanceCriteria: [],
              evidenceRequired: [],
              artifactRefs: [],
              status: 'todo',
              sortOrder: 1,
              blockedReason: null,
              agentRole: 'execution_worker',
              manualInstructions: null,
              createdAt: '2026-04-14T10:01:00.000Z',
            },
          ],
          createdAt: '2026-04-14T10:00:00.000Z',
        })) as any,
        getGithubState: vi.fn(async () => ({
          installation: null,
          repositories: [
            {
              id: 'repo-1',
              owner: 'acme',
              name: 'geo-pulse',
              fullName: 'acme/geo-pulse',
              enabled: true,
            },
          ],
        })) as any,
        assertRepoAccess: vi.fn(async () => undefined) as any,
        assertNoActiveRepoRun: vi.fn(async () => undefined) as any,
        resolveModelPolicy: vi.fn(async () => ({
          serviceKey: 'startup_audit_execution' as const,
          bundleKey: 'startup_dev' as const,
          source: 'bundle' as const,
          requestedProvider: 'openai',
          requestedModel: 'gpt-5.4',
          effectiveProvider: 'openai',
          effectiveModel: 'gpt-5.4',
          maxCostUsd: null,
          estimatedCostUsd: null,
          budgetExceeded: false,
          fallbackReason: null,
        })) as any,
        queueExecutionPrRun: queueExecutionPrRun as any,
      },
    });

    expect(summary.queued).toBe(1);
    expect(summary.failed).toBe(0);
    expect(queueExecutionPrRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startupWorkspaceId: 'ws-1',
        executionId: 'exec-1',
        repoFullName: 'acme/geo-pulse',
        queuedByUserId: 'founder-1',
        planTaskIds: ['task-1', 'task-2'],
      })
    );
  });

  it('skips execution dispatch when an active PR run already exists', async () => {
    const queueExecutionPrRun = vi.fn();

    const summary = await runScheduledStartupExecutionDispatch({
      supabase: createScheduleSupabase([{ id: 'exec-1', startup_workspace_id: 'ws-1' }]),
      env: enabledEnv,
      deps: {
        getExecution: vi.fn(async () => ({
          id: 'exec-1',
          startupWorkspaceId: 'ws-1',
          scanId: null,
          reportId: null,
          sourceKind: 'markdown_audit' as const,
          sourceRef: null,
          status: 'plan_ready' as const,
          summary: null,
          errorMessage: null,
          createdByUserId: 'founder-1',
          completedAt: null,
          metadata: {},
          approval: {
            status: 'approved_for_execution',
            requestedAt: null,
            requestedByUserId: null,
            approvedAt: '2026-04-14T11:00:00.000Z',
            approvedByUserId: 'founder-1',
            rejectedAt: null,
            rejectedByUserId: null,
            rejectionReason: null,
            note: null,
          },
          repoReviewArtifact: null,
          dbReviewArtifact: null,
          riskReviewArtifact: null,
          createdAt: '2026-04-14T10:00:00.000Z',
          updatedAt: '2026-04-14T11:00:00.000Z',
        })) as any,
        resolveRolloutFlags: vi.fn(async () => ({
          startupDashboard: true,
          githubAgent: true,
          autoPr: true,
          slackAgent: true,
          slackAutoPost: true,
        })) as any,
        resolveUiGates: vi.fn(async () => ({
          githubIntegration: { enabled: true, blockedReason: null },
          agentPrExecution: { enabled: true, blockedReason: null },
          slackIntegration: { enabled: true, blockedReason: null },
          slackNotifications: { enabled: true, blockedReason: null },
        })) as any,
        listPrRuns: vi.fn(async () => [
          {
            id: 'run-1',
            startupWorkspaceId: 'ws-1',
            recommendationId: null,
            executionId: 'exec-1',
            planTaskIds: ['task-1'],
            repositoryOwner: 'acme',
            repositoryName: 'geo-pulse',
            branchName: null,
            pullRequestNumber: null,
            pullRequestUrl: null,
            status: 'queued',
            errorMessage: null,
            createdAt: '2026-04-14T12:00:00.000Z',
            completedAt: null,
          },
        ] satisfies StartupAgentPrRun[]) as any,
        assertRepoAccess: vi.fn(async () => undefined) as any,
        assertNoActiveRepoRun: vi.fn(async () => undefined) as any,
      },
    });

    expect(summary.skippedActiveRun).toBe(1);
    expect(queueExecutionPrRun).not.toHaveBeenCalled();
  });

  it('skips execution dispatch when repository selection is ambiguous', async () => {
    const queueExecutionPrRun = vi.fn();

    const summary = await runScheduledStartupExecutionDispatch({
      supabase: createScheduleSupabase([{ id: 'exec-1', startup_workspace_id: 'ws-1' }]),
      env: enabledEnv,
      deps: {
        getExecution: vi.fn(async () => ({
          id: 'exec-1',
          startupWorkspaceId: 'ws-1',
          scanId: null,
          reportId: null,
          sourceKind: 'markdown_audit' as const,
          sourceRef: null,
          status: 'plan_ready' as const,
          summary: null,
          errorMessage: null,
          createdByUserId: 'founder-1',
          completedAt: null,
          metadata: {},
          approval: {
            status: 'approved_for_execution',
            requestedAt: null,
            requestedByUserId: null,
            approvedAt: '2026-04-14T11:00:00.000Z',
            approvedByUserId: 'founder-1',
            rejectedAt: null,
            rejectedByUserId: null,
            rejectionReason: null,
            note: null,
          },
          repoReviewArtifact: null,
          dbReviewArtifact: null,
          riskReviewArtifact: null,
          createdAt: '2026-04-14T10:00:00.000Z',
          updatedAt: '2026-04-14T11:00:00.000Z',
        })) as any,
        resolveRolloutFlags: vi.fn(async () => ({
          startupDashboard: true,
          githubAgent: true,
          autoPr: true,
          slackAgent: true,
          slackAutoPost: true,
        })) as any,
        resolveUiGates: vi.fn(async () => ({
          githubIntegration: { enabled: true, blockedReason: null },
          agentPrExecution: { enabled: true, blockedReason: null },
          slackIntegration: { enabled: true, blockedReason: null },
          slackNotifications: { enabled: true, blockedReason: null },
        })) as any,
        listPrRuns: vi.fn(async () => []) as any,
        getLatestPlan: vi.fn(async () => ({
          id: 'plan-1',
          startupWorkspaceId: 'ws-1',
          scanId: null,
          reportId: null,
          sourceKind: 'agent' as const,
          sourceRef: 'execution://exec-1',
          status: 'ready' as const,
          summary: 'Plan',
          executionId: 'exec-1',
          plannerArtifact: null,
          tasks: [
            {
              id: 'task-1',
              planId: 'plan-1',
              recommendationId: null,
              teamLane: 'dev',
              taskKind: 'implementation',
              title: 'Persist PR context',
              detail: null,
              priority: 'high',
              confidence: 0.9,
              evidence: {},
              executionMode: 'auto',
              dependsOnTaskIds: [],
              acceptanceCriteria: [],
              evidenceRequired: [],
              artifactRefs: [],
              status: 'todo',
              sortOrder: 0,
              blockedReason: null,
              agentRole: 'execution_worker',
              manualInstructions: null,
              createdAt: '2026-04-14T10:00:00.000Z',
            },
          ],
          createdAt: '2026-04-14T10:00:00.000Z',
        })) as any,
        getGithubState: vi.fn(async () => ({
          installation: null,
          repositories: [
            { id: 'repo-1', owner: 'acme', name: 'geo-pulse', fullName: 'acme/geo-pulse', enabled: true },
            { id: 'repo-2', owner: 'acme', name: 'site', fullName: 'acme/site', enabled: true },
          ],
        })) as any,
        assertRepoAccess: vi.fn(async () => undefined) as any,
        assertNoActiveRepoRun: vi.fn(async () => undefined) as any,
        queueExecutionPrRun: queueExecutionPrRun as any,
      },
    });

    expect(summary.skippedRepoSelection).toBe(1);
    expect(queueExecutionPrRun).not.toHaveBeenCalled();
  });
});
