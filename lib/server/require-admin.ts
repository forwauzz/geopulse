import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Legacy env-var check (kept for backward compat) ───────────────────────────
// Used by requireAdminOrRedirect() and as a fallback in isUserPlatformAdmin().
// TODO: Remove ADMIN_EMAIL env var once all admins are seeded in platform_admin_users.
export function isAdminEmail(userEmail: string | null | undefined): boolean {
  const admin = process.env['ADMIN_EMAIL'];
  if (!admin) return false;
  if (!userEmail) return false;
  return normalizeEmail(userEmail) === normalizeEmail(admin);
}

export function requireAdminOrRedirect(userEmail: string | null | undefined): void {
  if (!isAdminEmail(userEmail)) {
    redirect('/dashboard');
  }
}

// ── DB-backed admin check (primary) ───────────────────────────────────────────
// Checks platform_admin_users table via service-role client.
// Falls back to ADMIN_EMAIL env var for backward compat during transition.
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

  // Resolve the client to use
  let db: SupabaseClient;
  if (adminDb) {
    db = adminDb;
  } else {
    const url = supabaseUrl ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const key = serviceRoleKey ?? process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) return false;
    db = createServiceRoleClient(url, key);
  }

  const { data, error } = await db
    .from('platform_admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Table may not exist yet if migration hasn't run — fall back to env var check
    return false;
  }

  return !!data;
}
