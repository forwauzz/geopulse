/**
 * Detects when a paid subscription row exists but no startup workspace / agency
 * account has been linked yet (webhook or admin provision missed or delayed).
 */

const PROVISIONABLE_BUNDLES = new Set(['startup_dev', 'agency_core', 'agency_pro']);

function isLiveStatusForProvision(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'incomplete';
}

export function bundleNeedsWorkspaceProvisioning(bundleKey: string): boolean {
  return PROVISIONABLE_BUNDLES.has(bundleKey);
}

export type SubscriptionRowForProvisionCheck = {
  readonly bundle_key: string;
  readonly status: string;
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
};

/**
 * Idempotent predicate: true when the user still needs a workspace/account for this row.
 * Matches admin “Provision workspace” visibility (`active` | `trialing` | `incomplete`).
 */
export function subscriptionNeedsWorkspaceProvisioning(
  row: SubscriptionRowForProvisionCheck,
): boolean {
  if (!isLiveStatusForProvision(row.status)) {
    return false;
  }
  if (!bundleNeedsWorkspaceProvisioning(row.bundle_key)) return false;
  if (row.startup_workspace_id || row.agency_account_id) return false;
  return true;
}
