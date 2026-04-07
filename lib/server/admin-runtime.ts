import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { getScanApiEnv, type ScanApiEnv } from '@/lib/server/cf-env';
import { isAdminEmail, isUserPlatformAdmin, requireAdminOrRedirect } from '@/lib/server/require-admin';
import { buildE2EAdminDb, isE2EAuthEnabled } from '@/lib/supabase/e2e-auth';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AdminPageContextResult =
  | {
      readonly ok: true;
      readonly user: User;
      readonly env: ScanApiEnv;
      readonly adminDb: SupabaseClient;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

type AdminActionContextResult =
  | {
      readonly ok: true;
      readonly user: User;
      readonly env: ScanApiEnv;
      readonly adminDb: SupabaseClient;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

function buildAdminDbOrMessage(
  env: ScanApiEnv
): { ok: true; adminDb: SupabaseClient } | { ok: false; message: string } {
  if (isE2EAuthEnabled()) {
    return { ok: true, adminDb: buildE2EAdminDb() as unknown as SupabaseClient };
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: 'Server misconfigured: missing Supabase service role.' };
  }

  return {
    ok: true,
    adminDb: createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export async function loadAdminPageContext(nextPath: string): Promise<AdminPageContextResult> {
  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect(`/admin/login?next=${nextPath}`);
  }

  const env = await getScanApiEnv();
  const adminDbResult = buildAdminDbOrMessage(env);
  if (!adminDbResult.ok) {
    return adminDbResult;
  }

  // DB-backed admin check (primary). Falls back gracefully if migration not yet applied.
  const isAdmin = await isUserPlatformAdmin(user.id, adminDbResult.adminDb);
  if (!isAdmin) {
    // Legacy fallback: allow ADMIN_EMAIL during transition period
    if (!isAdminEmail(user.email)) {
      redirect('/dashboard');
    }
  }

  return {
    ok: true,
    user,
    env,
    adminDb: adminDbResult.adminDb,
  };
}

export async function loadAdminActionContext(): Promise<AdminActionContextResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: 'Admin access required.' };
  }

  const env = await getScanApiEnv();
  const adminDbResult = buildAdminDbOrMessage(env);
  if (!adminDbResult.ok) {
    return adminDbResult;
  }

  // DB-backed admin check (primary). Falls back gracefully if migration not yet applied.
  const isAdmin = await isUserPlatformAdmin(user.id, adminDbResult.adminDb);
  if (!isAdmin) {
    // Legacy fallback: allow ADMIN_EMAIL during transition period
    if (!isAdminEmail(user.email)) {
      return { ok: false, message: 'Admin access required.' };
    }
  }

  return {
    ok: true,
    user,
    env,
    adminDb: adminDbResult.adminDb,
  };
}
