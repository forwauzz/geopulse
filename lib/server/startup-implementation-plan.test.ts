import { describe, expect, it } from 'vitest';
import {
  buildStartupImplementationLaneCards,
  createStartupImplementationPlanFromMarkdownAudit,
  getLatestStartupImplementationPlan,
  parseMarkdownAuditImplementationTasks,
} from './startup-implementation-plan';

describe('startup implementation plan helpers', () => {
  it('parses markdown audit bullets into lane tasks', () => {
    const markdown = [
      '## Founder',
      '- [high] Tighten KPI ownership per sprint - Assign one owner',
      '## Dev',
      '- [dev] [critical] Close sitemap and robots mismatch - Update robots directives',
      '## Content',
      '- [content] Refresh top 3 intent pages confidence:80%',
      '## Ops',
      '- [ops] Add weekly regression checklist',
    ].join('\n');

    const items = parseMarkdownAuditImplementationTasks(markdown);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ teamLane: 'founder', priority: 'high' });
    expect(items[1]).toMatchObject({ teamLane: 'dev', priority: 'critical' });
    expect(items[2]?.confidence).toBe(0.8);
    expect(items[3]).toMatchObject({ teamLane: 'ops' });
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
                  title: 'Fix schema',
                  detail: null,
                  priority: 'high',
                  confidence: 0.9,
                  evidence: {},
                  status: 'todo',
                  sort_order: 0,
                  created_at: '2026-04-04T00:00:00.000Z',
                },
                {
                  id: 'task-2',
                  recommendation_id: null,
                  team_lane: 'ops',
                  title: 'Add monitor',
                  detail: null,
                  priority: 'medium',
                  confidence: null,
                  evidence: {},
                  status: 'done',
                  sort_order: 1,
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
    expect(plan?.tasks).toHaveLength(2);

    const cards = buildStartupImplementationLaneCards(plan);
    expect(cards.find((card) => card.lane === 'dev')?.open).toBe(1);
    expect(cards.find((card) => card.lane === 'ops')?.done).toBe(1);
  });
});
