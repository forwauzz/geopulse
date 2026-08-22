import { verifyAuditFullReportCapability } from '@/lib/server/audit-report-capability';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { scanContextFromRow } from '@/lib/server/email-campaign-scan-context';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { buildAuditCampaignThumbnailHtml, renderAuditCampaignThumbnail } from '@workers/report/audit-campaign-thumbnail';
import { buildCoverDesign } from '@workers/report/design-agent';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const env = await getScanApiEnv();
  const { token } = await context.params;
  const secret = env.AUDIT_REPORT_CAPABILITY_SECRET?.trim();
  if (!secret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'audit_thumbnail_unavailable' }, { status: 503 });
  }
  const verified = verifyAuditFullReportCapability({ token, secret, nowMs: Date.now() });
  if (!verified.ok) return Response.json({ error: verified.code }, { status: verified.code === 'expired' ? 410 : 403 });

  const db = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: scan }, { data: report }] = await Promise.all([
    db.from('scans')
      .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,share_slug,user_id,run_source')
      .eq('id', verified.payload.scanId)
      .maybeSingle(),
    db.from('reports').select('pdf_url').eq('scan_id', verified.payload.scanId).eq('type', 'deep_audit').not('pdf_url', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!scan || scan.domain?.toLowerCase() !== verified.payload.domain || scan.run_source === 'internal_benchmark'
    || (scan.user_id !== null && !scan.share_slug) || !report?.pdf_url) {
    return Response.json({ error: 'capability_target_mismatch' }, { status: 403 });
  }
  const signals = scanContextFromRow(scan, env.NEXT_PUBLIC_APP_URL);
  if (!signals) return Response.json({ error: 'audit_thumbnail_unavailable' }, { status: 503 });

  const design = await buildCoverDesign({
    supabase: db,
    env,
    domain: verified.payload.domain,
    seedUrl: signals.siteUrl ?? `https://${verified.payload.domain}`,
    generatedAt: signals.completedAt ?? new Date().toISOString(),
    scanId: verified.payload.scanId,
  });
  const html = buildAuditCampaignThumbnailHtml({
    firstName: verified.payload.recipientFirstName,
    company: verified.payload.recipientCompany,
    domain: verified.payload.domain,
    generatedAt: signals.completedAt ?? new Date().toISOString(),
    primaryHex: design?.themePrimaryHex,
    heroImage: design?.heroImage,
  });
  const bytes = await renderAuditCampaignThumbnail({ env, html });
  if (!bytes) return Response.json({ error: 'audit_thumbnail_render_failed' }, { status: 503 });
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-disposition': `inline; filename="${verified.payload.domain.replace(/[^a-z0-9.-]+/gi, '-')}-audit-cover.jpg"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
