import { describe, expect, it } from 'vitest';
import {
  buildStartupImplementationLaneCards,
  canTransitionStartupImplementationTaskStatus,
  createStartupImplementationPlanFromMarkdownAudit,
  createStartupImplementationPlanFromPlannerOutput,
  getStartupImplementationPlanTask,
  getLatestStartupImplementationPlan,
  listStartupImplementationPlanTasks,
  parseMarkdownAuditImplementationTasks,
  updateStartupImplementationPlanTaskStatus,
} from './startup-implementation-plan';
import { parseStartupOrchestratorPlannerOutput } from './startup-orchestrator-plan-contract';

describe('startup implementation plan helpers', () => {
  it('parses markdown audit bullets into lane tasks', () => {
    const markdown = [
      '## Founder',
      '- [high] Tighten KPI ownership per sprint - Assign one owner',
      '## Dev',
      '- [dev] [critical] Close sitemap and robots mismatch - Update robots directives',
      '## Content',
      '- [content] [mode:auto] [task:verification] [role:qa_verification] [accept:Publish updated copy|Confirm SERP snippet] [evidence:Before screenshot|After screenshot] [artifacts:doc://content-brief] Refresh top 3 intent pages confidence:80%',
      '## Ops',
      '- [ops] [mode:manual] [task:manual_action] [manual:Run migration in production] Add weekly regression checklist',
    ].join('\n');

    const items = parseMarkdownAuditImplementationTasks(markdown);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ teamLane: 'founder', priority: 'high' });
    expect(items[1]).toMatchObject({ teamLane: 'dev', priority: 'critical' });
    expect(items[2]?.confidence).toBe(0.8);
    expect(items[2]).toMatchObject({
      teamLane: 'content',
      executionMode: 'auto',
      taskKind: 'verification',
      agentRole: 'qa_verification',
    });
    expect(items[2]?.acceptanceCriteria).toEqual(['Publish updated copy', 'Confirm SERP snippet']);
    expect(items[2]?.evidenceRequired).toEqual(['Before screenshot', 'After screenshot']);
    expect(items[2]?.artifactRefs).toEqual(['doc://content-brief']);
    expect(items[3]).toMatchObject({
      teamLane: 'ops',
      executionMode: 'manual',
      taskKind: 'manual_action',
      manualInstructions: 'Run migration in production',
    });
  });

  it('creates plan + tasks from markdown audit input', async () => {
    const insertedPlans: Array<Record<string, unknown>> = [];
    const insertedTasks: Array<Array<Record<string, unknown>>> = [];

    const supabase = {
      from(table: string) {
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

    const result = await createStartupImplementationPlanFromMarkdownAudit({
      supabase,
      startupWorkspaceId: 'ws-1',
      markdownAuditRef: 'audit://1',
      markdown: '- [dev] [high] Fix schema drift\n- [ops] Add monitor',
      summary: 'Sprint implementation plan',
    });

    expect(result).toEqual({ planId: 'plan-1', taskCount: 2 });
    expect(insertedPlans).toHaveLength(1);
    expect(insertedTasks[0]?.[0]?.team_lane).toBe('dev');
    expect(insertedTasks[0]?.[1]?.team_lane).toBe('ops');
    expect(insertedTasks[0]?.[0]?.execution_mode).toBe('approval_required');
    expect(insertedTasks[0]?.[0]?.acceptance_criteria).toEqual([]);
    expect(insertedTasks[0]?.[0]?.artifact_refs).toEqual([]);
  });

  it('validates orchestrator planner output and rejects missing contract fields', () => {
    const parsed = parseStartupOrchestratorPlannerOutput({
      contractVersion: 'startup_audit_planner_v1',
      summary: 'Plan the first execution slice.',
      touchedAreas: ['app/dashboard/startup', 'lib/server/startup-implementation-plan.ts'],
      risks: [{ title: 'Migration ordering', severity: 'high', detail: 'Apply schema before execution.' }],
      manualActions: [
        {
          title: 'Run migration',
          instructions: 'Apply the migration before enabling orchestration.',
          teamLane: 'ops',
        },
      ],
      tasks: [
        {
          teamLane: 'dev',
          title: 'Persist planner output',
          detail: 'Save the planner artifact into plan metadata.',
        },
      ],
    });

    expect(parsed.tasks[0]?.executionMode).toBe('approval_required');
    expect(parsed.manualActions[0]?.teamLane).toBe('ops');

    expect(() =>
      parseStartupOrchestratorPlannerOutput({
        summary: '',
        touchedAreas: [],
        tasks: [],
      })
    ).toThrow();
  });

  it('creates plan + tasks from orchestrator planner output', async () => {
    const insertedPlans: Array<Record<string, unknown>> = [];
    const insertedTasks: Array<Array<Record<string, unknown>>> = [];

    const supabase = {
      from(table: string) {
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
              return Promise.resolve({ data: [{ id: 'plan-2' }], error: null });
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

    const result = await createStartupImplementationPlanFromPlannerOutput({
      supabase,
      startupWorkspaceId: 'ws-1',
      sourceRef: 'execution://1',
      executionId: 'exec-1',
      plannerModelPolicy: {
        effective_provider: 'anthropic',
        effective_model: 'claude-opus',
      },
      plannerOutput: {
        contractVersion: 'startup_audit_planner_v1',
        summary: 'Repo-aware execution plan ready.',
        touchedAreas: ['app/dashboard/startup', 'lib/server/startup-implementation-plan.ts'],
        risks: [{ title: 'Migration ordering', severity: 'high', detail: 'Apply schema before execution.' }],
        manualActions: [
          {
            title: 'Run migration',
            instructions: 'Apply the migration before enabling orchestration.',
            teamLane: 'ops',
            evidenceRequired: ['Migration output'],
            artifactRefs: ['migration://040'],
          },
        ],
        tasks: [
          {
            teamLane: 'dev',
            title: 'Persist planner artifact',
            detail: 'Store the planner artifact in plan metadata.',
            priority: 'high',
            taskKind: 'implementation',
            executionMode: 'approval_required',
            acceptanceCriteria: ['Planner artifact saved'],
            evidenceRequired: ['Database row'],
            artifactRefs: ['execution://1'],
            agentRole: 'execution_worker',
          },
          {
            teamLane: 'ops',
            title: 'Run migration',
            detail: 'Apply migration 040 before execution.',
            taskKind: 'manual_action',
            executionMode: 'manual',
            manualInstructions: 'Run the SQL migration in production.',
            agentRole: 'manual_operator',
          },
        ],
      },
    });

    expect(result.planId).toBe('plan-2');
    expect(result.taskCount).toBe(2);
    expect(insertedPlans[0]?.['source_kind']).toBe('agent');
    expect((insertedPlans[0]?.['metadata'] as Record<string, unknown>)?.['execution_id']).toBe('exec-1');
    expect(
      ((insertedPlans[0]?.['metadata'] as Record<string, unknown>)?.['planner_artifact'] as Record<string, unknown>)?.[
        'contract_version'
      ]
    ).toBe('startup_audit_planner_v1');
    expect(insertedTasks[0]?.[0]?.['acceptance_criteria']).toEqual(['Planner artifact saved']);
    expect(insertedTasks[0]?.[1]?.['execution_mode']).toBe('manual');
    expect(insertedTasks[0]?.[1]?.['manual_instructions']).toBe('Run the SQL migration in production.');
  });

  it('loads latest plan and computes lane cards', async () => {
    const supabase = {
      from(table: string) {
      if (table === 'startup_implementation_plans') {
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
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'plan-1',
                startup_workspace_id: 'ws-1',
                scan_id: null,
                report_id: null,
                source_kind: 'markdown_audit',
                source_ref: 'audit://1',
                status: 'ready',
                summary: 'Latest plan',
                metadata: {
                  execution_id: 'exec-1',
                  planner_artifact: {
                    contract_version: 'startup_audit_planner_v1',
                    touched_areas: ['app/dashboard/startup'],
                    risks: [{ title: 'Ordering', severity: 'medium', detail: 'Run in sequence.' }],
                    manual_actions: [
                      {
                        title: 'Run migration',
                        instructions: 'Apply SQL first.',
                        teamLane: 'ops',
                        evidenceRequired: ['Migration output'],
                        artifactRefs: ['migration://040'],
                      },
                    ],
                  },
                },
                created_at: '2026-04-04T00:00:00.000Z',
              },
              error: null,
            });
          },
        };
      }
      if (table === 'startup_implementation_plan_tasks') {
        let orderCalls = 0;
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            orderCalls += 1;
            if (orderCalls === 1) return this;
            return Promise.resolve({
              data: [
                {
                  id: 'task-1',
                  recommendation_id: null,
                  team_lane: 'dev',
                  task_kind: 'implementation',
                  title: 'Fix schema',
                  detail: null,
                  priority: 'high',
                  confidence: 0.9,
                  evidence: {},
                  execution_mode: 'approval_required',
                  depends_on_task_ids: [],
                  acceptance_criteria: ['Ship migration'],
                  evidence_required: ['Migration output'],
                  artifact_refs: ['audit://1'],
                  status: 'todo',
                  sort_order: 0,
                  blocked_reason: null,
                  agent_role: 'execution_worker',
                  manual_instructions: null,
                  created_at: '2026-04-04T00:00:00.000Z',
                },
                {
                  id: 'task-2',
                  recommendation_id: null,
                  team_lane: 'ops',
                  task_kind: 'manual_action',
                  title: 'Add monitor',
                  detail: null,
                  priority: 'medium',
                  confidence: null,
                  evidence: {},
                  execution_mode: 'manual',
                  depends_on_task_ids: ['task-1'],
                  acceptance_criteria: [],
                  evidence_required: ['Screenshot'],
                  artifact_refs: [],
                  status: 'done',
                  sort_order: 1,
                  blocked_reason: null,
                  agent_role: 'manual_operator',
                  manual_instructions: 'Confirm cron in production',
                  created_at: '2026-04-04T00:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    } as any;

    const plan = await getLatestStartupImplementationPlan({
      supabase,
      startupWorkspaceId: 'ws-1',
    });
    expect(plan?.id).toBe('plan-1');
    expect(plan?.executionId).toBe('exec-1');
    expect(plan?.tasks).toHaveLength(2);
    expect(plan?.plannerArtifact).toMatchObject({
      contractVersion: 'startup_audit_planner_v1',
      touchedAreas: ['app/dashboard/startup'],
    });
    expect(plan?.tasks[0]).toMatchObject({
      taskKind: 'implementation',
      executionMode: 'approval_required',
      acceptanceCriteria: ['Ship migration'],
      evidenceRequired: ['Migration output'],
      artifactRefs: ['audit://1'],
      agentRole: 'execution_worker',
    });
    expect(plan?.tasks[1]).toMatchObject({
      taskKind: 'manual_action',
      executionMode: 'manual',
      dependsOnTaskIds: ['task-1'],
      evidenceRequired: ['Screenshot'],
      agentRole: 'manual_operator',
      manualInstructions: 'Confirm cron in production',
    });

    const cards = buildStartupImplementationLaneCards(plan);
    expect(cards.find((card) => card.lane === 'dev')?.open).toBe(1);
    expect(cards.find((card) => card.lane === 'ops')?.done).toBe(1);
  });

  it('enforces implementation task status transitions', () => {
    expect(canTransitionStartupImplementationTaskStatus({ from: 'todo', to: 'blocked' })).toBe(true);
    expect(canTransitionStartupImplementationTaskStatus({ from: 'blocked', to: 'done' })).toBe(true);
    expect(canTransitionStartupImplementationTaskStatus({ from: 'done', to: 'todo' })).toBe(false);
  });

  it('updates implementation task status and resolves execution linkage', async () => {
    let updatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'startup_implementation_plan_tasks') {
          let orderCalls = 0;
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
                  id: 'task-2',
                  plan_id: 'plan-1',
                  recommendation_id: null,
                  team_lane: 'ops',
                  task_kind: 'manual_action',
                  title: 'Run migration',
                  detail: 'Apply schema first.',
                  priority: 'critical',
                  confidence: null,
                  evidence: {},
                  execution_mode: 'manual',
                  depends_on_task_ids: ['task-1'],
                  acceptance_criteria: [],
                  evidence_required: ['Migration output'],
                  artifact_refs: ['migration://042'],
                  status: 'todo',
                  sort_order: 1,
                  blocked_reason: null,
                  agent_role: 'manual_operator',
                  manual_instructions: 'Run migration 042 in production.',
                  created_at: '2026-04-04T00:00:00.000Z',
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
                    id: 'task-2',
                    plan_id: 'plan-1',
                    recommendation_id: null,
                    team_lane: 'ops',
                    task_kind: 'manual_action',
                    title: 'Run migration',
                    detail: 'Apply schema first.',
                    priority: 'critical',
                    confidence: null,
                    evidence: {},
                    execution_mode: 'manual',
                    depends_on_task_ids: ['task-1'],
                    acceptance_criteria: [],
                    evidence_required: ['Migration output'],
                    artifact_refs: ['migration://042'],
                    status: updatePayload?.status ?? 'todo',
                    sort_order: 1,
                    blocked_reason: updatePayload?.blocked_reason ?? null,
                    agent_role: 'manual_operator',
                    manual_instructions: 'Run migration 042 in production.',
                    created_at: '2026-04-04T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
            order() {
              orderCalls += 1;
              if (orderCalls === 1) return this;
              return Promise.resolve({
                data: [
                  {
                    id: 'task-2',
                    plan_id: 'plan-1',
                    recommendation_id: null,
                    team_lane: 'ops',
                    task_kind: 'manual_action',
                    title: 'Run migration',
                    detail: 'Apply schema first.',
                    priority: 'critical',
                    confidence: null,
                    evidence: {},
                    execution_mode: 'manual',
                    depends_on_task_ids: ['task-1'],
                    acceptance_criteria: [],
                    evidence_required: ['Migration output'],
                    artifact_refs: ['migration://042'],
                    status: 'blocked',
                    sort_order: 1,
                    blocked_reason: 'Waiting on production migration',
                    agent_role: 'manual_operator',
                    manual_instructions: 'Run migration 042 in production.',
                    created_at: '2026-04-04T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }
        if (table === 'startup_implementation_plans') {
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
                  id: 'plan-1',
                  startup_workspace_id: 'ws-1',
                  metadata: {
                    execution_id: 'exec-1',
                  },
                },
                error: null,
              });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const task = await getStartupImplementationPlanTask({
      supabase,
      taskId: 'task-2',
      expectedWorkspaceId: 'ws-1',
    });
    expect(task.executionId).toBe('exec-1');

    const updated = await updateStartupImplementationPlanTaskStatus({
      supabase,
      taskId: 'task-2',
      expectedWorkspaceId: 'ws-1',
      toStatus: 'blocked',
      blockedReason: 'Waiting on production migration',
      changedByUserId: 'founder-1',
    });
    expect(updated.status).toBe('blocked');
    expect(updated.blockedReason).toBe('Waiting on production migration');

    const tasks = await listStartupImplementationPlanTasks({
      supabase,
      planId: 'plan-1',
    });
    expect(tasks[0]?.status).toBe('blocked');
  });
});
