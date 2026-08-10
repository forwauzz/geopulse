import { PDFDocument } from 'pdf-lib';
import { verifyAuditFullReportCapability } from '@/lib/server/audit-report-capability';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { scanContextFromRow } from '@/lib/server/email-campaign-scan-context';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { buildCoverDesign } from '@workers/report/design-agent';
import {
  buildAuditCampaignPreviewPdf,
  deriveAuditCampaignPreviewFromSignals,
} from '@workers/report/audit-campaign-preview';

export const runtime = 'nodejs';

const MAX_CANONICAL_PDF_BYTES = 20_000_000;

function trustedReportUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'getgeopulse.com' && url.hostname !== 'www.getgeopulse.com' && !url.hostname.endsWith('.r2.dev')) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const env = await getScanApiEnv();
  const { token } = await context.params;
  const secret = env.AUDIT_REPORT_CAPABILITY_SECRET?.trim();
  if (!secret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'audit_preview_unavailable' }, { status: 503 });
  }
  const verified = verifyAuditFullReportCapability({ token, secret, nowMs: Date.now() });
  if (!verified.ok) return Response.json({ error: verified.code }, { status: verified.code === 'expired' ? 410 : 403 });

  const db = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: scan }, { data: report }] = await Promise.all([
    db.from('scans')
      .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,share_slug,user_id,run_source')
      .eq('id', verified.payload.scanId)
      .maybeSingle(),
    db.from('reports')
      .select('pdf_url')
      .eq('scan_id', verified.payload.scanId)
      .eq('type', 'deep_audit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!scan || scan.domain?.toLowerCase() !== verified.payload.domain || scan.run_source === 'internal_benchmark'
    || (scan.user_id !== null && !scan.share_slug) || !report?.pdf_url) {
    return Response.json({ error: 'capability_target_mismatch' }, { status: 403 });
  }
  const signals = scanContextFromRow(scan, env.NEXT_PUBLIC_APP_URL);
  const reportUrl = trustedReportUrl(report.pdf_url);
  if (!signals || !reportUrl) return Response.json({ error: 'audit_preview_unavailable' }, { status: 503 });

  const canonicalResponse = await fetch(reportUrl, { signal: AbortSignal.timeout(20_000) });
  if (!canonicalResponse.ok) return Response.json({ error: 'full_report_unavailable' }, { status: 503 });
  const canonicalBytes = new Uint8Array(await canonicalResponse.arrayBuffer());
  if (canonicalBytes.length > MAX_CANONICAL_PDF_BYTES) return Response.json({ error: 'full_report_too_large' }, { status: 503 });
  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(canonicalBytes)).getPageCount();
  } catch {
    return Response.json({ error: 'full_report_invalid' }, { status: 503 });
  }
  if (pageCount <= 10) return Response.json({ error: 'full_report_too_short' }, { status: 503 });

  const design = await buildCoverDesign({
    supabase: db,
    env,
    domain: verified.payload.domain,
    seedUrl: signals.siteUrl ?? `https://${verified.payload.domain}`,
    generatedAt: signals.completedAt ?? new Date().toISOString(),
    scanId: verified.payload.scanId,
  });
  const fullUrl = new URL(`/api/audit-preview/full/${encodeURIComponent(token)}`, request.url).toString();
  const preview = deriveAuditCampaignPreviewFromSignals({
    signals: {
      scanId: verified.payload.scanId,
      domain: verified.payload.domain,
      generatedAt: signals.completedAt ?? new Date().toISOString(),
      score: signals.score,
      grade: signals.grade,
      passedChecks: signals.passedChecks ?? 0,
      totalChecks: signals.totalChecks ?? 0,
      eligibleDestinations: signals.eligibleDestinations ?? 0,
      testedDestinations: signals.testedDestinations ?? 0,
      retrievalScore: signals.retrievalScore ?? 0,
      understandingTrustScore: signals.understandingTrustScore ?? 0,
      topIssues: signals.topIssues,
    },
    recipient: { firstName: verified.payload.recipientFirstName, company: verified.payload.recipientCompany },
    preparedBy: 'The GEO-Pulse team — Montréal, Québec',
    fullReportPageCount: pageCount,
    fullReportUrl: fullUrl,
  });
  const bytes = await buildAuditCampaignPreviewPdf(preview, {
    siteName: verified.payload.recipientCompany,
    primaryHex: design?.themePrimaryHex,
    heroImage: design?.heroImage,
  });
  const filename = `${verified.payload.domain.replace(/[^a-z0-9.-]+/gi, '-')}-audit-preview.pdf`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
