import { randomUUID } from 'node:crypto';
import { resolveServiceEntitlement } from './service-entitlements';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupGithubIntegrationState = {
  readonly installation: {
    readonly id: string;
    readonly startupWorkspaceId: string;
    readonly installationId: number | null;
    readonly accountLogin: string | null;
    readonly accountType: string | null;
    readonly status: 'disconnected' | 'pending' | 'connected' | 'error';
    readonly connectedAt: string | null;
    readonly disconnectedAt: string | null;
    readonly metadata: Record<string, unknown>;
  } | null;
  readonly repositories: Array<{
    readonly id: string;
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly enabled: boolean;
  }>;
};

export function normalizeGitHubRepoAllowlist(raw: string): {
  readonly repositories: string[];
  readonly invalid: string[];
} {
  const parts = raw
    .split(/[\n,]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  const unique = new Set<string>();
  const invalid = new Set<string>();
  for (const token of parts) {
    if (!isGitHubRepoSlug(token)) {
      invalid.add(token);
      continue;
    }
    unique.add(token);
  }

  return {
    repositories: [...unique.values()],
    invalid: [...invalid.values()],
  };
}

export function isGitHubRepoSlug(value: string): boolean {
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value.trim());
}

export async function getStartupGithubIntegrationState(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupGithubIntegrationState> {
  const { data: installationRow, error: installError } = await args.supabase
    .from('startup_github_installations')
    .select(
      'id,startup_workspace_id,installation_id,account_login,account_type,status,connected_at,disconnected_at,metadata'
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github')
    .maybeSingle();
  if (installError) throw installError;

  const installation = installationRow
    ? {
        id: installationRow.id as string,
        startupWorkspaceId: installationRow.startup_workspace_id as string,
        installationId:
          typeof installationRow.installation_id === 'number'
            ? (installationRow.installation_id as number)
            : null,
        accountLogin: (installationRow.account_login as string | null) ?? null,
        accountType: (installationRow.account_type as string | null) ?? null,
        status: installationRow.status as 'disconnected' | 'pending' | 'connected' | 'error',
        connectedAt: (installationRow.connected_at as string | null) ?? null,
        disconnectedAt: (installationRow.disconnected_at as string | null) ?? null,
        metadata: (installationRow.metadata as Record<string, unknown> | null) ?? {},
      }
    : null;

  const { data: repoRows, error: reposError } = installation
    ? await args.supabase
        .from('startup_github_installation_repositories')
        .select('id,repo_owner,repo_name,is_enabled')
        .eq('installation_row_id', installation.id)
        .order('repo_owner', { ascending: true })
    : ({ data: [], error: null } as const);
  if (reposError) throw reposError;

  return {
    installation,
    repositories: ((repoRows ?? []) as Array<{
      id: string;
      repo_owner: string;
      repo_name: string;
      is_enabled: boolean;
    }>).map((row) => ({
      id: row.id,
      owner: row.repo_owner,
      name: row.repo_name,
      fullName: `${row.repo_owner}/${row.repo_name}`,
      enabled: row.is_enabled,
    })),
  };
}

export async function createStartupGithubInstallSession(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly requestedByUserId: string;
  readonly redirectTo: string;
  readonly expiresInMinutes?: number;
}): Promise<{ readonly stateToken: string; readonly expiresAt: string }> {
  const expiresAt = new Date(Date.now() + (args.expiresInMinutes ?? 20) * 60 * 1000).toISOString();
  const stateToken = randomUUID();
  const { error } = await args.supabase.from('startup_github_install_sessions').insert({
    startup_workspace_id: args.startupWorkspaceId,
    provider: 'github',
    state_token: stateToken,
    status: 'pending',
    requested_by_user_id: args.requestedByUserId,
    redirect_to: args.redirectTo,
    expires_at: expiresAt,
    metadata: {},
  });
  if (error) throw error;
  structuredLog(
    'startup_github_install_session_created',
    {
      startup_workspace_id: args.startupWorkspaceId,
      requested_by_user_id: args.requestedByUserId,
      expires_at: expiresAt,
    },
    'info'
  );
  return { stateToken, expiresAt };
}

export async function consumeStartupGithubInstallSession(args: {
  readonly supabase: SupabaseLike;
  readonly stateToken: string;
}): Promise<{
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly requestedByUserId: string | null;
  readonly redirectTo: string | null;
} | null> {
  const { data: row, error } = await args.supabase
    .from('startup_github_install_sessions')
    .select('id,startup_workspace_id,requested_by_user_id,redirect_to,status,expires_at')
    .eq('state_token', args.stateToken)
    .eq('provider', 'github')
    .maybeSingle();
  if (error) throw error;
  if (!row?.id) return null;

  const now = Date.now();
  const expiresAt = new Date(row.expires_at as string).getTime();
  if ((row.status as string) !== 'pending' || Number.isNaN(expiresAt) || expiresAt < now) {
    await args.supabase
      .from('startup_github_install_sessions')
      .update({ status: 'expired' })
      .eq('id', row.id);
    return null;
  }

  const { error: consumeError } = await args.supabase
    .from('startup_github_install_sessions')
    .update({ status: 'consumed' })
    .eq('id', row.id);
  if (consumeError) throw consumeError;

  structuredLog(
    'startup_github_install_session_consumed',
    {
      startup_workspace_id: row.startup_workspace_id as string,
      session_id: row.id as string,
      requested_by_user_id: (row.requested_by_user_id as string | null) ?? null,
    },
    'info'
  );

  return {
    id: row.id as string,
    startupWorkspaceId: row.startup_workspace_id as string,
    requestedByUserId: (row.requested_by_user_id as string | null) ?? null,
    redirectTo: (row.redirect_to as string | null) ?? null,
  };
}

export async function upsertStartupGithubInstallationFromCallback(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly installationId: number;
  readonly accountLogin?: string | null;
  readonly accountType?: string | null;
  readonly connectedByUserId?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.supabase.from('startup_github_installations').upsert(
    {
      startup_workspace_id: args.startupWorkspaceId,
      provider: 'github',
      installation_id: args.installationId,
      account_login: args.accountLogin ?? null,
      account_type: args.accountType ?? null,
      status: 'connected',
      connected_by_user_id: args.connectedByUserId ?? null,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      metadata: args.metadata ?? {},
    },
    { onConflict: 'startup_workspace_id,provider' }
  );
  if (error) throw error;
  structuredLog(
    'startup_github_installation_connected',
    {
      startup_workspace_id: args.startupWorkspaceId,
      installation_id: args.installationId,
      account_login: args.accountLogin ?? null,
      connected_by_user_id: args.connectedByUserId ?? null,
    },
    'info'
  );
}

export async function disconnectStartupGithubInstallation(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly disconnectedByUserId: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error: installError } = await args.supabase
    .from('startup_github_installations')
    .update({
      status: 'disconnected',
      disconnected_at: nowIso,
      metadata: { disconnected_by_user_id: args.disconnectedByUserId },
    })
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github');
  if (installError) throw installError;

  const { data: installationRow, error: lookupError } = await args.supabase
    .from('startup_github_installations')
    .select('id')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github')
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!installationRow?.id) return;

  const { error: deleteError } = await args.supabase
    .from('startup_github_installation_repositories')
    .delete()
    .eq('installation_row_id', installationRow.id);
  if (deleteError) throw deleteError;

  structuredLog(
    'startup_github_installation_disconnected',
    {
      startup_workspace_id: args.startupWorkspaceId,
      disconnected_by_user_id: args.disconnectedByUserId,
    },
    'info'
  );
}

