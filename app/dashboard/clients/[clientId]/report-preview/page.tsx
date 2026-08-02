import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ReportPreviewPage } from '@/components/report-preview-page';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { loadLatestAgencyReport } from '@/lib/server/load-agency-report-snapshot';
import { getReportOverride } from '@/lib/server/report-settings-store';
import { resolveReportSettings } from '@/lib/server/report-settings';

export const dynamic = 'force-dynamic';

export default async function ClientReportPreviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ clientId: string }>;
  readonly searchParams?: Promise<{ agencyAccount?: string }>;
}) {
  const [{ clientId }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { agencyAccount?: string }),
  ]);
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/clients/${clientId}/report-preview`);
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

  const [agencyOverride, clientOverride, latestReport, accountRow] = await Promise.all([
    getReportOverride({ supabase: workspace.admin as never, scope: { table: 'agency_accounts', id: account.id } }),
    getReportOverride({ supabase: workspace.admin as never, scope: { table: 'agency_clients', id: clientId } }),
    loadLatestAgencyReport({ supabase: workspace.admin, agencyClientId: clientId }),
    workspace.admin.from('agency_accounts').select('name,metadata').eq('id', account.id).maybeSingle(),
  ]);
  const metadata = accountRow.data?.metadata && typeof accountRow.data.metadata === 'object'
    ? accountRow.data.metadata as Record<string, unknown>
    : {};
  const brand = metadata['brand'] && typeof metadata['brand'] === 'object'
    ? metadata['brand'] as Record<string, unknown>
    : {};
  const brandName = typeof brand['companyName'] === 'string' ? brand['companyName'] : accountRow.data?.name ?? account.name;
  const brandColor = typeof brand['primary'] === 'string' && /^#[0-9a-f]{6}$/i.test(brand['primary'])
    ? brand['primary']
    : '#565E74';

  return (
    <main className="mx-auto max-w-6xl space-y-5 py-4">
      <Link href={`/dashboard/clients/${clientId}?agencyAccount=${account.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <span aria-hidden>←</span>
        Back to {client.name}
      </Link>
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-tertiary/10 p-5 shadow-float sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Private client preview</p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">See the proof before the client does</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant">This uses the same quality-gated snapshot as the PDF and future client share. It stays private and cannot be emailed or opened publicly from this page.</p>
      </header>
      <ReportPreviewPage
        snapshot={latestReport?.snapshot ?? null}
        settings={resolveReportSettings(agencyOverride, clientOverride)}
        brandName={brandName}
        brandColor={brandColor}
      />
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/clients/${clientId}?agencyAccount=${account.id}`} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Return to the next action</Link>
        <Link href={`/dashboard/clients/${clientId}/report-profile`} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background">Adjust report contents</Link>
      </div>
    </main>
  );
}
