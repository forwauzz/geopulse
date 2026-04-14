import { describe, expect, it } from 'vitest';
import { runStartupAuditPlanningWorkflow } from './startup-audit-planning-workflow';

type ExecutionRow = Record<string, unknown>;

describe('startup audit planning workflow', () => {
  it('runs repo/db/risk review persistence, creates a plan, and ends in plan_ready', async () => {
    const executionStore: ExecutionRow = {
      id: 'exec-1',
      startup_workspace_id: 'ws-1',
      scan_id: 'scan-1',
      report_id: 'report-1',
      source_kind: 'markdown_audit',
      source_ref: 'audit://1',
      status: 'received',
      summary: 'Queued planning run',
      error_message: null,
      created_by_user_id: 'user-1',
      completed_at: null,
      metadata: {},
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z',
    };

    const executionEvents: Array<Record<string, unknown>> = [];
    const insertedPlans: Array<Record<string, unknown>> = [];
    const insertedTasks: Array<Array<Record<string, unknown>>> = [];

    const serviceIdsByKey: Record<string, string> = {
      startup_audit_orchestrator: 'svc-planner',
      startup_audit_repo_review: 'svc-repo',
      startup_audit_db_review: 'svc-db',
      startup_audit_risk_review: 'svc-risk',
      startup_audit_execution: 'svc-exec',
      startup_audit_pr_summary: 'svc-summary',
    };

    const modelPoliciesByServiceId: Record<string, Record<string, unknown>> = {
      'svc-planner': {
        service_id: 'svc-planner',
        scope_type: 'service_default',
        provider_name: 'anthropic',
        model_id: 'claude-opus',
        max_cost_usd: 0.2,
        fallback_provider_name: 'openai',
        fallback_model_id: 'gpt-5.4',
        is_active: true,
      },
      'svc-repo': {
        service_id: 'svc-repo',
        scope_type: 'service_default',
        provider_name: 'openai',
        model_id: 'gpt-5.4',
        max_cost_usd: 0.08,
        fallback_provider_name: 'openai',
        fallback_model_id: 'gpt-5.4-mini',
        is_active: true,
      },
      'svc-db': {
        service_id: 'svc-db',
        scope_type: 'service_default',
        provider_name: 'openai',
        model_id: 'gpt-5.4-mini',
        max_cost_usd: 0.04,
        fallback_provider_name: 'gemini',
        fallback_model_id: 'gemini-2.0-flash-lite',
        is_active: true,
      },
      'svc-risk': {
        service_id: 'svc-risk',
        scope_type: 'service_default',
        provider_name: 'anthropic',
        model_id: 'claude-sonnet',
        max_cost_usd: 0.05,
        fallback_provider_name: 'openai',
        fallback_model_id: 'gpt-5.4-mini',
        is_active: true,
      },
      'svc-exec': {
        service_id: 'svc-exec',
        scope_type: 'service_default',
        provider_name: 'openai',
        model_id: 'gpt-5.3-codex',
        max_cost_usd: 0.1,
        fallback_provider_name: 'openai',
        fallback_model_id: 'gpt-5.4-mini',
        is_active: true,
      },
      'svc-summary': {
        service_id: 'svc-summary',
        scope_type: 'service_default',
        provider_name: 'openai',
        model_id: 'gpt-5.4-mini',
        max_cost_usd: 0.02,
        fallback_provider_name: 'gemini',
        fallback_model_id: 'gemini-2.0-flash-lite',
        is_active: true,
      },
    };

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
              return Promise.resolve({ data: executionStore, error: null });
            },
            update(payload: Record<string, unknown>) {
              Object.assign(executionStore, payload, {
                updated_at: '2026-04-13T00:10:00.000Z',
              });
              return this;
            },
            limit() {
              return Promise.resolve({ data: [executionStore], error: null });
            },
          };
        }

        if (table === 'startup_audit_execution_events') {
          return {
            insert(payload: Record<string, unknown>) {
              executionEvents.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        if (table === 'startup_workspaces') {
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
                  default_bundle_id: 'bundle-dev',
                  billing_mode: 'paid',
                },
                error: null,
              });
            },
          };
        }

        if (table === 'service_bundles') {
          const filters: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            maybeSingle() {
              if (filters['id'] === 'bundle-dev' || filters['bundle_key'] === 'startup_dev') {
                return Promise.resolve({
                  data: { id: 'bundle-dev', bundle_key: 'startup_dev' },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        }

        if (table === 'service_catalog') {
          const filters: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            maybeSingle() {
              const serviceKey = String(filters['service_key'] ?? '');
              return Promise.resolve({
                data: serviceIdsByKey[serviceKey] ? { id: serviceIdsByKey[serviceKey] } : null,
                error: null,
              });
            },
          };
        }

        if (table === 'service_model_policies') {
          const filters: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            maybeSingle() {
              const serviceId = String(filters['service_id'] ?? '');
              return Promise.resolve({
                data: modelPoliciesByServiceId[serviceId] ?? null,
                error: null,
              });
            },
          };
        }

        if (table === 'startup_implementation_plans') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPlans.push(payload);
              return this;
            },
            select() {
              return this;
            },
            limit() {
              return Promise.resolve({ data: [{ id: 'plan-1' }], error: null });
            },
          };
        }

        if (table === 'startup_implementation_plan_tasks') {
          return {
            insert(payload: Array<Record<string, unknown>>) {
              insertedTasks.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await runStartupAuditPlanningWorkflow({
      supabase,
      executionId: 'exec-1',
      changedByUserId: 'user-2',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
      repoReview: {
        contractVersion: 'startup_audit_repo_review_v1',
        summary: 'Repo review complete.',
        touchedAreas: ['app/dashboard/startup'],
        likelyFiles: ['app/dashboard/startup/components/startup-audits-tab.tsx'],
        existingSystems: ['startup dashboard read model'],
        implementationSurface: ['startup audits tab'],
        recommendedLanes: ['dev'],
        risks: ['Keep audit and plan UI aligned'],
      },
      dbReview: {
        contractVersion: 'startup_audit_db_review_v1',
        summary: 'DB review complete.',
        migrationRequired: true,
        backfillRequired: false,
        affectedTables: ['startup_implementation_plan_tasks'],
        schemaChanges: ['Add task execution columns'],
        manualActions: ['Run migration 040'],
        risks: [{ title: 'Migration order', level: 'high', detail: 'Apply before execution.' }],
      },
      riskReview: {
        contractVersion: 'startup_audit_risk_review_v1',
        summary: 'Risk review complete.',
        releaseRisk: 'medium',
        regressionAreas: ['startup dashboard tabs'],
        externalDependencies: ['GitHub installation'],
        manualChecks: ['Check rollout flags'],
        rolloutNotes: ['Keep auto_pr disabled'],
        blockers: [],
      },
      plannerOutput: {
        contractVersion: 'startup_audit_planner_v1',
        summary: 'Execution plan ready.',
        touchedAreas: ['app/dashboard/startup', 'lib/server/startup-implementation-plan.ts'],
        risks: [{ title: 'Migration order', severity: 'high', detail: 'Apply before execution.' }],
        manualActions: [
          {
            title: 'Run migration',
            instructions: 'Apply migration 040 before enabling execution.',
            teamLane: 'ops',
            evidenceRequired: ['Migration output'],
            artifactRefs: ['migration://040'],
          },
        ],
        tasks: [
          {
            teamLane: 'dev',
            title: 'Persist planner artifact',
            detail: 'Store planner output and linked review artifacts.',
            priority: 'high',
            taskKind: 'implementation',
            executionMode: 'approval_required',
            acceptanceCriteria: ['Plan metadata saved'],
            evidenceRequired: ['DB row'],
            artifactRefs: ['execution://1'],
            agentRole: 'execution_worker',
          },
        ],
      },
    });

    expect(result.execution.status).toBe('plan_ready');
    expect(result.plan).toEqual({
      id: 'plan-1',
      taskCount: 1,
      summary: 'Execution plan ready.',
    });
    expect(result.modelPolicies.planner.effectiveModel).toBe('claude-opus');
    expect(insertedPlans[0]?.['source_kind']).toBe('agent');
    expect((executionStore['metadata'] as Record<string, unknown>)['plan_id']).toBe('plan-1');
    expect((executionStore['metadata'] as Record<string, unknown>)['planner_summary']).toBe('Execution plan ready.');
    expect((executionStore['metadata'] as Record<string, unknown>)['approval_status']).toBe('ready_for_review');
    expect(executionEvents.some((event) => event['to_status'] === 'planning')).toBe(true);
    expect(executionEvents.some((event) => event['to_status'] === 'plan_ready')).toBe(true);
    expect(
      executionEvents.some(
        (event) => (event['metadata'] as Record<string, unknown> | undefined)?.['approval_to_status'] === 'ready_for_review'
      )
    ).toBe(true);
  });
});
