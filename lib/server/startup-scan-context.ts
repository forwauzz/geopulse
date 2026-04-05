type SupabaseLike = {
  from(table: string): any;
};

/**
 * Confirms the user is an active member of the startup workspace (service-role client).
 */
export async function validateStartupWorkspaceScanContext(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly startupWorkspaceId: string;
}): Promise<boolean> {
  const { data, error } = await args.supabase
    .from('startup_workspace_users')
    .select('id')
    .eq('user_id', args.userId)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.id);
}
