import Link from 'next/link';
import type { AgencyDashboardData } from '@/lib/server/agency-dashboard-data';
import type { AgencyPortfolioRow } from '@/lib/server/agency-portfolio';

function daysSince(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function changeText(value: number | null): string {
  if (value === null) return 'Baseline';
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}`;
}

export function AgencyHome({
  data,
  portfolio,
}: {
  readonly data: AgencyDashboardData;
  readonly portfolio: readonly AgencyPortfolioRow[];
}) {
  const account = data.accounts.find((item) => item.id === data.selectedAccountId) ?? data.accounts[0] ?? null;
  if (!account) return null;

  const clientsNeedingAttention = portfolio.filter((client) => (
    client.readinessScore === null
    || client.readinessScore < 70
    || (client.measuredAt ? daysSince(client.measuredAt) > 30 : true)
    || (client.visibilityChange !== null && client.visibilityChange < 0)
  ));
  const deliveredReports = portfolio.filter((client) => client.reportStatus === 'ready').length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Agency home</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">{account.name}</h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            See who needs attention and the next action to take—without opening every account.
          </p>
        </div>
        <Link
          href={`/dashboard/clients?agencyAccount=${account.id}&manage=1`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>
          Add client
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Agency summary">
        {[
          ['groups', 'Clients', account.clients.length],
          ['priority_high', 'Need attention', clientsNeedingAttention.length],
          ['description', 'Reports ready', deliveredReports],
        ].map(([icon, label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float">
            <span className="material-symbols-outlined text-primary" aria-hidden>{icon}</span>
            <p className="mt-5 text-3xl font-bold text-on-background">{value}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{label}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-xl font-semibold text-on-background">Client portfolio</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Readiness, AI visibility, competitors, and the next action in one view.</p>
          </div>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-primary hover:underline">View all</Link>
        </div>
        <div className="mt-4 space-y-3">
          {portfolio.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant/30 p-8 text-center">
              <h3 className="font-semibold text-on-background">Add your first client</h3>
              <p className="mt-2 text-sm text-on-surface-variant">You only need their business name and website.</p>
              <Link href={`/dashboard/clients?agencyAccount=${account.id}&manage=1`} className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                Add client
              </Link>
            </div>
          ) : portfolio.map((client) => {
            const needsAttention = clientsNeedingAttention.some((item) => item.clientId === client.clientId);
            return (
              <Link
                key={client.clientId}
                href={`/dashboard/clients/${client.clientId}?agencyAccount=${account.id}`}
                className="group block rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float transition hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-on-background">{client.clientName}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">{client.domain ?? 'Website not set'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${needsAttention ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>
                    {needsAttention ? 'Needs attention' : 'On track'}
                  </span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[0.8fr_0.8fr_1fr_1.5fr_auto] lg:items-end">
                  <div>
                    <p className="text-xs text-on-surface-variant">AI readiness</p>
                    <p className="mt-1 text-2xl font-bold text-on-background">
                      {client.readinessScore ?? '—'}
                      {client.readinessScore !== null ? <span className="text-xs font-normal text-on-surface-variant">/100 · {changeText(client.readinessChange)}</span> : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">AI visibility</p>
                    <p className="mt-1 text-2xl font-bold text-on-background">
                      {client.visibilityPct !== null ? `${client.visibilityPct}%` : '—'}
                      {client.visibilityPct !== null ? <span className="text-xs font-normal text-on-surface-variant"> · {changeText(client.visibilityChange)}</span> : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">Leading competitor</p>
                    <p className="mt-1 truncate text-sm font-semibold text-on-background">{client.leadingCompetitor ?? 'Baseline pending'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">Next action</p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-on-background">{client.nextAction}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${client.reportStatus === 'ready' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-surface-container text-on-surface-variant'}`}>
                      {client.reportStatus === 'ready' ? 'Report ready' : client.reportStatus === 'scheduled' ? 'Scheduled' : 'Not started'}
                    </span>
                    <span className="material-symbols-outlined text-on-surface-variant transition group-hover:translate-x-1 group-hover:text-primary" aria-hidden>arrow_forward</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
