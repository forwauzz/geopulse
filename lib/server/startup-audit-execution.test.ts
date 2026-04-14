import { describe, expect, it } from 'vitest';
import {
  canTransitionStartupAuditExecutionApprovalStatus,
  canTransitionStartupAuditExecutionStatus,
  createStartupAuditExecution,
  isStartupAuditExecutionApprovedForExecution,
  listStartupAuditExecutions,
  persistStartupAuditExecutionDbReview,
  persistStartupAuditExecutionRepoReview,
  persistStartupAuditExecutionRiskReview,
  updateStartupAuditExecutionApproval,
  updateStartupAuditExecutionStatus,
} from './startup-audit-execution';
import { parseStartupOrchestratorDbReviewOutput } from './startup-orchestrator-db-review-contract';
import { parseStartupOrchestratorRepoReviewOutput } from './startup-orchestrator-repo-review-contract';
import { parseStartupOrchestratorRiskReviewOutput } from './startup-orchestrator-risk-review-contract';

describe('startup audit execution helpers', () => {
  it('enforces transition rules', () => {
    expect(
      canTransitionStartupAuditExecutionStatus({ from: 'received', to: 'planning' })
    ).toBe(true);
    expect(
      canTransitionStartupAuditExecutionStatus({ from: 'received', to: 'completed' })
    ).toBe(false);
    expect(
      canTransitionStartupAuditExecutionStatus({ from: 'plan_ready', to: 'waiting_manual' })
    ).toBe(true);
    expect(
      canTransitionStartupAuditExecutionStatus({ from: 'waiting_manual', to: 'plan_ready' })
    ).toBe(true);
    expect(
      canTransitionStartupAuditExecutionApprovalStatus({
        from: 'ready_for_review',
        to: 'approved_for_execution',
      })
    ).toBe(true);
    expect(
      canTransitionStartupAuditExecutionApprovalStatus({
        from: 'draft',
        to: 'approved_for_execution',
      })
    ).toBe(false);
  });

  it('creates an execution and initial event', async () => {
    const insertedExecutions: Array<Record<string, unknown>> = [];
    const insertedEvents: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedExecutions.push(payload);
              return this;
            },
            select() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-1',
                    startup_workspace_id: 'ws-1',
                    scan_id: null,
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: 'received',
                    summary: 'First execution',
                    error_message: null,
                    created_by_user_id: 'user-1',
                    completed_at: null,
                    metadata: { source: 'test' },
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedEvents.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const execution = await createStartupAuditExecution({
      supabase,
      startupWorkspaceId: 'ws-1',
      sourceKind: 'markdown_audit',
      sourceRef: 'audit://1',
      reportId: 'report-1',
      summary: 'First execution',
      createdByUserId: 'user-1',
      metadata: { source: 'test' },
    });

    expect(execution.status).toBe('received');
    expect(insertedExecutions[0]?.source_kind).toBe('markdown_audit');
    expect(insertedEvents[0]?.to_status).toBe('received');
  });

  it('lists executions newest first', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'startup_audit_executions') throw new Error(`Unexpected table ${table}`);
        return {
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
            return Promise.resolve({
              data: [
                {
                  id: 'exec-2',
                  startup_workspace_id: 'ws-1',
                  scan_id: null,
                  report_id: null,
                  source_kind: 'manual',
                  source_ref: null,
                  status: 'plan_ready',
                  summary: 'Latest',
                  error_message: null,
                  created_by_user_id: null,
                  completed_at: null,
                  metadata: {},
                  created_at: '2026-04-13T01:00:00.000Z',
                  updated_at: '2026-04-13T01:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const executions = await listStartupAuditExecutions({
      supabase,
      startupWorkspaceId: 'ws-1',
    });

    expect(executions).toHaveLength(1);
    expect(executions[0]?.status).toBe('plan_ready');
  });

  it('updates execution status and writes event history', async () => {
    const events: Array<Record<string, unknown>> = [];
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'exec-1',
                  startup_workspace_id: 'ws-1',
                  scan_id: null,
                  report_id: null,
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: 'received',
                  summary: 'Queued execution',
                  error_message: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  metadata: {},
                  created_at: '2026-04-13T00:00:00.000Z',
                  updated_at: '2026-04-13T00:00:00.000Z',
                },
                error: null,
              });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-1',
                    startup_workspace_id: 'ws-1',
                    scan_id: null,
                    report_id: null,
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: updatePayload?.status,
                    summary: updatePayload?.summary ?? 'Queued execution',
                    error_message: updatePayload?.error_message ?? null,
                    created_by_user_id: 'user-1',
                    completed_at: updatePayload?.completed_at ?? null,
                    metadata: updatePayload?.metadata ?? {},
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:10:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const execution = await updateStartupAuditExecutionStatus({
      supabase,
      executionId: 'exec-1',
      expectedWorkspaceId: 'ws-1',
      toStatus: 'planning',
      changedByUserId: 'user-2',
      note: 'Start planning',
      metadata: { planner: 'claude' },
    });

    expect(execution.status).toBe('planning');
    expect(events[0]?.from_status).toBe('received');
    expect(events[0]?.to_status).toBe('planning');
  });

  it('validates repo review artifacts', () => {
    const parsed = parseStartupOrchestratorRepoReviewOutput({
      contractVersion: 'startup_audit_repo_review_v1',
      summary: 'Repo review complete.',
      touchedAreas: ['app/dashboard/startup', 'lib/server/startup-audit-execution.ts'],
      likelyFiles: ['app/dashboard/startup/components/startup-audits-tab.tsx'],
      existingSystems: ['startup dashboard read model'],
      implementationSurface: ['startup audits UI', 'startup execution metadata'],
      recommendedLanes: ['dev', 'ops'],
      risks: ['Migrate schema before enabling workflow'],
    });

    expect(parsed.recommendedLanes).toEqual(['dev', 'ops']);
    expect(() =>
      parseStartupOrchestratorRepoReviewOutput({
        summary: '',
        touchedAreas: [],
        likelyFiles: [],
        implementationSurface: [],
        recommendedLanes: [],
      })
    ).toThrow();
  });

  it('persists repo review artifact onto execution metadata and event history', async () => {
    const events: Array<Record<string, unknown>> = [];
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'exec-2',
                  startup_workspace_id: 'ws-1',
                  scan_id: 'scan-1',
                  report_id: 'report-1',
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: 'planning',
                  summary: null,
                  error_message: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  metadata: {},
                  created_at: '2026-04-13T00:00:00.000Z',
                  updated_at: '2026-04-13T00:00:00.000Z',
                },
                error: null,
              });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-2',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: 'planning',
                    summary: updatePayload?.summary ?? null,
                    error_message: null,
                    created_by_user_id: 'user-1',
                    completed_at: null,
                    metadata: updatePayload?.metadata ?? {},
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:05:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await persistStartupAuditExecutionRepoReview({
      supabase,
      executionId: 'exec-2',
      expectedWorkspaceId: 'ws-1',
      changedByUserId: 'user-2',
      repoReview: {
        contractVersion: 'startup_audit_repo_review_v1',
        summary: 'Repo review complete.',
        touchedAreas: ['app/dashboard/startup', 'lib/server/startup-audit-execution.ts'],
        likelyFiles: [
          'app/dashboard/startup/components/startup-audits-tab.tsx',
          'lib/server/startup-audit-execution.ts',
        ],
        existingSystems: ['startup dashboard read model'],
        implementationSurface: ['startup audits UI', 'startup execution metadata'],
        recommendedLanes: ['dev', 'ops'],
        risks: ['Migrate schema before enabling workflow'],
      },
      metadata: { reviewer: 'gpt-5.4' },
    });

    expect(result.repoReview.likelyFiles).toHaveLength(2);
    expect(result.execution.repoReviewArtifact?.summary).toBe('Repo review complete.');
    expect(
      (result.execution.metadata['repo_review_artifact'] as Record<string, unknown>)?.['contractVersion']
    ).toBe('startup_audit_repo_review_v1');
    expect(events[0]?.from_status).toBe('planning');
    expect(events[0]?.to_status).toBe('planning');
    expect(events[0]?.metadata).toMatchObject({
      reviewer: 'gpt-5.4',
      repo_review_contract_version: 'startup_audit_repo_review_v1',
    });
  });

  it('validates DB review artifacts', () => {
    const parsed = parseStartupOrchestratorDbReviewOutput({
      contractVersion: 'startup_audit_db_review_v1',
      summary: 'DB review complete.',
      migrationRequired: true,
      backfillRequired: false,
      affectedTables: ['startup_implementation_plan_tasks'],
      schemaChanges: ['Add task execution columns'],
      manualActions: ['Run migration 040 in production'],
      risks: [{ title: 'Migration order', level: 'high', detail: 'Apply before planner execution.' }],
    });

    expect(parsed.migrationRequired).toBe(true);
    expect(() =>
      parseStartupOrchestratorDbReviewOutput({
        summary: '',
        migrationRequired: false,
        backfillRequired: false,
      })
    ).toThrow();
  });

  it('validates risk review artifacts', () => {
    const parsed = parseStartupOrchestratorRiskReviewOutput({
      contractVersion: 'startup_audit_risk_review_v1',
      summary: 'Risk review complete.',
      releaseRisk: 'medium',
      regressionAreas: ['startup dashboard audits tab'],
      externalDependencies: ['GitHub app installation'],
      manualChecks: ['Review rollout flags before enablement'],
      rolloutNotes: ['Keep auto_pr disabled'],
      blockers: [],
    });

    expect(parsed.releaseRisk).toBe('medium');
    expect(() =>
      parseStartupOrchestratorRiskReviewOutput({
        summary: '',
        releaseRisk: 'high',
      })
    ).toThrow();
  });

  it('persists DB review artifact onto execution metadata and event history', async () => {
    const events: Array<Record<string, unknown>> = [];
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'exec-3',
                  startup_workspace_id: 'ws-1',
                  scan_id: 'scan-1',
                  report_id: 'report-1',
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: 'planning',
                  summary: null,
                  error_message: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  metadata: {},
                  created_at: '2026-04-13T00:00:00.000Z',
                  updated_at: '2026-04-13T00:00:00.000Z',
                },
                error: null,
              });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-3',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: 'planning',
                    summary: updatePayload?.summary ?? null,
                    error_message: null,
                    created_by_user_id: 'user-1',
                    completed_at: null,
                    metadata: updatePayload?.metadata ?? {},
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:05:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await persistStartupAuditExecutionDbReview({
      supabase,
      executionId: 'exec-3',
      expectedWorkspaceId: 'ws-1',
      changedByUserId: 'user-2',
      dbReview: {
        contractVersion: 'startup_audit_db_review_v1',
        summary: 'DB review complete.',
        migrationRequired: true,
        backfillRequired: true,
        affectedTables: ['startup_implementation_plan_tasks'],
        schemaChanges: ['Add orchestration task fields'],
        manualActions: ['Run migration 040 in production'],
        risks: [{ title: 'Migration order', level: 'high', detail: 'Apply before planner execution.' }],
      },
      metadata: { reviewer: 'gpt-5.4-mini' },
    });

    expect(result.dbReview.migrationRequired).toBe(true);
    expect(result.execution.dbReviewArtifact?.backfillRequired).toBe(true);
    expect(events[0]?.metadata).toMatchObject({
      reviewer: 'gpt-5.4-mini',
      db_review_contract_version: 'startup_audit_db_review_v1',
      migration_required: true,
      backfill_required: true,
    });
  });

  it('persists risk review artifact onto execution metadata and event history', async () => {
    const events: Array<Record<string, unknown>> = [];
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'exec-4',
                  startup_workspace_id: 'ws-1',
                  scan_id: 'scan-1',
                  report_id: 'report-1',
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: 'planning',
                  summary: null,
                  error_message: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  metadata: {},
                  created_at: '2026-04-13T00:00:00.000Z',
                  updated_at: '2026-04-13T00:00:00.000Z',
                },
                error: null,
              });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-4',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: 'planning',
                    summary: updatePayload?.summary ?? null,
                    error_message: null,
                    created_by_user_id: 'user-1',
                    completed_at: null,
                    metadata: updatePayload?.metadata ?? {},
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:05:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await persistStartupAuditExecutionRiskReview({
      supabase,
      executionId: 'exec-4',
      expectedWorkspaceId: 'ws-1',
      changedByUserId: 'user-3',
      riskReview: {
        contractVersion: 'startup_audit_risk_review_v1',
        summary: 'Risk review complete.',
        releaseRisk: 'high',
        regressionAreas: ['startup audits tab', 'service control center'],
        externalDependencies: ['GitHub app installation'],
        manualChecks: ['Confirm rollout flags remain disabled'],
        rolloutNotes: ['Keep auto_pr disabled until approval flow exists'],
        blockers: ['Pending GitHub installation for workspace'],
      },
      metadata: { reviewer: 'claude-sonnet' },
    });

    expect(result.riskReview.releaseRisk).toBe('high');
    expect(result.execution.riskReviewArtifact?.blockers).toContain('Pending GitHub installation for workspace');
    expect(events[0]?.metadata).toMatchObject({
      reviewer: 'claude-sonnet',
      risk_review_contract_version: 'startup_audit_risk_review_v1',
      release_risk: 'high',
      blocker_count: 1,
    });
  });

  it('marks plan-ready executions ready for review and then approved for execution', async () => {
    const events: Array<Record<string, unknown>> = [];
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'exec-approval-1',
                  startup_workspace_id: 'ws-1',
                  scan_id: 'scan-1',
                  report_id: 'report-1',
                  source_kind: 'markdown_audit',
                  source_ref: 'audit://1',
                  status: 'plan_ready',
                  summary: 'Planner produced a task graph.',
                  error_message: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  metadata: {
                    approval_status: 'ready_for_review',
                    approval_requested_at: '2026-04-13T00:00:00.000Z',
                    approval_requested_by_user_id: 'user-1',
                  },
                  created_at: '2026-04-13T00:00:00.000Z',
                  updated_at: '2026-04-13T00:00:00.000Z',
                },
                error: null,
              });
            },
            update(payload: Record<string, unknown>) {
              updatePayload = payload;
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-approval-1',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://1',
                    status: 'plan_ready',
                    summary: 'Planner produced a task graph.',
                    error_message: null,
                    created_by_user_id: 'user-1',
                    completed_at: null,
                    metadata: updatePayload?.metadata ?? {},
                    created_at: '2026-04-13T00:00:00.000Z',
                    updated_at: '2026-04-13T00:05:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              events.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const approved = await updateStartupAuditExecutionApproval({
      supabase,
      executionId: 'exec-approval-1',
      expectedWorkspaceId: 'ws-1',
      toStatus: 'approved_for_execution',
      changedByUserId: 'founder-1',
      note: 'Approved from test',
    });

    expect(approved.approval.status).toBe('approved_for_execution');
    expect(approved.approval.approvedByUserId).toBe('founder-1');
    expect(isStartupAuditExecutionApprovedForExecution(approved)).toBe(true);
    expect(events[0]?.metadata).toMatchObject({
      approval_from_status: 'ready_for_review',
      approval_to_status: 'approved_for_execution',
    });
  });
});
