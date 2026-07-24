import Link from 'next/link';
import type { AgencyDashboardData } from '@/lib/server/agency-dashboard-data';

function daysSince(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

export function AgencyHome({ data }: { readonly data: AgencyDashboardData }) {
  const account = data.accounts.find((item) => item.id === data.selectedAccountId) ?? data.accounts[0] ?? null;
  if (!account) return null;

  const latestByClient = new Map<string, (typeof data.scans)[number]>();
  for (const scan of data.scans) {
    if (scan.agencyClientId && !latestByClient.has(scan.agencyClientId)) latestByClient.set(scan.agencyClientId, scan);
  }
  const clientsNeedingAttention = account.clients.filter((client) => {
    const scan = latestByClient.get(client.id);
    return !scan || scan.score === null || scan.score < 70 || daysSince(scan.createdAt) > 30;
  });
  const deliveredReports = data.reports.filter((report) => report.emailDeliveredAt || report.pdfGeneratedAt).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Agency home</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">{account.name}</h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            See who needs attention, open a client scorecard, or add a new client.
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
            <p className="mt-1 text-sm text-on-surface-variant">Latest AI visibility snapshot for every client.</p>
          </div>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-primary hover:underline">View all</Link>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {account.clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant/30 p-8 text-center lg:col-span-2">
              <h3 className="font-semibold text-on-background">Add your first client</h3>
              <p className="mt-2 text-sm text-on-surface-variant">You only need their business name and website.</p>
              <Link href={`/dashboard/clients?agencyAccount=${account.id}&manage=1`} className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                Add client
              </Link>
            </div>
          ) : account.clients.map((client) => {
            const scan = latestByClient.get(client.id);
            const needsAttention = !scan || scan.score === null || scan.score < 70 || daysSince(scan.createdAt) > 30;
            return (
              <Link
                key={client.id}
                href={`/dashboard/clients/${client.id}?agencyAccount=${account.id}`}
                className="group rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-float transition hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-on-background">{client.name}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">{client.canonicalDomain ?? 'Website not set'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${needsAttention ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                    {needsAttention ? 'Needs attention' : 'On track'}
                  </span>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-on-surface-variant">AI readiness</p>
                    <p className="mt-1 text-3xl font-bold text-on-background">{scan?.score ?? '—'}{scan?.score !== null && scan?.score !== undefined ? <span className="text-sm font-normal text-on-surface-variant">/100</span> : null}</p>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant transition group-hover:translate-x-1 group-hover:text-primary" aria-hidden>arrow_forward</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
