import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveDashboardShellIsAdmin } from '@/lib/server/dashboard-shell-admin';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listUserFeatures, userHasFeature } from '@/lib/server/user-feature-grants';
import { AGENT_CATALOG } from '@/lib/server/agent-catalog';
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

  // Automation keeps its own nav item. Every agent lives behind one "Agents" entry, which appears
  // as soon as the user has ANY agent grant — so adding an agent to the catalog does not mean
  // adding another top-level nav row.
  let showAutomation = isPlatformAdmin;
  let showAgents = isPlatformAdmin;
  if (!showAutomation || !showAgents) {
    const env = await getScanApiEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!showAutomation) showAutomation = await userHasFeature(admin, user.id, 'automation');
      if (!showAgents) {
        const granted = await listUserFeatures(admin, user.id);
        showAgents = AGENT_CATALOG.some((agent) => granted.has(agent.feature));
      }
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
        showAgents={showAgents}
      >
        {children}
      </DashboardShell>
    </main>
  );
}
