/**
 * The exact customer measurement lane that may be projected into a dashboard or report.
 * A domain alone is not a safe selector: the same domain can retain historical query sets
 * and can be measured for more than one tenant.
 */
export type ClientMeasurementScope =
  | {
      readonly querySetId: string;
      readonly contextVersion: string;
      readonly agencyAccountId: string;
      readonly startupWorkspaceId?: never;
      readonly enabledPlatforms?: readonly string[];
    }
  | {
      readonly querySetId: string;
      readonly contextVersion: string;
      readonly startupWorkspaceId: string;
      readonly agencyAccountId?: never;
      readonly enabledPlatforms?: readonly string[];
    };

type QueryLike = {
  eq(column: string, value: string): QueryLike;
};

export function applyClientMeasurementScope<T extends QueryLike>(
  query: T,
  scope: ClientMeasurementScope
): T {
  let scoped = query.eq('query_set_id', scope.querySetId);
  scoped = scoped.eq('metadata->>organization_context_version', scope.contextVersion);
  scoped = 'agencyAccountId' in scope && scope.agencyAccountId
    ? scoped.eq('agency_account_id', scope.agencyAccountId)
    : scoped.eq('startup_workspace_id', scope.startupWorkspaceId!);
  return scoped as T;
}

export function isPlatformEnabled(
  scope: ClientMeasurementScope | undefined,
  platform: string
): boolean {
  if (!scope?.enabledPlatforms || scope.enabledPlatforms.length === 0) return true;
  return scope.enabledPlatforms.some((value) => value.trim().toLowerCase() === platform);
}
