import { getScanApiEnv } from '@/lib/server/cf-env';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { readAgencyReportSnapshot } from '@/lib/server/agency-report-snapshot';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isClientReportSharingHeld, isReportQuarantined } from '@/lib/server/report-quarantine';
import { evaluateStoredAgencyReportIntegrity } from '@/lib/intelligence/agency-report-integrity';
import { structuredError } from '@/lib/server/structured-log';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'client';
}

function reportDownloadUnavailable(stage: string, error: unknown): Response {
  const errorCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'unavailable';
  structuredError('client_report_download_unavailable', { stage, errorCode });
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'This report is temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
): Promise<Response> {
  const { reportId } = await context.params;
  const share = new URL(request.url).searchParams.get('share');
  if (!UUID.test(reportId) || !share) return Response.json({ error: 'not_found' }, { status: 404 });

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'server_misconfigured' }, { status: 503 });
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let reportResult;
  try {
    reportResult = await admin
      .from('gpm_reports')
      .select('id,config_id,agency_client_id,pdf_r2_key,metadata')
      .eq('id', reportId)
      .eq('platform', 'combined')
      .eq('report_payload_version', '2')
      .maybeSingle();
  } catch (error) {
    return reportDownloadUnavailable('report_lookup', error);
  }
  if (reportResult.error) return reportDownloadUnavailable('report_lookup', reportResult.error);
  const report = reportResult.data;
  if (!report?.agency_client_id || !report.pdf_r2_key || isReportQuarantined(report.metadata)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  let clientResult;
  try {
    clientResult = await admin
      .from('agency_clients')
      .select('id,agency_account_id,canonical_domain,metadata')
      .eq('id', report.agency_client_id)
      .maybeSingle();
  } catch (error) {
    return reportDownloadUnavailable('client_lookup', error);
  }
  if (clientResult.error) return reportDownloadUnavailable('client_lookup', clientResult.error);
  const client = clientResult.data;
  const metadata = client?.metadata && typeof client.metadata === 'object'
    ? client.metadata as Record<string, unknown>
    : null;
  if (isClientReportSharingHeld(metadata) || metadata?.['client_summary_share_token'] !== share) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const reportMetadata = report.metadata && typeof report.metadata === 'object'
    ? report.metadata as Record<string, unknown>
    : null;
  const snapshot = readAgencyReportSnapshot(reportMetadata?.['snapshot']);
  if (!snapshot || !client?.canonical_domain) return Response.json({ error: 'not_found' }, { status: 404 });
  const canonicalDomain = String(client.canonical_domain).trim().toLowerCase().replace(/^www\./, '');
  let domainResult;
  try {
    domainResult = await admin
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonicalDomain)
      .maybeSingle();
  } catch (error) {
    return reportDownloadUnavailable('domain_lookup', error);
  }
  if (domainResult.error) return reportDownloadUnavailable('domain_lookup', domainResult.error);
  const domain = domainResult.data;
  if (!domain?.id) return Response.json({ error: 'not_found' }, { status: 404 });
  let configResult;
  try {
    configResult = await admin
      .from('client_benchmark_configs')
      .select('id,query_set_id,startup_workspace_id,agency_account_id,metadata')
      .eq('id', report.config_id)
      .eq('benchmark_domain_id', domain.id)
      .maybeSingle();
  } catch (error) {
    return reportDownloadUnavailable('config_lookup', error);
  }
  if (configResult.error) return reportDownloadUnavailable('config_lookup', configResult.error);
  const config = configResult.data;
  const contextVersion = typeof config?.metadata?.['organization_context_version'] === 'string'
    ? String(config.metadata['organization_context_version'])
    : null;
  const querySetVersion = typeof config?.metadata?.['query_set_version'] === 'string'
    ? String(config.metadata['query_set_version'])
    : null;
  const competitorCohortVersion = typeof config?.metadata?.['competitor_cohort_version'] === 'string'
    ? String(config.metadata['competitor_cohort_version'])
    : null;
  const agencyClientOwnerId = typeof config?.metadata?.['agency_client_id'] === 'string'
    ? String(config.metadata['agency_client_id'])
    : null;
  if (!config?.query_set_id || !contextVersion || !querySetVersion || !competitorCohortVersion || !evaluateStoredAgencyReportIntegrity({
    integrity: reportMetadata?.['integrity'],
    snapshot,
    expected: {
      configId: String(config.id),
      clientId: String(report.agency_client_id),
      canonicalDomain,
      ownerType: agencyClientOwnerId
        ? 'agency_client'
        : typeof config.startup_workspace_id === 'string' ? 'startup_workspace' : 'agency_account',
      ownerId: agencyClientOwnerId
        ?? (typeof config.startup_workspace_id === 'string' ? config.startup_workspace_id : null)
        ?? (typeof config.agency_account_id === 'string' ? config.agency_account_id : null),
      querySetId: String(config.query_set_id),
      contextVersion,
      querySetVersion,
      competitorCohortVersion,
    },
  }).compatible) return Response.json({ error: 'not_found' }, { status: 404 });

  let bucket;
  let object;
  try {
    bucket = await resolveReportFilesBucket();
    if (!bucket) return reportDownloadUnavailable('object_storage_binding', null);
    object = await bucket.get(report.pdf_r2_key);
  } catch (error) {
    return reportDownloadUnavailable('object_storage_read', error);
  }
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  let bytes;
  try {
    bytes = await object.arrayBuffer();
  } catch (error) {
    return reportDownloadUnavailable('object_storage_body', error);
  }
  await admin.from('report_view_events').insert({
    report_id: reportId,
    agency_client_id: report.agency_client_id,
    event_type: 'download',
    metadata: { surface: 'client_report_download' },
  }).then(() => undefined, () => undefined);

  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename(snapshot?.clientName ?? 'client')}-ai-visibility-${filename(snapshot?.windowDate ?? 'report')}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
