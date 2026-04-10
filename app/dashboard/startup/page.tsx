import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StartupDashboardPageShell } from '@/app/dashboard/startup/components/startup-dashboard-page-shell';
import {
  parseStartupAuditFilterFromSearchParams,
  parseStartupDashboardTab,
} from '@/app/dashboard/startup/components/startup-tab-types';
import { loadStartupDashboardContext } from '@/app/dashboard/startup/lib/load-startup-dashboard-context';
import {
  buildStartupDashboardUrl,
  inferStartupDashboardTabFromStatusParams,
} from '@/lib/server/startup-dashboard-status-messages';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    startupWorkspace?: string;
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    github?: string;
    pr?: string;
    slack?: string;
    slack_detail?: string;
  }>;
};

export default async function StartupDashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/startup');
  }

  const activeTab = parseStartupDashboardTab(sp.tab);
  const statusTargetTab = inferStartupDashboardTabFromStatusParams(sp);
  if (statusTargetTab && statusTargetTab !== activeTab) {
    redirect(
      buildStartupDashboardUrl({
        startupWorkspace: sp.startupWorkspace,
        tab: statusTargetTab,
        range: sp.range,
        from: sp.from,
        to: sp.to,
        github: sp.github,
        pr: sp.pr,
        slack: sp.slack,
        slack_detail: sp.slack_detail,
      })
    );
  }

  const auditFilter = parseStartupAuditFilterFromSearchParams({
    range: sp.range,
    from: sp.from,
    to: sp.to,
  });

  const loaded = await loadStartupDashboardContext({
    supabase,
    userId: user.id,
    sp: {
      startupWorkspace: sp.startupWorkspace,
      github: sp.github,
      pr: sp.pr,
      slack: sp.slack,
      slack_detail: sp.slack_detail,
    },
  });

  if (loaded.kind === 'no-workspaces') {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">No startup workspace found</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Ask an admin to create your startup workspace in <code>/dashboard/startups</code>.
        </p>
      </section>
    );
  }

  if (loaded.kind === 'needs-provisioning') {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Your startup workspace is being prepared</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Your {loaded.bundleKey} subscription is active, but the workspace link is still being provisioned.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          Go to dashboard
        </Link>
      </section>
    );
  }

  if (loaded.kind === 'workspace-missing-membership') {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Workspace access needs repair</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Your {loaded.bundleKey} subscription is active, but {loaded.workspaceName ? `"${loaded.workspaceName}"` : 'the workspace'} is not linked as an active member yet.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          Go to dashboard
        </Link>
      </section>
    );
  }

  if (loaded.kind === 'rollout-blocked') {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {loaded.selectedWorkspace?.name ?? 'Startup workspace'}
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          This workspace is currently outside beta rollout. Ask an admin to enable <code>startup_dashboard</code> rollout flag.
        </p>
      </section>
    );
  }

  return (
    <StartupDashboardPageShell
      tabContext={loaded.tabContext}
      activeTab={activeTab}
      auditFilter={auditFilter}
      slackQueryCode={sp.slack}
    />
  );
}
