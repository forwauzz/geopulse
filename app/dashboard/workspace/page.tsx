import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    agencyAccount?: string;
    agencyClient?: string;
    startupWorkspace?: string;
  }>;
};

function Field({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p
        className={`mt-1 text-sm ${mono ? 'font-mono text-on-surface' : 'font-medium text-on-background'}`}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}

export default async function WorkspacePage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/workspace');
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
      selectedWorkspaceId: sp.startupWorkspace ?? null,
    }),
  ]);

  const selectedAgencyAccount =
    agencyDashboard.accounts.find((a) => a.id === agencyDashboard.selectedAccountId) ?? null;
  const selectedStartupWorkspace =
    startupDashboard.workspaces.find((w) => w.id === startupDashboard.selectedWorkspaceId) ?? null;

  const hasAny =
    agencyDashboard.accounts.length > 0 || startupDashboard.workspaces.length > 0;

  return (
    <section className="space-y-6">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Dashboard
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Workspace
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Read-only metadata for your active workspace. Contact GEO-Pulse admin to make changes.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
          Dashboard
        </Link>
      </div>

      {/* ── Personal account ────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
        <div className="border-b border-outline-variant/10 px-6 py-4">
          <h2 className="font-headline text-base font-semibold text-on-background">
            Account
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">Your personal GEO-Pulse account.</p>
        </div>
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          <Field label="Email" value={user.email} />
          <Field label="User ID" value={user.id} mono />
          <Field
            label="Account type"
            value={
              agencyDashboard.accounts.length > 0 && startupDashboard.workspaces.length > 0
                ? 'Agency + Startup'
                : agencyDashboard.accounts.length > 0
                  ? 'Agency'
                  : startupDashboard.workspaces.length > 0
                    ? 'Startup'
                    : 'Personal'
            }
          />
        </div>
      </div>

      {/* ── Startup workspace ────────────────────────────────── */}
      {startupDashboard.workspaces.length > 0 ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/10 px-6 py-4">
            <div>
              <h2 className="font-headline text-base font-semibold text-on-background">
                Startup workspace
              </h2>
              {startupDashboard.workspaces.length > 1 ? (
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {startupDashboard.workspaces.length} workspaces
                </p>
              ) : null}
            </div>
            {/* Workspace switcher */}
            {startupDashboard.workspaces.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {startupDashboard.workspaces.map((w) => {
                  const params = new URLSearchParams();
                  params.set('startupWorkspace', w.id);
                  return (
                    <Link
                      key={w.id}
                      href={`/dashboard/workspace?${params}`}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        w.id === startupDashboard.selectedWorkspaceId
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                          : 'bg-surface-container-high text-on-background hover:bg-surface'
                      }`}
                    >
                      {w.name}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
            <Field label="Name" value={selectedStartupWorkspace?.name} />
            <Field label="Workspace key" value={selectedStartupWorkspace?.workspaceKey} mono />
            <Field
              label="Canonical domain"
              value={selectedStartupWorkspace?.canonicalDomain}
            />
            <Field label="Your role" value={selectedStartupWorkspace?.role} />
            <Field label="Status" value={selectedStartupWorkspace?.status} />
          </div>
          <div className="border-t border-outline-variant/10 px-6 py-4">
            <Link
              href="/dashboard/connectors"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden>cable</span>
              Manage integrations → Connectors
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Agency workspace ─────────────────────────────────── */}
      {agencyDashboard.accounts.length > 0 ? (
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/10 px-6 py-4">
            <div>
              <h2 className="font-headline text-base font-semibold text-on-background">
                Agency workspace
              </h2>
              {agencyDashboard.accounts.length > 1 ? (
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {agencyDashboard.accounts.length} accounts
                </p>
              ) : null}
            </div>
            {agencyDashboard.accounts.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {agencyDashboard.accounts.map((a) => {
                  const params = new URLSearchParams();
                  params.set('agencyAccount', a.id);
                  return (
                    <Link
                      key={a.id}
                      href={`/dashboard/workspace?${params}`}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        a.id === agencyDashboard.selectedAccountId
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                          : 'bg-surface-container-high text-on-background hover:bg-surface'
                      }`}
                    >
                      {a.name}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
            <Field label="Name" value={selectedAgencyAccount?.name} />
            <Field label="Account key" value={selectedAgencyAccount?.accountKey} mono />
            <Field
              label="Benchmark vertical"
              value={selectedAgencyAccount?.benchmarkVertical}
            />
            <Field
              label="Benchmark subvertical"
              value={selectedAgencyAccount?.benchmarkSubvertical}
            />
            <div className="sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                Clients ({selectedAgencyAccount?.clients.length ?? 0})
              </p>
              {selectedAgencyAccount && selectedAgencyAccount.clients.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedAgencyAccount.clients.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-lg bg-surface-container-high px-3 py-1 text-sm text-on-background"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-on-surface-variant">No clients.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── No workspace ─────────────────────────────────────── */}
      {!hasAny ? (
        <div className="rounded-2xl bg-surface-container-low px-6 py-8 text-center text-sm text-on-surface-variant">
          No workspace membership found. Your account is on the personal plan.
        </div>
      ) : null}

    </section>
  );
}
