type SupabaseLike = {
  from(table: string): any;
};

export const STARTUP_INTERNAL_RESERVED_REPOS = ['forwauzz/geopulse'] as const;
export const STARTUP_ACTIVE_PR_RUN_STATUSES = ['queued', 'running', 'pr_opened'] as const;

function normalizeRepoFullName(repoFullName: string): string {
  return repoFullName.trim().toLowerCase();
}

export function isStartupInternalReservedRepo(repoFullName: string): boolean {
  const normalized = normalizeRepoFullName(repoFullName);
  return STARTUP_INTERNAL_RESERVED_REPOS.includes(
    normalized as (typeof STARTUP_INTERNAL_RESERVED_REPOS)[number]
  );
}

export async function canStartupWorkspaceAccessRepo(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly repoFullName: string;
}): Promise<boolean> {
  if (!isStartupInternalReservedRepo(args.repoFullName)) return true;

  const { data, error } = await args.supabase
    .from('startup_workspaces')
    .select('metadata')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (error) throw error;

  const metadata = (data?.metadata as Record<string, unknown> | null | undefined) ?? {};
  return metadata['allow_internal_product_repo'] === true;
}

export async function assertStartupWorkspaceRepoAccess(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly repoFullName: string;
}): Promise<void> {
  const allowed = await canStartupWorkspaceAccessRepo(args);
  if (!allowed) {
    throw new Error('Repository is reserved for internal startup workspaces.');
  }
}

export async function hasActiveStartupPrRunForRepo(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly repoFullName: string;
}): Promise<boolean> {
  const [owner, name] = normalizeRepoFullName(args.repoFullName).split('/');
  if (!owner || !name) return false;

  const { data, error } = await args.supabase
    .from('startup_agent_pr_runs')
    .select('id,status')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('repository_owner', owner)
    .eq('repository_name', name)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; status: string }>;
  return rows.some((row) =>
    STARTUP_ACTIVE_PR_RUN_STATUSES.includes(
      row.status as (typeof STARTUP_ACTIVE_PR_RUN_STATUSES)[number]
    )
  );
}

export async function assertNoActiveStartupPrRunForRepo(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly repoFullName: string;
}): Promise<void> {
  const hasActive = await hasActiveStartupPrRunForRepo(args);
  if (hasActive) {
    throw new Error('An active PR run already exists for this workspace and repository.');
  }
}
