import { getScanApiEnv } from '@/lib/server/cf-env';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { readAgencyReportSnapshot } from '@/lib/server/agency-report-snapshot';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isClientReportSharingHeld, isReportQuarantined } from '@/lib/server/report-quarantine';
import { evaluateStoredAgencyReportIntegrity } from '@/lib/intelligence/agency-report-integrity';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'client';
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
  const { data: report } = await admin
    .from('gpm_reports')
    .select('id,config_id,agency_client_id,pdf_r2_key,metadata')
    .eq('id', reportId)
    .eq('platform', 'combined')
    .eq('report_payload_version', '2')
    .maybeSingle();
  if (!report?.agency_client_id || !report.pdf_r2_key || isReportQuarantined(report.metadata)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: client } = await admin
    .from('agency_clients')
    .select('id,agency_account_id,canonical_domain,metadata')
    .eq('id', report.agency_client_id)
    .maybeSingle();
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
  const { data: domain } = await admin
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', canonicalDomain)
    .maybeSingle();
  if (!domain?.id) return Response.json({ error: 'not_found' }, { status: 404 });
  const { data: config } = await admin
    .from('client_benchmark_configs')
    .select('id,query_set_id,startup_workspace_id,agency_account_id,metadata')
    .eq('id', report.config_id)
    .eq('benchmark_domain_id', domain.id)
    .maybeSingle();
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

  const bucket = await resolveReportFilesBucket();
  if (!bucket) return Response.json({ error: 'report_storage_unavailable' }, { status: 503 });
  const object = await bucket.get(report.pdf_r2_key);
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  const bytes = await object.arrayBuffer();
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
