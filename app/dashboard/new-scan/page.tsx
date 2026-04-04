import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScanForm } from '@/components/scan-form';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    url?: string;
    agencyAccount?: string;
    agencyClient?: string;
    startupWorkspace?: string;
  }>;
};

function buildDashboardHref(args: {
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  startupWorkspaceId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (args.agencyAccountId) params.set('agencyAccount', args.agencyAccountId);
  if (args.agencyClientId) params.set('agencyClient', args.agencyClientId);
  if (args.startupWorkspaceId) params.set('startupWorkspace', args.startupWorkspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard?${query}` : '/dashboard';
}

export default async function DashboardNewScanPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/new-scan');
  }

  const siteKey = getTurnstileSiteKey();
  const [agencyDashboard, startupDashboard] = await Promise.all([
    getAgencyDashboardData({
      supabase,
      userId: user.id,
      selectedAccountId: sp.agencyAccount ?? null,
      selectedClientId: sp.agencyClient ?? null,
    }),
    getStartupDashboardData({
      supabase,
      userId: user.id,
      selectedWorkspaceId: sp.startupWorkspace ?? null,
    }),
  ]);

  const backHref = buildDashboardHref({
    agencyAccountId: agencyDashboard.selectedAccountId,
    agencyClientId: agencyDashboard.selectedClientId,
    startupWorkspaceId: startupDashboard.selectedWorkspaceId,
  });

  const selectedAgencyAccount =
    agencyDashboard.accounts.find((account) => account.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedAgencyClient =
    selectedAgencyAccount?.clients.find((client) => client.id === agencyDashboard.selectedClientId) ?? null;
  const selectedStartupWorkspace =
    startupDashboard.workspaces.find((workspace) => workspace.id === startupDashboard.selectedWorkspaceId) ?? null;

  return (
    <main className="mx-auto max-w-screen-xl px-6 py-16 md:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Dashboard</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Run a new scan</h1>
          <p className="mt-2 max-w-2xl font-body text-on-surface-variant">
            Start a fresh diagnostic without leaving the app. If you are working inside an agency client context, the
            scan will stay linked to that client.
          </p>
        </div>
        <Link
          href={backHref}
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          Back to dashboard
        </Link>
      </div>

      {selectedAgencyAccount ? (
        <div className="mt-8 rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Agency context</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-body text-sm text-on-surface-variant">Agency</p>
              <p className="mt-1 font-headline text-xl font-bold text-on-background">{selectedAgencyAccount.name}</p>
            </div>
            <div>
              <p className="font-body text-sm text-on-surface-variant">Client</p>
              <p className="mt-1 font-headline text-xl font-bold text-on-background">
                {selectedAgencyClient?.name ?? 'No client selected'}
              </p>
            </div>
          </div>
          {!agencyDashboard.entitlements.scanLaunchEnabled ? (
            <p className="mt-4 rounded-xl bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
              Scan launch is disabled for this agency context by GEO-Pulse admin.
            </p>
          ) : null}
        </div>
      ) : null}

      {!selectedAgencyAccount && selectedStartupWorkspace ? (
        <div className="mt-8 rounded-2xl bg-surface-container-low p-6 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Startup context</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-body text-sm text-on-surface-variant">Workspace</p>
              <p className="mt-1 font-headline text-xl font-bold text-on-background">
                {selectedStartupWorkspace.name}
              </p>
            </div>
            <div>
              <p className="font-body text-sm text-on-surface-variant">Role</p>
              <p className="mt-1 font-headline text-xl font-bold text-on-background">
                {selectedStartupWorkspace.role}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-10 rounded-2xl bg-surface-container-low p-8 shadow-float">
        {siteKey ? (
          agencyDashboard.selectedAccountId && !agencyDashboard.entitlements.scanLaunchEnabled ? (
            <div className="rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-on-surface-variant">
              This agency account cannot launch new scans right now. Return to the dashboard or ask GEO-Pulse admin to
              re-enable scan launch.
            </div>
          ) : (
            <ScanForm
              siteKey={siteKey}
              defaultUrl={sp.url}
              agencyAccountId={agencyDashboard.selectedAccountId}
              agencyClientId={agencyDashboard.selectedClientId}
            />
          )
        ) : (
          <div className="rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-error">
            Turnstile is not configured for this deployment.
          </div>
        )}
      </section>
    </main>
  );
}
