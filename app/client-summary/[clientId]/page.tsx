import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { loadClientOutcomeEngine } from '@/lib/server/client-outcome-engine';
import { getBrandSettingsView, resolveReportFilesPublicBase } from '@/lib/server/report-branding-settings';
import { loadLatestAgencyReport } from '@/lib/server/load-agency-report-snapshot';
import { AgencyReportView } from '@/components/agency-report-view';
import { PrintScorecardButton } from '@/components/print-scorecard-button';
import { isClientReportSharingHeld } from '@/lib/server/report-quarantine';
import type { ClientMeasurementScope } from '@/lib/server/client-measurement-scope';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ clientId: string }>;
  readonly searchParams: Promise<{ share?: string }>;
}) {
  const [{ clientId }, sp, env] = await Promise.all([params, searchParams, getScanApiEnv()]);
  if (!UUID.test(clientId) || !sp.share || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: client } = await admin
    .from('agency_clients')
    .select('id,agency_account_id,name,display_name,canonical_domain,metadata,agency_accounts(name,metadata)')
    .eq('id', clientId)
    .maybeSingle();
  if (!client?.metadata || typeof client.metadata !== 'object') notFound();
  const clientMetadata = client.metadata as Record<string, unknown>;
  if (isClientReportSharingHeld(clientMetadata)) notFound();
  if (clientMetadata['client_summary_share_token'] !== sp.share) notFound();
  const domain = typeof client.canonical_domain === 'string' ? client.canonical_domain : null;
  if (!domain) notFound();
  const { data: benchmarkDomain } = await admin
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', domain.toLowerCase().replace(/^www\./, ''))
    .maybeSingle();
  const { data: config } = benchmarkDomain?.id
    ? await admin
        .from('client_benchmark_configs')
        .select('query_set_id,platforms_enabled,metadata')
        .eq('agency_account_id', client.agency_account_id)
        .eq('benchmark_domain_id', benchmarkDomain.id)
        .maybeSingle()
    : { data: null };
  const measurementScope: ClientMeasurementScope | undefined = typeof config?.query_set_id === 'string'
    ? {
        querySetId: config.query_set_id,
        contextVersion: typeof config.metadata?.['organization_context_version'] === 'string'
          ? String(config.metadata['organization_context_version'])
          : `unbound-context:${String(config.query_set_id)}`,
        agencyAccountId: client.agency_account_id,
        enabledPlatforms: Array.isArray(config.platforms_enabled) ? config.platforms_enabled : [],
      }
    : undefined;

  const accountRaw = Array.isArray(client.agency_accounts) ? client.agency_accounts[0] : client.agency_accounts;
  const account = (accountRaw ?? {}) as Record<string, unknown>;
  const brand = await getBrandSettingsView({
    supabase: admin as never,
    scope: { table: 'agency_accounts', id: client.agency_account_id },
    publicBase: await resolveReportFilesPublicBase(),
  }).catch(() => null);
  const agencyName = brand?.companyName || (typeof account['name'] === 'string' ? account['name'] : 'Your marketing partner');
  const scansPromise = admin
    .from('scans')
    .select('score,created_at,issues_json,full_results_json')
    .eq('agency_client_id', clientId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(2)
    .then(async (owned) => {
      if ((owned.data?.length ?? 0) > 0 || owned.error) return owned;
      // Legacy scans may predate agency_client_id. Supabase's eq() parameterizes the domain safely.
      return admin
        .from('scans')
        .select('score,created_at,issues_json,full_results_json')
        .eq('domain', domain)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(2);
    });
  const [storedReport, scansResult] = await Promise.all([
    loadLatestAgencyReport({ supabase: admin, agencyClientId: clientId }),
    scansPromise,
  ]);
  const scans = (scansResult.data ?? []) as Array<{
    score: number | null;
    created_at: string;
    issues_json: unknown;
    full_results_json: unknown;
  }>;
  const latestScan = scans[0] ?? null;
  const previousScan = scans[1] ?? null;
  const outcome = await loadClientOutcomeEngine({
    supabase: admin,
    domain,
    latestScan,
    measurementScope,
  });
  const readinessChange = latestScan?.score !== null && latestScan?.score !== undefined
    && previousScan?.score !== null && previousScan?.score !== undefined
    ? Math.round((latestScan.score - previousScan.score) * 10) / 10
    : null;

  if (!storedReport) {
    return (
      <main className="min-h-screen bg-[#eef0f3] px-4 py-12 text-[#111827]">
        <div className="mx-auto max-w-3xl rounded-[28px] bg-white p-8 shadow-xl md:p-12" style={{ borderTop: `7px solid ${brand?.primaryHex || '#565E74'}` }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#687083]">{agencyName} · AI visibility report</p>
          <h1 className="mt-4 font-headline text-4xl font-semibold">Your verified report is being prepared</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#596174]">We only publish a client report after every included AI assistant has settled into one consistent, reproducible snapshot. No placeholder or mismatched figures are shown.</p>
        </div>
      </main>
    );
  }

  // Service-role-only evidence. No IP address, user agent, or other visitor fingerprint is stored.
  await admin.from('report_view_events').insert({
    report_id: storedReport.reportId,
    agency_client_id: clientId,
    event_type: 'view',
    metadata: { surface: 'client_summary' },
  }).then(() => undefined, () => undefined);

  const downloadUrl = `/api/client-reports/${encodeURIComponent(storedReport.reportId)}/download?share=${encodeURIComponent(sp.share)}`;
  return (
    <main className="min-h-screen bg-[#e9edf2] px-3 py-6 md:px-8 md:py-10 print:bg-white print:p-0">
      <PrintScorecardButton />
      <div className="mx-auto max-w-6xl">
        <AgencyReportView
          snapshot={storedReport.snapshot}
          agencyName={agencyName}
          brandColor={brand?.primaryHex || '#565E74'}
          logoUrl={brand?.logoUrl}
          footerNote={brand?.footerNote}
          showPoweredBy={brand?.showPoweredBy !== false}
          readinessScore={latestScan?.score ?? null}
          readinessChange={readinessChange}
          actions={outcome.actions
            .filter((action) => action.status === 'pending')
            .map((action) => ({
              key: action.key,
              nextStep: action.nextStep,
              why: action.why,
              impact: action.impact,
              effort: action.effort,
            }))}
          downloadUrl={storedReport.pdfR2Key ? downloadUrl : null}
        />
      </div>
    </main>
  );
}
