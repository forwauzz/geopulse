import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AgencyClientManagementView } from '@/components/agency-client-management-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';

export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ agencyAccount?: string; agencyClient?: string; manage?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/clients');

  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase,
    selectedAccountId: sp.agencyAccount,
    selectedClientId: sp.agencyClient,
  });
  if (!workspace) redirect('/dashboard');
  const { data } = workspace;
  const account = data.accounts.find((item) => item.id === data.selectedAccountId) ?? data.accounts[0]!;
  const latestByClient = new Map<string, (typeof data.scans)[number]>();
  for (const scan of data.scans) {
    if (scan.agencyClientId && !latestByClient.has(scan.agencyClientId)) latestByClient.set(scan.agencyClientId, scan);
  }
  const selectedClient = account.clients.find((client) => client.id === data.selectedClientId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-7 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Workspace</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Clients</h1>
          <p className="mt-2 text-on-surface-variant">Open a client to see what AI recommends, compare competitors, and share a report.</p>
        </div>
        <Link
          href={`/dashboard/clients?agencyAccount=${account.id}&manage=1`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>add</span>
          Add client
        </Link>
      </header>

      <section className="overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest shadow-float">
        <div className="hidden grid-cols-[minmax(0,1fr)_8rem_9rem_2rem] gap-4 border-b border-outline-variant/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant md:grid">
          <span>Client</span><span>Score</span><span>Last checked</span><span />
        </div>
        {account.clients.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">No clients yet. Add the first business you want to track.</div>
        ) : account.clients.map((client) => {
          const scan = latestByClient.get(client.id);
          return (
            <Link
              key={client.id}
              href={`/dashboard/clients/${client.id}?agencyAccount=${account.id}`}
              className="grid gap-3 border-b border-outline-variant/10 px-5 py-5 transition last:border-0 hover:bg-surface-container-low md:grid-cols-[minmax(0,1fr)_8rem_9rem_2rem] md:items-center md:gap-4"
            >
              <span><span className="block font-semibold text-on-background">{client.name}</span><span className="mt-1 block text-sm text-on-surface-variant">{client.canonicalDomain ?? 'Website not set'}</span></span>
              <span className="text-xl font-bold text-on-background">{scan?.score ?? '—'}{scan?.score !== null && scan?.score !== undefined ? <span className="text-xs font-normal text-on-surface-variant">/100</span> : null}</span>
              <span className="text-sm text-on-surface-variant">{scan ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(scan.createdAt)) : 'Not checked'}</span>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>chevron_right</span>
            </Link>
          );
        })}
      </section>

      {sp.manage === '1' ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-headline text-xl font-semibold text-on-background">Manage clients</h2>
            <Link href="/dashboard/clients" className="text-sm text-on-surface-variant hover:text-on-background">Close</Link>
          </div>
          <AgencyClientManagementView
            agencyAccountId={account.id}
            selectedClientId={selectedClient?.id ?? null}
            selectedClientName={selectedClient?.name ?? null}
            clientOptions={account.clients.map(({ id, name }) => ({ id, name }))}
            selectedClientDomains={data.selectedClientDomains}
          />
        </div>
      ) : null}
    </div>
  );
}
