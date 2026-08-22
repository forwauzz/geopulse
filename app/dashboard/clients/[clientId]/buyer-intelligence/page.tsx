import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BuyerIntelligenceAgencyReportView } from '@/components/agency-report-view';
import { buildBuyerIntelligenceView, buyerIntelligenceViewKindSchema } from '@/lib/intelligence/buyer-intelligence-view-model';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBuyerIntelligenceSnapshotRepository } from '@/lib/server/buyer-intelligence-snapshot-repository';
import { createSupabaseBuyerIntelligenceGenerationRepository } from '@/lib/server/buyer-intelligence-generation-repository';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { resolveReportBrand } from '@workers/report/resolve-report-brand';
import { isE2EAuthEnabled } from '@/lib/supabase/e2e-auth';
import { buyerIntelligenceFixtureSnapshot } from '@/lib/intelligence/testing/buyer-intelligence-fixtures';
import { readBuyerIntelligenceHeroRef } from '@/lib/server/buyer-intelligence-hero';
import { createBrevoConnectorRepository } from '@/lib/server/brevo-connector-repository';
import { createBrevoReportDeliveryRepository } from '@/lib/server/brevo-report-delivery';
import { sendBrevoReportCanaryAction, syncBrevoReportAction } from '../../brevo/actions';

export const dynamic = 'force-dynamic';

const VIEW_LABELS = {
  prospect_preview: 'Prospect preview',
  full_baseline: 'Full baseline',
  monthly_brief: 'Monthly brief',
} as const;

function hexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
}

