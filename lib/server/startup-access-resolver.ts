type SupabaseLike = {
  from(table: string): any;
};

export type StartupAccessKind =
  | 'no_subscription'
  | 'needs_provisioning'
  | 'workspace_missing_membership'
  | 'ready';

export type StartupSubscriptionRow = {
  readonly id: string;
  readonly bundle_key: string;
  readonly status: string;
  readonly startup_workspace_id: string | null;
  readonly created_at: string;
};

export type StartupWorkspaceRow = {
  readonly id: string;
  readonly workspace_key: string;
  readonly name: string;
  readonly status: string;
};

export type StartupWorkspaceMembershipRow = {
  readonly id: string;
  readonly role: string;
  readonly status: string;
};

export type StartupAccessResolverResult = {
  readonly kind: StartupAccessKind;
  readonly bundleKey: 'startup_dev' | null;
  readonly subscription: StartupSubscriptionRow | null;
  readonly workspace: StartupWorkspaceRow | null;
  readonly membership: StartupWorkspaceMembershipRow | null;
  readonly selectedWorkspaceId: string | null;
  readonly canLaunchStartupScan: boolean;
  readonly needsProvisioning: boolean;
};

function isLiveSubscriptionStatus(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'incomplete';
}

function normalizeStartupSubscriptionRow(row: {
  readonly id: string;
  readonly bundle_key: string;
  readonly status: string;
  readonly startup_workspace_id: string | null;
  readonly created_at: string;
}): StartupSubscriptionRow {
  return {
    id: row.id,
    bundle_key: row.bundle_key,
    status: row.status,
    startup_workspace_id: row.startup_workspace_id,
    created_at: row.created_at,
  };
}

export async function resolveStartupAccess(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
}): Promise<StartupAccessResolverResult> {
  const { supabase, userId } = args;

  const { data: subscription, error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .select('id,bundle_key,status,startup_workspace_id,created_at')
    .eq('user_id', userId)
    .eq('bundle_key', 'startup_dev')
    .in('status', ['active', 'trialing', 'incomplete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;

  if (!subscription || !isLiveSubscriptionStatus(subscription.status)) {
    return {
      kind: 'no_subscription',
      bundleKey: null,
      subscription: null,
      workspace: null,
      membership: null,
      selectedWorkspaceId: null,
      canLaunchStartupScan: false,
      needsProvisioning: false,
    };
  }

  const subscriptionRow = normalizeStartupSubscriptionRow(subscription);
  const selectedWorkspaceId = subscriptionRow.startup_workspace_id;

  if (!selectedWorkspaceId) {
    return {
      kind: 'needs_provisioning',
      bundleKey: 'startup_dev',
      subscription: subscriptionRow,
      workspace: null,
      membership: null,
      selectedWorkspaceId: null,
      canLaunchStartupScan: false,
      needsProvisioning: true,
    };
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('startup_workspaces')
    .select('id,workspace_key,name,status')
    .eq('id', selectedWorkspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;

  if (!workspace) {
    return {
      kind: 'workspace_missing_membership',
      bundleKey: 'startup_dev',
      subscription: subscriptionRow,
      workspace: null,
      membership: null,
      selectedWorkspaceId,
      canLaunchStartupScan: false,
      needsProvisioning: false,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('startup_workspace_users')
    .select('id,role,status')
    .eq('startup_workspace_id', selectedWorkspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (!membership) {
    return {
      kind: 'workspace_missing_membership',
      bundleKey: 'startup_dev',
      subscription: subscriptionRow,
      workspace: {
        id: workspace.id,
        workspace_key: workspace.workspace_key,
        name: workspace.name,
        status: workspace.status,
      },
      membership: null,
      selectedWorkspaceId,
      canLaunchStartupScan: false,
      needsProvisioning: false,
    };
  }

  return {
    kind: 'ready',
    bundleKey: 'startup_dev',
    subscription: subscriptionRow,
    workspace: {
      id: workspace.id,
      workspace_key: workspace.workspace_key,
      name: workspace.name,
      status: workspace.status,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
    },
    selectedWorkspaceId,
    canLaunchStartupScan: true,
    needsProvisioning: false,
  };
}
