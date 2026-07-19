import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveDashboardShellIsAdmin } from '@/lib/server/dashboard-shell-admin';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const isPlatformAdmin = await isUserPlatformAdmin(user.id);
  const isAdmin = resolveDashboardShellIsAdmin(isPlatformAdmin);
  const flags = await loadUiFlags();

  // Show the granted areas (Automation, Fix Agent) to platform admins or users granted them.
  let showAutomation = isPlatformAdmin;
  let showFixAgent = isPlatformAdmin;
  if (!showAutomation || !showFixAgent) {
    const env = await getScanApiEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!showAutomation) showAutomation = await userHasFeature(admin, user.id, 'automation');
      if (!showFixAgent) showFixAgent = await userHasFeature(admin, user.id, 'fix_agent');
    }
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 md:px-10">
      <DashboardShell
        userEmail={user.email ?? null}
        isAdmin={isAdmin}
        signOutAction={signOut}
        navFlags={{ connectors: flags.show_connectors, billing: flags.show_billing, blog: flags.show_blog }}
        showAutomation={showAutomation}
        showFixAgent={showFixAgent}
      >
        {children}
      </DashboardShell>
    </main>
  );
}
