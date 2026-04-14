import { describe, expect, it, vi } from 'vitest';
import { runScheduledStartupSlackAutoPost } from './startup-slack-schedule';

type Fixtures = {
  workspaces: Array<{
    id: string;
    primary_domain: string | null;
    canonical_domain: string | null;
    metadata: Record<string, unknown> | null;
    status: string;
  }>;
  latestReportByWorkspace: Record<string, { id: string; created_at: string } | null>;
  latestAutoScanByWorkspace: Record<string, { id: string; created_at: string } | null>;
  workspaceMembersByWorkspace: Record<string, Array<{ user_id: string; role: string }>>;
  usersById: Record<string, { id: string; email: string | null }>;
};

function createSupabaseStub(fixtures: Fixtures) {
  const insertedScans: Array<Record<string, unknown>> = [];

  class Query {
    private mode: 'select' | 'insert' = 'select';
    private filters: Record<string, unknown> = {};
    private inFilters: Record<string, unknown[]> = {};
    private containsFilters: Record<string, unknown> = {};
    private insertPayload: Record<string, unknown> | null = null;

    constructor(private readonly table: string) {}

    select(_columns: string): this {
      if (this.mode !== 'insert') {
        this.mode = 'select';
      }
      return this;
    }

    insert(payload: Record<string, unknown>): this {
      this.mode = 'insert';
      this.insertPayload = payload;
      return this;
    }

    eq(key: string, value: unknown): this {
      this.filters[key] = value;
      return this;
    }

    in(key: string, value: unknown[]): this {
      this.inFilters[key] = value;
      return this;
    }

    contains(key: string, value: unknown): this {
      this.containsFilters[key] = value;
      return this;
    }

    order(_column: string, _opts: Record<string, unknown>): this {
      return this;
    }

    limit(_value: number): this {
      return this;
    }

    async maybeSingle(): Promise<{ data: any; error: null }> {
      const { data } = await this.exec();
      if (Array.isArray(data)) {
        return { data: data[0] ?? null, error: null };
      }
      return { data: data ?? null, error: null };
    }

    async single(): Promise<{ data: any; error: null }> {
      const { data } = await this.exec();
      if (Array.isArray(data)) {
        return { data: data[0] ?? null, error: null };
      }
      return { data: data ?? null, error: null };
    }

    then<TResult1 = { data: any; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return this.exec().then(onfulfilled as any, onrejected as any);
    }

    private async exec(): Promise<{ data: any; error: null }> {
      if (this.mode === 'insert') {
        if (this.table === 'scans') {
          insertedScans.push(this.insertPayload ?? {});
          return {
            data: [{ id: `scan-${insertedScans.length}` }],
            error: null,
          };
        }
        return { data: null, error: null };
      }

      if (this.table === 'startup_workspaces') {
        return { data: fixtures.workspaces, error: null };
      }

      if (this.table === 'reports') {
        const workspaceId = String(this.filters['startup_workspace_id'] ?? '');
        return {
          data: fixtures.latestReportByWorkspace[workspaceId] ?? null,
          error: null,
        };
      }

      if (this.table === 'scans') {
        const workspaceId = String(this.filters['startup_workspace_id'] ?? '');
        if (this.containsFilters['full_results_json']) {
          return {
            data: fixtures.latestAutoScanByWorkspace[workspaceId] ?? null,
            error: null,
          };
        }
        return { data: null, error: null };
      }

      if (this.table === 'startup_workspace_users') {
        const workspaceId = String(this.filters['startup_workspace_id'] ?? '');
        return {
          data: fixtures.workspaceMembersByWorkspace[workspaceId] ?? [],
          error: null,
        };
      }

      if (this.table === 'users') {
        const ids = (this.inFilters['id'] ?? []) as string[];
        const rows = ids
          .map((id) => fixtures.usersById[id])
          .filter((item): item is { id: string; email: string | null } => !!item);
        return { data: rows, error: null };
      }

      return { data: null, error: null };
    }
  }

  const supabase = {
    from(table: string) {
      return new Query(table);
    },
  };

  return {
    supabase,
    insertedScans,
  };
}

