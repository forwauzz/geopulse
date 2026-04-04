import { describe, expect, it } from 'vitest';
import { createStartupAdminData } from './startup-admin-data';

describe('startup admin data timeline', () => {
  it('attaches startup timeline events per workspace with actor and summary metadata', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'startup_workspaces') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'ws-1',
                    workspace_key: 'acme',
                    name: 'Acme',
                    primary_domain: 'acme.com',
                    canonical_domain: 'acme.com',
                    status: 'pilot',
                    billing_mode: 'free',
                    metadata: {},
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_workspace_users') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'swu-1',
                    startup_workspace_id: 'ws-1',
                    user_id: 'user-1',
                    role: 'founder',
                    status: 'active',
                    metadata: {},
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'users') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ id: 'user-1', email: 'founder@acme.com' }],
                error: null,
              });
            },
          };
        }

        if (table === 'app_logs') {
          return {
            select() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    id: 'log-1',
                    level: 'info',
                    event: 'startup_recommendation_status_transitioned',
                    created_at: '2026-04-02T00:00:00.000Z',
                    data: {
                      startup_workspace_id: 'ws-1',
                      recommendation_id: 'rec-1',
                      from_status: 'approved',
                      to_status: 'in_progress',
                      changed_by_user_id: 'user-1',
                    },
                  },
                  {
                    id: 'log-2',
                    level: 'warning',
                    event: 'startup_service_gate_blocked',
                    created_at: '2026-04-02T00:01:00.000Z',
                    data: {
                      startup_workspace_id: 'ws-1',
                      service_key: 'agent_pr_execution',
                      blocked_reason: 'workspace_requires_paid_mode',
                      user_id: 'user-1',
                    },
                  },
                  {
                    id: 'log-3',
                    level: 'info',
                    event: 'distribution_job_dispatch_started',
                    created_at: '2026-04-02T00:02:00.000Z',
                    data: {},
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

    const data = createStartupAdminData(supabase);
    const workspaces = await data.getWorkspaces();

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.timeline).toHaveLength(2);
    expect(workspaces[0]?.rolloutFlags).toEqual({
      startupDashboard: true,
      githubAgent: true,
      autoPr: false,
      slackAgent: false,
      slackAutoPost: false,
    });
    expect(workspaces[0]?.timeline[0]).toMatchObject({
      event: 'startup_recommendation_status_transitioned',
      actorUserId: 'user-1',
    });
    expect(workspaces[0]?.timeline[1]).toMatchObject({
      event: 'startup_service_gate_blocked',
      actorUserId: 'user-1',
    });
  });
});
