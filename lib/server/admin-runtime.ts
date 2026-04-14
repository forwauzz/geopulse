import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { getScanApiEnv, type ScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { buildE2EAdminDb, isE2EAuthEnabled } from '@/lib/supabase/e2e-auth';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Stable copy for `app/dashboard/(admin)/layout.tsx` — only this case keeps an inline error UI. */
export const ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE =
  'Server misconfigured: missing Supabase service role.' as const;

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
    return { ok: false, message: ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE };
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

  // DB-backed admin check (primary).
  const isAdmin = await isUserPlatformAdmin(user.id, adminDbResult.adminDb);
  if (!isAdmin) {
    redirect('/dashboard');
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

  // DB-backed admin check (primary).
  const isAdmin = await isUserPlatformAdmin(user.id, adminDbResult.adminDb);
  if (!isAdmin) {
    return { ok: false, message: 'Admin access required.' };
  }

  return {
    ok: true,
    user,
    env,
    adminDb: adminDbResult.adminDb,
  };
}