export default async function BuyerIntelligenceWorkspacePage({ params, searchParams }: {
  readonly params: Promise<{ clientId: string }>;
  readonly searchParams?: Promise<{ agencyAccount?: string; snapshot?: string; view?: string; batch?: string; contact?: string; brevoDelivery?: string }>;
}) {
  const [{ clientId }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { agencyAccount?: string; snapshot?: string; view?: string; batch?: string; contact?: string; brevoDelivery?: string }),
  ]);
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/clients/${clientId}/buyer-intelligence`);
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase: session,
    selectedAccountId: sp.agencyAccount,
    selectedClientId: clientId,
  });
  if (!workspace || workspace.data.selectedClientId !== clientId) notFound();
  const account = workspace.data.accounts.find((item) => item.id === workspace.data.selectedAccountId);
  const client = account?.clients.find((item) => item.id === clientId);
  if (!account || !client) notFound();

  const snapshotRepository = createBuyerIntelligenceSnapshotRepository(workspace.admin as never);
  const generationRepository = createSupabaseBuyerIntelligenceGenerationRepository(workspace.admin);
  const [storedSnapshots, history, bucket, clientRow] = await Promise.all([
    snapshotRepository.list({ type: 'agency_client', id: clientId }, { eligibility: 'eligible', limit: 24 }),
    generationRepository.list(account.id, clientId, 20),
    resolveReportFilesBucket(),
    workspace.admin.from('agency_clients').select('metadata').eq('id', clientId).eq('agency_account_id', account.id).maybeSingle(),
  ]);
  const snapshots = isE2EAuthEnabled() ? [buyerIntelligenceFixtureSnapshot(clientId)] : storedSnapshots;
  const selectedSnapshot = snapshots.find((item) => item.snapshotId === sp.snapshot) ?? snapshots[0] ?? null;
  const parsedView = buyerIntelligenceViewKindSchema.safeParse(sp.view);
  const viewKind = parsedView.success && parsedView.data !== 'agency_portfolio' ? parsedView.data : 'prospect_preview';
  const brandResolution = await resolveReportBrand({
    supabase: workspace.admin,
    scan: { agency_client_id: clientId, agency_account_id: account.id, startup_workspace_id: null },
    bucket,
  });
  const brand = brandResolution.brand;
  const hero = readBuyerIntelligenceHeroRef(clientRow.data?.metadata);
  const canonicalDomain = client.canonicalDomain;
  const { data: benchmarkDomain } = canonicalDomain
    ? await workspace.admin.from('benchmark_domains').select('id')
      .eq('canonical_domain', canonicalDomain).maybeSingle()
    : { data: null };
  const { data: monthlyConfig } = benchmarkDomain?.id
    ? await workspace.admin.from('client_benchmark_configs').select('metadata,report_email')
      .eq('agency_account_id', account.id).eq('benchmark_domain_id', benchmarkDomain.id).maybeSingle()
    : { data: null };
  const monthlyState = (monthlyConfig?.metadata ?? {}) as Record<string, unknown>;
  const accentColor = `#${hexChannel(brand.primary.r)}${hexChannel(brand.primary.g)}${hexChannel(brand.primary.b)}`;
  const model = selectedSnapshot ? buildBuyerIntelligenceView({
    kind: viewKind,
    snapshot: selectedSnapshot,
    ...(viewKind === 'prospect_preview' ? { fullBaselineHref: 'Available from your partner' } : {}),
  }) : null;
  const queryBase = `agencyAccount=${encodeURIComponent(account.id)}`;
  const idempotencyKey = selectedSnapshot
    ? `partner:${clientId}:${viewKind}:${selectedSnapshot.snapshotId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 72)}`.slice(0, 160)
    : '';
  const deliveryGeneration = selectedSnapshot
    ? history.find((item) => item.status === 'succeeded' && item.viewKind === 'prospect_preview' && item.snapshotId === selectedSnapshot.snapshotId) ?? null
    : null;
  const heldContact = sp.batch && sp.contact
    ? await createBrevoConnectorRepository(workspace.admin).loadHeldContact({ agencyAccountId: account.id, batchId: sp.batch, providerContactId: sp.contact })
    : null;
  const delivery = heldContact && deliveryGeneration && sp.batch && sp.contact
    ? await createBrevoReportDeliveryRepository(workspace.admin).load({ agencyAccountId: account.id, batchId: sp.batch, providerContactId: sp.contact, generationId: deliveryGeneration.id })
    : null;
  const deliveryStatusCopy: Record<string, string> = {
    synced: 'The private report link and cover thumbnail were synced to the Alie contact in Brevo.',
    delivered: 'Brevo accepted the one Alie canary email. Duplicate delivery is now locked.',
    'reconnect-required': 'Reconnect Brevo to approve report-field write access and transactional delivery.',
    'allowlist-failed': 'Delivery stopped because the contact is not the sole configured canary recipient.',
    'sync-failed': 'Brevo did not accept the report fields. Nothing was sent.',
    'send-failed': 'Brevo rejected the message before acceptance. You can retry after correcting the sender or permission.',
    'send-uncertain': 'Delivery could not be confirmed. Automatic retry is disabled to prevent a duplicate.',
    suppressed: 'Delivery stopped because Brevo now marks this contact unavailable or suppressed.',
    'duplicate-blocked': 'A concurrent or previous delivery already claimed this message.',
    'sync-required': 'Sync the report fields to Brevo before delivery.',
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 py-4">
      <Link href={`/dashboard/clients/${clientId}?${queryBase}`} className="text-sm font-semibold text-primary">← Back to {client.name}</Link>
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-tertiary/10 p-6 shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Partner workspace</p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background md:text-4xl">Turn one verified snapshot into a client-ready asset</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">Choose the audience and measurement period, inspect the exact artifact, then generate a private PDF. No contact import or external send occurs here.</p>
      </header>

      {model && selectedSnapshot ? (
        <>
          <section className="grid gap-3 rounded-2xl border border-outline-variant/20 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Latest snapshot</p><p className="mt-1 truncate font-mono text-xs text-on-background">{String(monthlyState['buyer_intelligence_last_snapshot_id'] ?? selectedSnapshot.snapshotId)}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Next run</p><p className="mt-1 font-semibold text-on-background">{typeof monthlyState['buyer_intelligence_next_at'] === 'string' ? new Date(monthlyState['buyer_intelligence_next_at']).toLocaleString('en-CA') : 'Awaiting first monthly cycle'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Comparison</p><p className="mt-1 font-semibold text-on-background">{selectedSnapshot.change.comparable ? `${selectedSnapshot.change.changes.filter((item) => item.direction === 'improved').length} improved · ${selectedSnapshot.change.changes.filter((item) => item.direction === 'regressed').length} regressed` : 'Baseline — comparison starts next cycle'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Verified fixes</p><p className="mt-1 font-semibold text-on-background">{selectedSnapshot.recommendations.filter((item) => item.verification.result === 'verified_improved').length} evidence-backed</p></div>
            {typeof monthlyState['buyer_intelligence_last_error'] === 'string' && monthlyState['buyer_intelligence_last_error'] ? <p role="alert" className="sm:col-span-2 lg:col-span-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">Automatic monthly run will retry: {monthlyState['buyer_intelligence_last_error']}</p> : null}
          </section>
          <section className="grid min-w-0 gap-4 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <form method="get" className="contents">
              <input type="hidden" name="agencyAccount" value={account.id} />
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-on-background">Measurement period
                <select name="snapshot" defaultValue={selectedSnapshot.snapshotId} className="w-full min-w-0 rounded-xl border border-outline-variant/30 bg-white px-3 py-2.5 font-normal">
                  {snapshots.map((snapshot) => <option key={snapshot.snapshotId} value={snapshot.snapshotId}>{new Date(snapshot.period.end).toLocaleDateString('en-CA')} · {snapshot.snapshotId}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-on-background">Artifact
                <select name="view" defaultValue={viewKind} className="w-full min-w-0 rounded-xl border border-outline-variant/30 bg-white px-3 py-2.5 font-normal">
                  {Object.entries(VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button className="rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary">Update preview</button>
            </form>
          </section>

          <BuyerIntelligenceAgencyReportView model={model} branding={{
            publisherName: brand.companyName,
            preparedBy: brand.footerNote ?? `${brand.companyName} team`,
            accentColor,
            heroImageUrl: hero ? `/api/buyer-intelligence/hero?agencyAccount=${account.id}&client=${clientId}` : null,
            footerNote: brand.footerNote,
          }} />

          <section className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-white/95 p-4 shadow-float backdrop-blur">
            <div><p className="font-semibold text-on-background">Preview approved?</p><p className="text-xs text-on-surface-variant">The PDF uses this same snapshot, section policy, and branding.</p></div>
            <form method="post" action="/api/buyer-intelligence/generate" target="_blank">
              <input type="hidden" name="agencyAccountId" value={account.id} />
              <input type="hidden" name="agencyClientId" value={clientId} />
              <input type="hidden" name="snapshotId" value={selectedSnapshot.snapshotId} />
              <input type="hidden" name="viewKind" value={viewKind} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <button className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary">Generate PDF in new tab</button>
            </form>
          </section>

          {heldContact ? (
            <section className="rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Brevo delivery canary</p>
              <h2 className="mt-2 font-headline text-xl font-bold text-on-background">Prepared only for {heldContact.firstName ?? 'this contact'} at {heldContact.companyName}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">Recipient: {heldContact.email}. No other held contact can use these controls.</p>
              {sp.brevoDelivery && deliveryStatusCopy[sp.brevoDelivery] ? <p role="status" className="mt-4 rounded-xl bg-surface-container-low p-3 text-sm">{deliveryStatusCopy[sp.brevoDelivery]}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {deliveryGeneration ? <>
                  <form action={syncBrevoReportAction}>
                    <input type="hidden" name="agencyAccountId" value={account.id} /><input type="hidden" name="agencyClientId" value={clientId} />
                    <input type="hidden" name="batchId" value={sp.batch} /><input type="hidden" name="providerContactId" value={sp.contact} />
                    <input type="hidden" name="generationId" value={deliveryGeneration.id} />
                    <button disabled={delivery?.status === 'delivered'} className="rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-50">{delivery?.status === 'synced' || delivery?.status === 'delivered' ? 'Report fields synced' : 'Sync report fields to Brevo'}</button>
                  </form>
                  <form action={sendBrevoReportCanaryAction}>
                    <input type="hidden" name="agencyAccountId" value={account.id} /><input type="hidden" name="agencyClientId" value={clientId} />
                    <input type="hidden" name="batchId" value={sp.batch} /><input type="hidden" name="providerContactId" value={sp.contact} />
                    <input type="hidden" name="generationId" value={deliveryGeneration.id} />
                    <button disabled={!delivery || !['synced', 'failed'].includes(delivery.status)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">{delivery?.status === 'delivered' ? 'Delivered by Brevo' : delivery?.status === 'failed' ? 'Retry Alie canary' : 'Send one Alie canary'}</button>
                  </form>
                  <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Status: {delivery?.status ?? 'prepared locally'}</span>
                </> : <p className="text-sm text-on-surface-variant">Generate the prospect-preview PDF first; then refresh this page to enable Brevo sync.</p>}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-2xl border border-amber-300/50 bg-amber-50 p-6">
          <h2 className="font-headline text-xl font-bold text-amber-950">No eligible buyer-intelligence snapshot yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-900">Complete a baseline measurement first. Quarantined or incomplete evidence never appears as a client-ready report.</p>
          <Link href={`/dashboard/clients/${clientId}?${queryBase}`} className="mt-4 inline-flex rounded-xl bg-amber-950 px-4 py-2.5 text-sm font-semibold text-white">Return to client setup</Link>
        </section>
      )}

      <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
        <h2 className="font-headline text-xl font-bold text-on-background">Generation history</h2>
        <p className="mt-1 text-sm text-on-surface-variant">A durable record of queued, rendering, successful, and failed artifacts.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-outline-variant/20 text-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="py-2">Created</th><th>Artifact</th><th>Status</th><th>Attempts</th><th>Snapshot</th><th>File</th></tr></thead>
            <tbody>{history.length ? history.map((item) => (
              <tr key={item.id} className="border-b border-outline-variant/10 last:border-0"><td className="py-3">{new Date(item.createdAt).toLocaleString('en-CA')}</td><td>{VIEW_LABELS[item.viewKind]}</td><td><span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold">{item.status}</span></td><td>{item.attempts}</td><td className="max-w-[260px] truncate font-mono text-xs">{item.snapshotId}</td><td>{item.status === 'succeeded' ? <span className="flex gap-3"><a className="font-semibold text-primary" target="_blank" rel="noreferrer" href={`/api/buyer-intelligence/generations/${item.id}?agencyAccount=${account.id}&client=${clientId}`}>Open</a><a className="font-semibold text-primary" href={`/api/buyer-intelligence/generations/${item.id}?agencyAccount=${account.id}&client=${clientId}&download=1`}>Download</a></span> : '—'}</td></tr>
            )) : <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant">No artifacts generated yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
