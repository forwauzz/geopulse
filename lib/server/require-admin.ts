import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export function requireAdminOrRedirect(userEmail: string | null | undefined): void {
  if (!userEmail) {
    redirect('/dashboard');
  }
}

// Checks platform_admin_users table via service-role client.
//
// Usage: await isUserPlatformAdmin(userId, adminDb)
//   OR:  await isUserPlatformAdmin(userId, undefined, supabaseUrl, serviceRoleKey)
export async function isUserPlatformAdmin(
  userId: string,
  adminDb?: SupabaseClient,
  supabaseUrl?: string,
  serviceRoleKey?: string,
): Promise<boolean> {
  if (!userId) return false;

  let db: SupabaseClient;
  if (adminDb) {
    db = adminDb;
  } else {
    const url = supabaseUrl ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const key = serviceRoleKey ?? process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      return false;
    }
    db = createServiceRoleClient(url, key);
  }

  const { data, error } = await db
    .from('platform_admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
}
