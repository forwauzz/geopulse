import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScanForm } from '@/components/scan-form';
import { WhatNextBanner } from '@/components/what-next-banner';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { resolveStartupAccess } from '@/lib/server/startup-access-resolver';
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
  const access = await resolveStartupAccess({
    supabase,
    userId: user.id,
  });

  if (access.kind === 'needs_provisioning' || access.kind === 'workspace_missing_membership') {
    const title =
      access.kind === 'needs_provisioning'
        ? 'Your startup workspace is being prepared'
        : 'Workspace access needs repair';
    const body =
      access.kind === 'needs_provisioning'
        ? 'Your startup subscription is active, but the workspace link is still being provisioned.'
        : `Your startup subscription is active, but ${access.workspace?.name ?? 'the workspace'} is not linked as an active member yet.`;

    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Dashboard</p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Run a Scan</h1>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
            Dashboard
          </Link>
        </div>
        <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Startup context
            </p>
            <h2 className="mt-2 font-headline text-xl font-bold text-on-background">{title}</h2>
            <p className="mt-2 text-sm text-on-surface-variant">{body}</p>
          </div>
        </div>
      </section>
    );
  }

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
      selectedWorkspaceId: access.selectedWorkspaceId ?? sp.startupWorkspace ?? null,
    }),
  ]);

  const backHref = buildDashboardHref({
    agencyAccountId: agencyDashboard.selectedAccountId,
    agencyClientId: agencyDashboard.selectedClientId,
    startupWorkspaceId: startupDashboard.selectedWorkspaceId,
  });

  const selectedAgencyAccount =
    agencyDashboard.accounts.find((a) => a.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedAgencyClient =
    selectedAgencyAccount?.clients.find((c) => c.id === agencyDashboard.selectedClientId) ?? null;
  const selectedStartupWorkspace =
    startupDashboard.workspaces.find((w) => w.id === startupDashboard.selectedWorkspaceId) ?? null;

  // Derive the active context label for the pre-scan banner
  const contextLabel = selectedAgencyClient
    ? selectedAgencyClient.name
    : selectedAgencyAccount
      ? selectedAgencyAccount.name
      : selectedStartupWorkspace
        ? selectedStartupWorkspace.name
        : null;

  const bannerBody = contextLabel
    ? `Scan will be linked to ${contextLabel}. Results and reports stay scoped to this workspace.`
    : 'Enter any URL to run an instant AI search readiness check. Free, under 30 seconds.';

  const scanDisabled =
    !!agencyDashboard.selectedAccountId && !agencyDashboard.entitlements.scanLaunchEnabled;

  return (
    <section className="mx-auto max-w-2xl space-y-6">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Dashboard
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Run a Scan
          </h1>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
          Dashboard
        </Link>
      </div>

      {/* ── Pre-scan guidance ────────────────────────────────── */}
      <WhatNextBanner
        eyebrow={contextLabel ? 'Active context' : 'Start here'}
        title={contextLabel ? `Scanning for ${contextLabel}` : 'Run an AI search readiness audit'}
        body={bannerBody}
        ctaLabel="Learn what we check"
        ctaHref="/blog"
      />

      {/* ── Context card (agency or startup) ────────────────── */}
      {selectedAgencyAccount ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Agency context
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3 sm:gap-x-8">
            <div>
              <p className="text-xs text-on-surface-variant">Agency</p>
              <p className="mt-0.5 text-sm font-semibold text-on-background">
                {selectedAgencyAccount.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Client</p>
              <p className="mt-0.5 text-sm font-semibold text-on-background">
                {selectedAgencyClient?.name ?? (
                  <span className="text-on-surface-variant">No client selected</span>
                )}
              </p>
            </div>
          </div>
          {scanDisabled ? (
            <p className="mt-3 rounded-xl bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
              Scan launch is disabled for this agency context. Contact GEO-Pulse admin to re-enable.
            </p>
          ) : null}
        </div>
      ) : selectedStartupWorkspace ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Startup context
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3 sm:gap-x-8">
            <div>
              <p className="text-xs text-on-surface-variant">Workspace</p>
              <p className="mt-0.5 text-sm font-semibold text-on-background">
                {selectedStartupWorkspace.name}
              </p>
            </div>
            {selectedStartupWorkspace.canonicalDomain ? (
              <div>
                <p className="text-xs text-on-surface-variant">Canonical domain</p>
                <p className="mt-0.5 text-sm font-semibold text-on-background">
                  {selectedStartupWorkspace.canonicalDomain}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-on-surface-variant">Role</p>
              <p className="mt-0.5 text-sm font-semibold text-on-background">
                {selectedStartupWorkspace.role}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Scan form ────────────────────────────────────────── */}
      <div className="rounded-2xl bg-surface-container-low p-6 shadow-float">
        {!siteKey ? (
          <p className="rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-error">
            Turnstile is not configured for this deployment.
          </p>
        ) : scanDisabled ? (
          <p className="rounded-xl bg-surface-container-lowest px-5 py-5 text-sm text-on-surface-variant">
            This agency account cannot launch new scans right now. Return to the dashboard or ask
            GEO-Pulse admin to re-enable scan launch.
          </p>
        ) : (
          <ScanForm
            siteKey={siteKey}
            defaultUrl={sp.url}
            agencyAccountId={agencyDashboard.selectedAccountId}
            agencyClientId={agencyDashboard.selectedClientId}
            startupWorkspaceId={startupDashboard.selectedWorkspaceId}
          />
        )}
      </div>

    </section>
  );
}
