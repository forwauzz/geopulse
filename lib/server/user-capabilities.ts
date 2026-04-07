import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A user's resolved capabilities — admin flag, active subscriptions,
 * and workspace memberships — all in one query set.
 *
 * Use this in dashboard data loaders and server components that need to
 * know what the current user can access.
 */
export type ActiveSubscription = {
  readonly id: string;
  readonly bundleKey: string;
  readonly status: 'active' | 'trialing' | 'past_due' | 'incomplete' | 'cancelled';
  readonly startupWorkspaceId: string | null;
  readonly agencyAccountId: string | null;
  readonly currentPeriodEnd: string | null;
};

export type UserCapabilities = {
  readonly isPlatformAdmin: boolean;
  readonly activeSubs: ActiveSubscription[];
  /** IDs of startup workspaces the user is an active member of */
  readonly startupWorkspaceIds: string[];
  /** IDs of agency accounts the user is an active member of */
  readonly agencyAccountIds: string[];
};

/**
 * Resolves all capabilities for a user in a single parallel query set.
 * Requires a service-role Supabase client (bypasses RLS).
 *
 * Gracefully handles missing tables (migration not yet applied) by
 * catching errors per query and defaulting to empty/false.
 */
export async function resolveUserCapabilities(
  adminDb: SupabaseClient,
  userId: string
): Promise<UserCapabilities> {
  const [adminResult, subsResult, startupResult, agencyResult] = await Promise.allSettled([
    adminDb
      .from('platform_admin_users')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
    adminDb
      .from('user_subscriptions')
      .select('id, bundle_key, status, startup_workspace_id, agency_account_id, current_period_end')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing']),
    adminDb
      .from('startup_workspace_users')
      .select('startup_workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active'),
    adminDb
      .from('agency_users')
      .select('agency_account_id')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  const isPlatformAdmin =
    adminResult.status === 'fulfilled' && !!adminResult.value.data;

  const rawSubs =
    subsResult.status === 'fulfilled' ? (subsResult.value.data ?? []) : [];

  const activeSubs: ActiveSubscription[] = rawSubs.map((s: {
    id: string;
    bundle_key: string;
    status: string;
    startup_workspace_id: string | null;
    agency_account_id: string | null;
    current_period_end: string | null;
  }) => ({
    id: s.id,
    bundleKey: s.bundle_key,
    status: s.status as ActiveSubscription['status'],
    startupWorkspaceId: s.startup_workspace_id,
    agencyAccountId: s.agency_account_id,
    currentPeriodEnd: s.current_period_end,
  }));

  const startupWorkspaceIds =
    startupResult.status === 'fulfilled'
      ? (startupResult.value.data ?? []).map(
          (r: { startup_workspace_id: string }) => r.startup_workspace_id
        )
      : [];

  const agencyAccountIds =
    agencyResult.status === 'fulfilled'
      ? (agencyResult.value.data ?? []).map(
          (r: { agency_account_id: string }) => r.agency_account_id
        )
      : [];

  return {
    isPlatformAdmin,
    activeSubs,
    startupWorkspaceIds,
    agencyAccountIds,
  };
}
