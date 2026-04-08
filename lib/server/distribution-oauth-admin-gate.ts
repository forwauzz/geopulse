import { isUserPlatformAdmin } from '@/lib/server/require-admin';

/**
 * OAuth callback for distribution: DB-backed platform admin only.
 */
export async function isDistributionOAuthAdmin(
  userId: string,
  _userEmail: string | null | undefined,
  supabaseUrl: string | undefined,
  serviceRoleKey: string | undefined,
): Promise<boolean> {
  const key = serviceRoleKey?.trim();
  const url = supabaseUrl?.trim();
  return url && key ? isUserPlatformAdmin(userId, undefined, url, key) : false;
}
