/**
 * Dashboard shell admin affordances are now DB-driven only.
 */
export function resolveDashboardShellIsAdmin(isPlatformAdminFromDb: boolean): boolean {
  return isPlatformAdminFromDb;
}
