import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { listUserFeatures, USER_FEATURE_KEYS } from '@/lib/server/user-feature-grants';
import { agentsForUser } from '@/lib/server/agent-catalog';

export const dynamic = 'force-dynamic';

export default async function AgentsHubPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/agents');

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) redirect('/dashboard');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Platform admins see every agent without needing a grant for each one.
  const isAdmin = await isUserPlatformAdmin(user.id, admin);
  const granted = isAdmin
    ? new Set<string>(USER_FEATURE_KEYS)
    : new Set<string>(await listUserFeatures(admin, user.id));
  const agents = agentsForUser(granted);

  if (agents.length === 0) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
          Workspace
        </p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">
          Agents
        </h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Agents that do the work on your audits — finding what to change, and checking whether it
          worked.
        </p>
      </header>

      <ul className="space-y-3">
        {agents.map((agent) => (
          <li key={agent.id}>
            <Link
              href={agent.href}
              className="flex gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 transition hover:border-outline-variant/50 hover:bg-surface-container-low md:p-6"
            >
              <span
                className="material-symbols-outlined mt-0.5 shrink-0 text-[26px] text-primary"
                aria-hidden
              >
                {agent.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-sans text-base font-bold text-on-background">
                  {agent.name}
                </span>
                <span className="mt-1 block font-sans text-sm leading-relaxed text-on-surface-variant">
                  {agent.does}
                </span>
                {agent.requires ? (
                  <span className="mt-2 block font-sans text-xs text-on-surface-variant/80">
                    Needs: {agent.requires}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
