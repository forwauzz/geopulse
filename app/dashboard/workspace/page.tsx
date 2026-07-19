import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadUserSchedule } from '@/lib/server/recurring-audits';
import { saveMyRecurringAudit, runMyRecurringAuditNow } from './actions';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    agencyAccount?: string;
    agencyClient?: string;
    startupWorkspace?: string;
    recurring?: string;
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

  // Recurring-audit schedule (service-role table) for the self-serve card below.
  const env = await getScanApiEnv();
  const admin =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : null;
  const schedule = admin ? await loadUserSchedule(admin, user.id) : null;
  const fmtDate = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const recurInput =
    'min-h-[42px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';
  const recurringNotice: { ok: boolean; text: string } | null = (() => {
    switch (sp.recurring) {
      case 'saved': return { ok: true, text: 'Saved — your recurring audit settings are updated.' };
      case 'error': return { ok: false, text: 'Could not save. Please try again.' };
      case 'bad_url': return { ok: false, text: 'That website URL looks invalid.' };
      case 'run_no_schedule': return { ok: false, text: 'Save a schedule first, then run it.' };
      default: return sp.recurring?.startsWith('run_') ? { ok: false, text: 'Test run failed. Please try again.' } : null;
    }
  })();

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

      {/* ── Recurring audit (self-serve, all users) ─────────── */}
      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-float md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Recurring audit</h2>
        <p className="mt-0.5 font-sans text-sm text-on-surface-variant">
          Re-audit your site automatically and get the report emailed to you on your schedule.
        </p>
        {recurringNotice ? (
          <p className={`mt-3 rounded-xl px-3 py-2 font-sans text-sm ${recurringNotice.ok ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
            {recurringNotice.text}
          </p>
        ) : null}
        <form action={saveMyRecurringAudit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Website to audit</span>
            <input name="url" type="url" required defaultValue={schedule?.url ?? ''} placeholder="https://yourcompany.com" className={recurInput} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Email the report to</span>
            <input name="reportEmail" type="email" defaultValue={schedule?.reportEmail ?? user.email ?? ''} placeholder={user.email ?? 'you@company.com'} className={recurInput} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">How often</span>
              <select name="cadence" defaultValue={schedule?.cadence ?? 'weekly'} className={recurInput}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" name="enabled" value="true" className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:bg-primary-dim">
                {schedule?.enabled ? 'Save & keep on' : 'Save & turn on'}
              </button>
              {schedule?.enabled ? (
                <button type="submit" name="enabled" value="false" className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-surface-variant transition hover:text-on-background">
                  Turn off
                </button>
              ) : null}
            </div>
          </div>
        </form>
        {schedule ? (
          <form action={runMyRecurringAuditNow} className="mt-3">
            <button type="submit" className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 text-sm font-semibold text-on-background transition hover:bg-surface-container">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>play_circle</span>
              Run now &amp; email me
            </button>
          </form>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-outline-variant/20 pt-4 font-sans text-xs text-on-surface-variant">
          <span>Status: <strong className={schedule?.enabled ? 'text-primary' : 'text-on-surface-variant'}>{schedule?.enabled ? 'On' : 'Off'}</strong></span>
          <span>Next run: {schedule?.enabled ? fmtDate(schedule.nextRunAt) : '—'}</span>
          <span>Last run: {fmtDate(schedule?.lastRunAt ?? null)}</span>
        </div>
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
