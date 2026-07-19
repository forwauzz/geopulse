import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { DashboardScanHero } from '@/components/dashboard-scan-hero';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

/**
 * Logged-in home = just the search box. Everything else lives under /dashboard/history.
 */
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  // Attribute scans to the user's first startup workspace, if any.
  let startupWorkspaceId: string | null = null;
  const env = await getScanApiEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await admin
        .from('startup_workspace_users')
        .select('startup_workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      startupWorkspaceId = (data?.startup_workspace_id as string | undefined) ?? null;
    } catch {
      startupWorkspaceId = null;
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center py-8">
      <DashboardScanHero
        siteKey={getTurnstileSiteKey()}
        defaultUrl={sp.url}
        agencyAccountId={null}
        agencyClientId={null}
        startupWorkspaceId={startupWorkspaceId}
        scanDisabled={false}
        startupAccessBlocked={false}
        contextLine={null}
      />
    </div>
  );
}
