import { NextResponse } from 'next/server';
import { verifyAuditFullReportCapability } from '@/lib/server/audit-report-capability';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { getScanForShareSlug } from '@/lib/server/get-scan-for-public-share';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const env = await getScanApiEnv();
  const { token } = await context.params;
  const secret = env.AUDIT_REPORT_CAPABILITY_SECRET?.trim();
  if (!secret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'full_report_unavailable' }, { status: 503 });
  }
  const verified = verifyAuditFullReportCapability({ token, secret, nowMs: Date.now() });
  if (!verified.ok) return Response.json({ error: verified.code }, { status: verified.code === 'expired' ? 410 : 403 });

  const url = new URL(request.url);
  const db = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let scanId = verified.payload.scanId;
  let redirectTarget: URL;
  if (verified.payload.shareSlug) {
    const visible = await getScanForShareSlug(verified.payload.shareSlug, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    if (!visible.ok || visible.data.scanId !== scanId || visible.data.domain?.toLowerCase() !== verified.payload.domain) {
      return Response.json({ error: 'capability_target_mismatch' }, { status: 403 });
    }
    redirectTarget = new URL(`/share/${encodeURIComponent(verified.payload.shareSlug)}`, env.NEXT_PUBLIC_APP_URL);
  } else {
    const [{ data: scan }, { data: report }] = await Promise.all([
      db.from('scans').select('id,domain').eq('id', scanId).is('user_id', null).neq('run_source', 'internal_benchmark').maybeSingle(),
      db.from('reports').select('pdf_url').eq('scan_id', scanId).eq('type', 'deep_audit').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!scan || scan.domain?.toLowerCase() !== verified.payload.domain || !report?.pdf_url) {
      return Response.json({ error: 'capability_target_mismatch' }, { status: 403 });
    }
    try {
      redirectTarget = new URL(report.pdf_url);
      if (redirectTarget.protocol !== 'https:') throw new Error('invalid_report_protocol');
    } catch {
      return Response.json({ error: 'full_report_unavailable' }, { status: 503 });
    }
  }
  await emitMarketingEvent(db, 'report_viewed', {
    scan_id: scanId,
    utm_source: url.searchParams.get('utm_source') ?? 'apollo',
    utm_medium: url.searchParams.get('utm_medium') ?? 'email',
    utm_campaign: url.searchParams.get('utm_campaign') ?? verified.payload.campaignId,
    utm_content: url.searchParams.get('utm_content') ?? 'full_report_cta',
    channel: 'email',
    metadata: { surface: 'audit_full_report', campaignId: verified.payload.campaignId, recipientHash: verified.payload.recipientHash },
  });
  return NextResponse.redirect(redirectTarget);
}
