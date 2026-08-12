import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BREVO_SCOPES, listBrevoContacts, listBrevoLists, type BrevoContactCandidate, type BrevoList } from '@/lib/connectors/providers/brevo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBrevoConnectorRepository, type HeldBatch } from '@/lib/server/brevo-connector-repository';
import { createBrevoHeldBatchAction, disconnectBrevoAction, prepareBrevoProspectPreviewAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, string> = {
  connected: 'Brevo connected. Choose a list to review contacts.',
  disconnected: 'Brevo was disconnected and its stored tokens were removed.',
  'batch-held': 'Contacts were added to a held review batch. Nothing was sent.',
  'batch-failed': 'The batch was not created. A selected contact may be incomplete, suppressed, or already held.',
  'access-denied': 'Brevo access was not granted. No connection was stored.',
  'authorization-error': 'The connection request could not be verified.',
  'state-expired': 'The connection request expired. Please start again.',
  'connection-failed': 'Brevo could not be connected. Please retry.',
  'configuration-error': 'Brevo OAuth is not configured for this environment.',
  'selection-invalid': 'Choose between 1 and 10 eligible contacts.',
  'preview-failed': 'The preview could not be prepared. Verify that this domain has a completed baseline, then retry.',
};

export default async function BrevoPartnerPage({ searchParams }: {
  readonly searchParams?: Promise<{ agencyAccount?: string; list?: string; listOffset?: string; offset?: string; brevo?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/clients/brevo');
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id, supabase: session, selectedAccountId: sp.agencyAccount,
  });
  if (!workspace) redirect('/dashboard/clients');
  const account = workspace.data.accounts.find((item) => item.id === workspace.data.selectedAccountId)
    ?? workspace.data.accounts[0]!;
  const repository = createBrevoConnectorRepository(workspace.admin);
  const connection = await repository.load(account.id);
  const batches: HeldBatch[] = await repository.listHeldBatches(account.id);
  const listOffset = Math.max(0, Number.parseInt(sp.listOffset ?? '0', 10) || 0);
  const offset = Math.max(0, Number.parseInt(sp.offset ?? '0', 10) || 0);
  let lists: readonly BrevoList[] = [];
  let listCount = 0;
  let contacts: readonly BrevoContactCandidate[] = [];
  let contactCount = 0;
  let loadError: string | null = null;
  if (connection?.account.status === 'connected') {
    const env = await getScanApiEnv();
    if (!env.BREVO_OAUTH_CLIENT_ID || !env.BREVO_OAUTH_CLIENT_SECRET || !env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY) {
      loadError = 'Brevo OAuth is not configured for this environment.';
    } else {
      try {
        const token = await repository.accessToken({
          agencyAccountId: account.id, clientId: env.BREVO_OAUTH_CLIENT_ID,
          clientSecret: env.BREVO_OAUTH_CLIENT_SECRET,
          encryptionKey: env.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
        });
        const listPage = await listBrevoLists({ accessToken: token.accessToken, offset: listOffset });
        lists = listPage.lists;
        listCount = listPage.count;
        if (sp.list) {
          const contactPage = await listBrevoContacts({ accessToken: token.accessToken, listId: sp.list, offset });
          contacts = contactPage.contacts;
          contactCount = contactPage.count;
        }
      } catch {
        loadError = 'Brevo data could not be loaded. Reconnect if the authorization has expired.';
      }
    }
  }
  const selectedList = lists.find((list) => list.id === sp.list) ?? null;
  const selectableCount = contacts.filter((contact) => !contact.selectionBlockReason).length;
  const queryBase = `agencyAccount=${encodeURIComponent(account.id)}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 py-4">
      <Link href={`/dashboard/clients?${queryBase}`} className="text-sm font-semibold text-primary">← Back to clients</Link>
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-white to-tertiary/10 p-6 shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Prospect source</p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Bring prospects in from Brevo</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">Choose eligible contacts and hold them for review. A report is written back or delivered by Brevo only after you approve that exact contact from its preview.</p>
      </header>

      {sp.brevo && STATUS_COPY[sp.brevo] ? (
        <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-on-background">{STATUS_COPY[sp.brevo]}</p>
      ) : null}
      {loadError ? <p role="alert" className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{loadError}</p> : null}

      <section className="rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-background">Brevo connection</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{connection ? `${connection.account.status} · scope: ${connection.account.scopes.join(', ')}` : 'Not connected'}</p>
          </div>
          {connection?.account.status === 'connected' ? (
            <div className="flex flex-wrap gap-2">
            {BREVO_SCOPES.some((scope) => !connection.account.scopes.includes(scope)) ? <a href={`/api/connectors/brevo/start?${queryBase}`} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Reconnect for report delivery</a> : null}
            <form action={disconnectBrevoAction}>
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <button className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-background">Disconnect</button>
            </form>
            </div>
          ) : (
            <a href={`/api/connectors/brevo/start?${queryBase}`} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Connect Brevo</a>
          )}
        </div>
      </section>

      {connection?.account.status === 'connected' && lists.length > 0 ? (
        <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
          <div><h2 className="font-headline text-xl font-bold text-on-background">1. Choose a list</h2><p className="mt-1 text-sm text-on-surface-variant">{listCount} Brevo list{listCount === 1 ? '' : 's'} available.</p></div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="agencyAccount" value={account.id} />
            <input type="hidden" name="listOffset" value={listOffset} />
            <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-semibold text-on-background">Brevo list
              <select name="list" defaultValue={sp.list ?? ''} className="rounded-xl border border-outline-variant/30 bg-white px-3 py-2.5 font-normal">
                <option value="">Select a list</option>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.name}{list.contactCount === null ? '' : ` · ${list.contactCount}`}</option>)}
              </select>
            </label>
            <button className="rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary">Load contacts</button>
          </form>
          <div className="flex gap-2">
            {listOffset > 0 ? <Link className="rounded-lg border px-3 py-2 text-sm" href={`/dashboard/clients/brevo?${queryBase}&listOffset=${Math.max(0, listOffset - 50)}`}>Previous lists</Link> : null}
            {listOffset + lists.length < listCount ? <Link className="rounded-lg border px-3 py-2 text-sm" href={`/dashboard/clients/brevo?${queryBase}&listOffset=${listOffset + 50}`}>Next lists</Link> : null}
          </div>
        </section>
      ) : null}

      {selectedList ? (
        <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
          <div><h2 className="font-headline text-xl font-bold text-on-background">2. Hold contacts for review</h2><p className="mt-1 text-sm text-on-surface-variant">{selectedList.name} · {contactCount} contacts · {selectableCount} selectable on this page. Missing or suppressed records stay disabled.</p></div>
          <form action={createBrevoHeldBatchAction} className="space-y-4">
            <input type="hidden" name="agencyAccountId" value={account.id} />
            <input type="hidden" name="connectorAccountId" value={connection!.account.accountId} />
            <input type="hidden" name="listId" value={selectedList.id} />
            <input type="hidden" name="offset" value={offset} />
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="p-3">Select</th><th>Contact</th><th>Company</th><th>Website</th><th>Status</th></tr></thead>
                <tbody>{contacts.map((contact) => (
                  <tr key={contact.providerContactId} className="border-t border-outline-variant/15">
                    <td className="p-3"><input type="checkbox" name="providerContactId" value={contact.providerContactId} disabled={Boolean(contact.selectionBlockReason)} aria-label={`Select ${contact.email ?? contact.providerContactId}`} /></td>
                    <td><span className="block font-medium text-on-background">{contact.firstName ?? '—'}</span><span className="text-xs text-on-surface-variant">{contact.email ?? 'No email'}</span></td>
                    <td>{contact.companyName ?? '—'}</td><td>{contact.canonicalDomain ?? '—'}</td>
                    <td className={contact.selectionBlockReason ? 'text-error' : 'text-primary'}>{contact.selectionBlockReason ?? 'Eligible'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {offset > 0 ? <Link className="rounded-lg border px-3 py-2 text-sm" href={`/dashboard/clients/brevo?${queryBase}&list=${selectedList.id}&offset=${Math.max(0, offset - 50)}`}>Previous</Link> : null}
                {offset + contacts.length < contactCount ? <Link className="rounded-lg border px-3 py-2 text-sm" href={`/dashboard/clients/brevo?${queryBase}&list=${selectedList.id}&offset=${offset + 50}`}>Next</Link> : null}
              </div>
              <button disabled={selectableCount === 0} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary disabled:opacity-50">Create held batch</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm">
        <h2 className="font-headline text-xl font-bold text-on-background">Held batches</h2>
        <p className="mt-1 text-sm text-on-surface-variant">These contacts are not enrolled and no message has been sent.</p>
        <div className="mt-4 space-y-3">{batches.length ? batches.map((batch) => (
          <article key={batch.id} className="rounded-xl border border-outline-variant/20 p-4">
            <div className="flex justify-between gap-3"><strong>{batch.contacts.length} contact{batch.contacts.length === 1 ? '' : 's'}</strong><span className="text-xs uppercase tracking-wide text-primary">{batch.status}</span></div>
            <p className="mt-1 text-xs text-on-surface-variant">{new Date(batch.createdAt).toLocaleString('en-CA')}</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">{batch.contacts.map((contact) => {
              const client = account.clients.find((item) => item.canonicalDomain === contact.canonicalDomain);
              return <li key={contact.providerContactId} className="rounded-lg bg-surface-container-low p-3 text-sm">
                <span className="block font-semibold">{contact.companyName}</span>
                <span className="text-xs text-on-surface-variant">{contact.firstName ?? 'Contact'} · {contact.canonicalDomain}</span>
                {client ? <form action={prepareBrevoProspectPreviewAction} className="mt-3">
                  <input type="hidden" name="agencyAccountId" value={account.id} />
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="providerContactId" value={contact.providerContactId} />
                  <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary">Prepare prospect preview</button>
                </form> : <span className="mt-2 block text-xs text-error">Create or verify this client baseline before preparing a preview.</span>}
              </li>;
            })}</ul>
          </article>
        )) : <p className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">No held Brevo contacts yet.</p>}</div>
      </section>
    </main>
  );
}