const baseEnv = {
  SCAN_QUEUE: { send: vi.fn() },
  STARTUP_SLACK_AUTO_POST_INTERVAL_DAYS: '30',
  STARTUP_SLACK_AUTO_POST_BATCH_LIMIT: '20',
} as any;

describe('runScheduledStartupSlackAutoPost', () => {
  it('returns disabled when SCAN_QUEUE is missing', async () => {
    const { supabase } = createSupabaseStub({
      workspaces: [],
      latestReportByWorkspace: {},
      latestAutoScanByWorkspace: {},
      workspaceMembersByWorkspace: {},
      usersById: {},
    });

    const summary = await runScheduledStartupSlackAutoPost({
      supabase: supabase as any,
      env: { ...baseEnv, SCAN_QUEUE: undefined } as any,
    });

    expect(summary).toEqual({
      status: 'disabled',
      examinedWorkspaces: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it('queues a due workspace when auto-post is enabled and recipient exists', async () => {
    const now = new Date('2026-04-05T00:00:00.000Z');
    const { supabase, insertedScans } = createSupabaseStub({
      workspaces: [
        {
          id: 'ws-1',
          primary_domain: 'acme.com',
          canonical_domain: 'acme.com',
          metadata: {
            rollout_flags: {
              startup_dashboard: true,
              slack_agent: true,
              slack_auto_post: true,
            },
          },
          status: 'active',
        },
      ],
      latestReportByWorkspace: {
        'ws-1': { id: 'report-1', created_at: '2026-03-01T00:00:00.000Z' },
      },
      latestAutoScanByWorkspace: {},
      workspaceMembersByWorkspace: {
        'ws-1': [{ user_id: 'user-1', role: 'founder' }],
      },
      usersById: {
        'user-1': { id: 'user-1', email: 'founder@acme.com' },
      },
    });

    const ensureSpy = vi.fn().mockResolvedValue({ ok: true, duplicate: false });

    const summary = await runScheduledStartupSlackAutoPost({
      supabase: supabase as any,
      env: baseEnv as any,
      deps: {
        now: () => now,
        ensureDeepAuditJobQueued: ensureSpy as any,
      },
    });

    expect(summary).toEqual({
      status: 'completed',
      examinedWorkspaces: 1,
      queued: 1,
      skipped: 0,
      failed: 0,
    });
    expect(insertedScans).toHaveLength(1);
    expect(insertedScans[0]?.['startup_workspace_id']).toBe('ws-1');
    expect(insertedScans[0]?.['run_source']).toBe('startup_dashboard');
    expect(ensureSpy).toHaveBeenCalledTimes(1);
  });

  it('skips a workspace until the configured schedule date and time are reached', async () => {
    const now = new Date('2026-04-05T00:00:00.000Z');
    const { supabase, insertedScans } = createSupabaseStub({
      workspaces: [
        {
          id: 'ws-1',
          primary_domain: 'acme.com',
          canonical_domain: 'acme.com',
          metadata: {
            rollout_flags: {
              startup_dashboard: true,
              slack_agent: true,
              slack_auto_post: true,
            },
            audit_schedule_date: '2026-04-06',
            audit_schedule_time: '09:00',
            audit_schedule_timezone: 'UTC',
          },
          status: 'active',
        },
      ],
      latestReportByWorkspace: {
        'ws-1': { id: 'report-1', created_at: '2026-03-01T00:00:00.000Z' },
      },
      latestAutoScanByWorkspace: {},
      workspaceMembersByWorkspace: {
        'ws-1': [{ user_id: 'user-1', role: 'founder' }],
      },
      usersById: {
        'user-1': { id: 'user-1', email: 'founder@acme.com' },
      },
    });

    const ensureSpy = vi.fn().mockResolvedValue({ ok: true, duplicate: false });

    const summary = await runScheduledStartupSlackAutoPost({
      supabase: supabase as any,
      env: baseEnv as any,
      deps: {
        now: () => now,
        ensureDeepAuditJobQueued: ensureSpy as any,
      },
    });

    expect(summary).toEqual({
      status: 'completed',
      examinedWorkspaces: 1,
      queued: 0,
      skipped: 1,
      failed: 0,
    });
    expect(insertedScans).toHaveLength(0);
    expect(ensureSpy).not.toHaveBeenCalled();
  });
});
