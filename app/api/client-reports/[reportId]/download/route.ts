import { getScanApiEnv } from '@/lib/server/cf-env';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { readAgencyReportSnapshot } from '@/lib/server/agency-report-snapshot';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isClientReportSharingHeld, isReportQuarantined } from '@/lib/server/report-quarantine';

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
    .select('id,agency_client_id,pdf_r2_key,metadata')
    .eq('id', reportId)
    .eq('platform', 'combined')
    .eq('report_payload_version', '2')
    .maybeSingle();
  if (!report?.agency_client_id || !report.pdf_r2_key || isReportQuarantined(report.metadata)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: client } = await admin
    .from('agency_clients')
    .select('id,metadata')
    .eq('id', report.agency_client_id)
    .maybeSingle();
  const metadata = client?.metadata && typeof client.metadata === 'object'
    ? client.metadata as Record<string, unknown>
    : null;
  if (isClientReportSharingHeld(metadata) || metadata?.['client_summary_share_token'] !== share) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const bucket = await resolveReportFilesBucket();
  if (!bucket) return Response.json({ error: 'report_storage_unavailable' }, { status: 503 });
  const object = await bucket.get(report.pdf_r2_key);
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  const bytes = await object.arrayBuffer();
  const reportMetadata = report.metadata && typeof report.metadata === 'object'
    ? report.metadata as Record<string, unknown>
    : null;
  const snapshot = readAgencyReportSnapshot(reportMetadata?.['snapshot']);

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
