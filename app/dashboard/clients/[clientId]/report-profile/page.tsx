import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { getReportOverride } from '@/lib/server/report-settings-store';
import { resolveReportSettings } from '@/lib/server/report-settings';
import { loadLatestAgencyReport } from '@/lib/server/load-agency-report-snapshot';
import { ReportContentsSettings } from '@/components/report-contents-settings';
import { saveClientReportSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientReportProfilePage({ params }: {
  readonly params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/clients/${clientId}/report-profile`);
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await admin
    .from('agency_users')
    .select('agency_account_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.agency_account_id) notFound();
  const { data: client } = await admin
    .from('agency_clients')
    .select('id,name,display_name')
    .eq('id', clientId)
    .eq('agency_account_id', membership.agency_account_id)
    .maybeSingle();
  if (!client?.id) notFound();
  const [{ data: account }, agencyOverride, clientOverride, latestReport] = await Promise.all([
    admin.from('agency_accounts').select('name,metadata').eq('id', membership.agency_account_id).maybeSingle(),
    getReportOverride({ supabase: admin as never, scope: { table: 'agency_accounts', id: membership.agency_account_id } }),
    getReportOverride({ supabase: admin as never, scope: { table: 'agency_clients', id: clientId } }),
    loadLatestAgencyReport({ supabase: admin, agencyClientId: clientId }),
  ]);
  const inherited = resolveReportSettings(agencyOverride);
  const effective = resolveReportSettings(agencyOverride, clientOverride);
  const metadata = account?.metadata && typeof account.metadata === 'object'
    ? account.metadata as Record<string, unknown>
    : {};
  const brand = metadata['brand'] && typeof metadata['brand'] === 'object'
    ? metadata['brand'] as Record<string, unknown>
    : {};
  const brandName = typeof brand['companyName'] === 'string' ? brand['companyName'] : account?.name ?? 'Your agency';
  const brandColor = typeof brand['primary'] === 'string' && /^#[0-9a-f]{6}$/i.test(brand['primary'])
    ? brand['primary'] : '#565E74';
  const clientName = client.display_name || client.name;
  const saveAction = saveClientReportSettings.bind(null, clientId);

  return (
    <div className="py-2">
      <Link href={`/dashboard/clients/${clientId}`} className="text-sm font-semibold text-primary">← Back to {clientName}</Link>
      <div className="mb-5 mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Client report profile</p>
        <h1 className="mt-1.5 font-headline text-2xl font-semibold text-on-background">{clientName}</h1>
        <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">This client follows the agency profile except for the fields changed here. Every curated choice is disclosed in the delivered report.</p>
      </div>
      <ReportContentsSettings
        agencyName={clientName}
        initialSettings={effective}
        initialOverride={clientOverride}
        inheritedSettings={inherited}
        saveAction={saveAction}
        previewSnapshot={latestReport?.snapshot ?? null}
        brandName={brandName}
        brandColor={brandColor}
        saveLabel={`Save ${clientName} report`}
      />
    </div>
  );
}
