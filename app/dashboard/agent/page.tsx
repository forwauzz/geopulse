import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { isFixAgentAutoPrEnabled } from '@/lib/server/fix-agent-auto-pr';
import { AgentRunner } from './agent-runner';

export const dynamic = 'force-dynamic';

export default async function FixAgentPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/agent');

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) redirect('/dashboard');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'fix_agent'));
  if (!allowed) redirect('/dashboard');

  const autoPrEnabled = await isFixAgentAutoPrEnabled(admin, user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Workspace</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Fix Agent</h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Runs a fresh audit, writes the exact changes to make, and — if you switch it on — opens the
          pull request on your connected repo without you lifting a finger.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <AgentRunner autoPrEnabled={autoPrEnabled} />
      </section>
    </div>
  );
}
