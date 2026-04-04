import { resolveStartupRolloutFlagsFromMetadata, type StartupRolloutFlags } from './startup-rollout-flags';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupWorkspaceAdminRow = {
  readonly id: string;
  readonly workspace_key: string;
  readonly name: string;
  readonly primary_domain: string | null;
  readonly canonical_domain: string | null;
  readonly status: string;
  readonly billing_mode: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type StartupWorkspaceUserAdminRow = {
  readonly id: string;
  readonly startup_workspace_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly email: string | null;
};

export type StartupWorkspaceAdminDetail = StartupWorkspaceAdminRow & {
  readonly users: StartupWorkspaceUserAdminRow[];
  readonly timeline: StartupWorkspaceTimelineEvent[];
  readonly rolloutFlags: StartupRolloutFlags;
};

export type StartupWorkspaceTimelineEvent = {
  readonly id: string;
  readonly createdAt: string;
  readonly level: 'info' | 'warning' | 'error';
  readonly event: string;
  readonly actorUserId: string | null;
  readonly summary: string;
  readonly data: Record<string, unknown>;
};

function normalizeObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value ?? {};
}

function pickWorkspaceId(data: Record<string, unknown>): string | null {
  const value = data['startup_workspace_id'] ?? data['startupWorkspaceId'];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function pickActorUserId(data: Record<string, unknown>): string | null {
  const keys = ['changed_by_user_id', 'queued_by_user_id', 'created_by_user_id', 'requested_by_user_id', 'user_id'];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

function summarizeTimelineEvent(event: string, data: Record<string, unknown>): string {
  const keysByEvent: Record<string, readonly string[]> = {
    startup_recommendation_status_transitioned: ['from_status', 'to_status', 'reason'],
    startup_pr_run_queued: ['repository_owner', 'repository_name', 'recommendation_id'],
    startup_pr_run_status_updated: ['from_status', 'to_status', 'pull_request_number', 'error_message'],
    startup_github_allowlist_updated: ['repository_count'],
    startup_github_installation_connected: ['account_login', 'installation_id'],
    startup_github_installation_disconnected: ['disconnected_by_user_id'],
    startup_model_policy_resolved: ['service_key', 'effective_provider', 'effective_model', 'fallback_reason'],
    startup_implementation_plan_created: ['task_count', 'model_policy_effective_provider', 'model_policy_effective_model'],
    startup_service_gate_blocked: ['service_key', 'blocked_reason'],
    startup_rollout_flags_updated: [
      'startup_dashboard',
      'github_agent',
      'auto_pr',
      'slack_agent',
      'slack_auto_post',
    ],
  };

  const keys = keysByEvent[event] ?? ['message', 'reason', 'status'];
  const parts = keys
    .map((key) => {
      const value = data[key];
      if (value == null || value === '') return null;
      return `${key}: ${String(value)}`;
    })
    .filter((value): value is string => !!value);
  return parts.join(' | ');
}

export function createStartupAdminData(supabase: SupabaseLike) {
  return {
    async getWorkspaces(): Promise<StartupWorkspaceAdminDetail[]> {
      const [{ data: workspaces, error: workspaceError }, { data: users, error: usersError }] =
        await Promise.all([
          supabase
            .from('startup_workspaces')
            .select(
              'id,workspace_key,name,primary_domain,canonical_domain,status,billing_mode,metadata,created_at,updated_at'
            )
            .order('created_at', { ascending: true }),
          supabase
            .from('startup_workspace_users')
            .select('id,startup_workspace_id,user_id,role,status,metadata,created_at,updated_at')
            .order('created_at', { ascending: true }),
        ]);

      if (workspaceError || usersError) throw workspaceError ?? usersError;

      const userRows = (users ?? []) as Array<{
        id: string;
        startup_workspace_id: string;
        user_id: string;
        role: string;
        status: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
        updated_at: string;
      }>;

      const userIds = Array.from(new Set(userRows.map((row) => row.user_id)));
      const { data: linkedUsers, error: linkedUsersError } =
        userIds.length > 0
          ? await supabase.from('users').select('id,email').in('id', userIds)
          : { data: [], error: null };

      if (linkedUsersError) throw linkedUsersError;

      const emailByUserId = new Map(
        (((linkedUsers ?? []) as Array<{ id: string; email: string | null }>) ?? []).map((row) => [
          row.id,
          row.email,
        ])
      );

      const usersByWorkspace = new Map<string, StartupWorkspaceUserAdminRow[]>();
      for (const row of userRows) {
        const normalized: StartupWorkspaceUserAdminRow = {
          ...row,
          metadata: normalizeObject(row.metadata),
          email: emailByUserId.get(row.user_id) ?? null,
        };
        const existing = usersByWorkspace.get(row.startup_workspace_id) ?? [];
        existing.push(normalized);
        usersByWorkspace.set(row.startup_workspace_id, existing);
      }

      const { data: logs, error: logsError } = await supabase
        .from('app_logs')
        .select('id,level,event,data,created_at')
        .order('created_at', { ascending: false })
        .limit(1500);
      if (logsError) throw logsError;

      const workspaceIds = new Set(((workspaces ?? []) as StartupWorkspaceAdminRow[]).map((row) => row.id));
      const timelineByWorkspace = new Map<string, StartupWorkspaceTimelineEvent[]>();
      for (const row of (logs ?? []) as Array<{
        id: string;
        level: 'info' | 'warning' | 'error';
        event: string;
        data: Record<string, unknown> | null;
        created_at: string;
      }>) {
        if (!row.event.startsWith('startup_')) continue;
        const data = normalizeObject(row.data);
        const workspaceId = pickWorkspaceId(data);
        if (!workspaceId || !workspaceIds.has(workspaceId)) continue;
        const events = timelineByWorkspace.get(workspaceId) ?? [];
        if (events.length >= 12) continue;
        events.push({
          id: row.id,
          createdAt: row.created_at,
          level: row.level,
          event: row.event,
          actorUserId: pickActorUserId(data),
          summary: summarizeTimelineEvent(row.event, data),
          data,
        });
        timelineByWorkspace.set(workspaceId, events);
      }

      return ((workspaces ?? []) as StartupWorkspaceAdminRow[]).map((workspace) => ({
        rolloutFlags: resolveStartupRolloutFlagsFromMetadata({ metadata: workspace.metadata ?? {} }),
        ...workspace,
        metadata: normalizeObject(workspace.metadata),
        users: usersByWorkspace.get(workspace.id) ?? [],
        timeline: timelineByWorkspace.get(workspace.id) ?? [],
      }));
    },
  };
}