export async function setStartupGithubRepositoryAllowlist(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly repositories: string[];
}): Promise<void> {
  const { data: installationRow, error: lookupError } = await args.supabase
    .from('startup_github_installations')
    .select('id')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'github')
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!installationRow?.id) throw new Error('GitHub installation is not connected for this workspace.');

  const { error: deleteError } = await args.supabase
    .from('startup_github_installation_repositories')
    .delete()
    .eq('installation_row_id', installationRow.id);
  if (deleteError) throw deleteError;

  if (args.repositories.length === 0) {
    structuredLog(
      'startup_github_allowlist_updated',
      {
        startup_workspace_id: args.startupWorkspaceId,
        repository_count: 0,
      },
      'info'
    );
    return;
  }

  const rows = args.repositories.map((fullName) => {
    const [owner, name] = fullName.split('/');
    return {
      startup_workspace_id: args.startupWorkspaceId,
      installation_row_id: installationRow.id,
      repo_owner: owner,
      repo_name: name,
      is_enabled: true,
      metadata: {},
    };
  });
  const { error: insertError } = await args.supabase
    .from('startup_github_installation_repositories')
    .insert(rows);
  if (insertError) throw insertError;

  structuredLog(
    'startup_github_allowlist_updated',
    {
      startup_workspace_id: args.startupWorkspaceId,
      repository_count: args.repositories.length,
    },
    'info'
  );
}

export async function resolveStartupGithubIntegrationEntitlement(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly userId: string;
}): Promise<{
  readonly enabled: boolean;
  readonly accessMode: 'free' | 'paid' | 'trial' | 'off';
  readonly source: string;
  readonly bundleKey: 'startup_lite' | 'startup_dev';
}> {
  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.memberSupabase,
    serviceSupabase: args.serviceSupabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });

  const resolved = await resolveServiceEntitlement({
    supabase: args.serviceSupabase,
    serviceKey: 'github_integration',
    bundleKey,
    userId: args.userId,
  });
  return {
    enabled: resolved.enabled,
    accessMode: resolved.accessMode,
    source: resolved.source,
    bundleKey,
  };
}

export async function resolveStartupWorkspaceBundleKey(args: {
  readonly memberSupabase: SupabaseLike;
  readonly serviceSupabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<'startup_lite' | 'startup_dev'> {
  const { data: workspace, error: workspaceError } = await args.memberSupabase
    .from('startup_workspaces')
    .select('default_bundle_id,billing_mode')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;

  let bundleKey: 'startup_lite' | 'startup_dev' =
    (workspace?.billing_mode as string | null) === 'paid' || (workspace?.billing_mode as string | null) === 'trial'
      ? 'startup_dev'
      : 'startup_lite';

  const bundleId = (workspace?.default_bundle_id as string | null) ?? null;
  if (bundleId) {
    const { data: bundle, error: bundleError } = await args.serviceSupabase
      .from('service_bundles')
      .select('bundle_key')
      .eq('id', bundleId)
      .maybeSingle();
    if (bundleError) throw bundleError;
    if (bundle?.bundle_key === 'startup_lite' || bundle?.bundle_key === 'startup_dev') {
      bundleKey = bundle.bundle_key;
    }
  }
  return bundleKey;
}
