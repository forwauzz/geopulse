import { describe, expect, it } from 'vitest';
import { getStartupDashboardData } from './startup-dashboard-data';

describe('getStartupDashboardData', () => {
  it('hydrates the selected startup workspace context', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'startup_workspace_users') {
          let eqCount = 0;
          return {
            select() {
              return this;
            },
            eq() {
              eqCount += 1;
              if (eqCount < 2) return this;
              return Promise.resolve({
                data: [{ startup_workspace_id: 'ws-1', role: 'founder', status: 'active' }],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_workspaces') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'ws-1',
                    workspace_key: 'acme',
                    name: 'Acme',
                    canonical_domain: 'acme.com',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'scans') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'scan-1',
                    startup_workspace_id: 'ws-1',
                    url: 'https://acme.com',
                    domain: 'acme.com',
                    score: 88,
                    letter_grade: 'B+',
                    created_at: '2026-04-04T00:00:00.000Z',
                    run_source: 'startup_dashboard',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'reports') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'report-1',
                    scan_id: 'scan-1',
                    startup_workspace_id: 'ws-1',
                    type: 'deep_audit',
                    email_delivered_at: '2026-04-04T01:00:00.000Z',
                    pdf_generated_at: '2026-04-04T00:30:00.000Z',
                    pdf_url: 'https://example.com/report.pdf',
                    created_at: '2026-04-04T00:20:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_recommendations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'rec-1',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://scan-1',
                    title: 'Fix schema gaps',
                    summary: 'Add FAQ schema.',
                    team_lane: 'dev',
                    priority: 'high',
                    status: 'suggested',
                    status_changed_at: '2026-04-04T00:25:00.000Z',
                    status_reason: null,
                    status_updated_by_user_id: null,
                    created_at: '2026-04-04T00:25:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'exec-1',
                    startup_workspace_id: 'ws-1',
                    scan_id: 'scan-1',
                    report_id: 'report-1',
                    source_kind: 'markdown_audit',
                    source_ref: 'audit://scan-1',
                    status: 'plan_ready',
                    summary: 'Planner produced a task graph.',
                    error_message: null,
                    metadata: {
                      approval_status: 'ready_for_review',
                      approval_requested_at: '2026-04-04T00:46:00.000Z',
                    },
                    completed_at: null,
                    created_at: '2026-04-04T00:40:00.000Z',
                    updated_at: '2026-04-04T00:45:00.000Z',
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

    const data = await getStartupDashboardData({
      supabase,
      userId: 'user-1',
      selectedWorkspaceId: 'ws-1',
    });

    expect(data.selectedWorkspaceId).toBe('ws-1');
    expect(data.workspaces).toHaveLength(1);
    expect(data.workspaces[0]?.role).toBe('founder');
    expect(data.scans[0]?.runSource).toBe('startup_dashboard');
    expect(data.reports[0]?.scanId).toBe('scan-1');
    expect(data.reports[0]?.createdAt).toBe('2026-04-04T00:20:00.000Z');
    expect(data.recommendations[0]?.status).toBe('suggested');
    expect(data.recommendations[0]?.sourceKind).toBe('markdown_audit');
    expect(data.recommendations[0]?.statusUpdatedByUserId).toBe(null);
    expect(data.executions[0]?.status).toBe('plan_ready');
    expect(data.executions[0]?.summary).toBe('Planner produced a task graph.');
    expect(data.executions[0]?.approvalStatus).toBe('ready_for_review');
    expect(data.executions[0]?.approvalRequestedAt).toBe('2026-04-04T00:46:00.000Z');
  });

  it('falls back to first workspace when selected id is invalid', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'startup_workspace_users') {
          let eqCount = 0;
          return {
            select() {
              return this;
            },
            eq() {
              eqCount += 1;
              if (eqCount < 2) return this;
              return Promise.resolve({
                data: [{ startup_workspace_id: 'ws-1', role: 'member', status: 'active' }],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_workspaces') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'ws-1',
                    workspace_key: 'acme',
                    name: 'Acme',
                    canonical_domain: null,
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'scans') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        }

        if (table === 'reports') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        }

        if (table === 'startup_recommendations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        }

        if (table === 'startup_audit_executions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const data = await getStartupDashboardData({
      supabase,
      userId: 'user-1',
      selectedWorkspaceId: 'does-not-exist',
    });

    expect(data.selectedWorkspaceId).toBe('ws-1');
    expect(data.workspaces[0]?.workspaceKey).toBe('acme');
    expect(data.executions).toEqual([]);
  });
});
