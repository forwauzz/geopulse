import { getScanForShareSlug } from '@/lib/server/get-scan-for-public-share';
import { getScoreBenchmark } from '@/lib/server/get-score-benchmark';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isLegacyPaidEnabled, type DeepAuditCheckoutMode } from '@/lib/shared/deep-audit-checkout-mode';
import { scanResultsUnavailableResponse } from '@/lib/server/scan-results-unavailable';

export const runtime = 'nodejs';

/**
 * Public share route for recurring-audit scans (issue #128), keyed on the minted `share_slug`.
 * Mirrors the guest path of GET /api/scans/[id] so ResultsView renders identically — but reaches
 * scans that keep the owner's user_id, which the id-based route intentionally refuses.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await context.params;

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return scanResultsUnavailableResponse();
  }

  let result: Awaited<ReturnType<typeof getScanForShareSlug>>;
  try {
    result = await getScanForShareSlug(
      slug,
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch {
    return scanResultsUnavailableResponse();
  }

  if (!result.ok) {
    if (result.code === 'invalid_id') {
      return Response.json({ error: { code: 'invalid_id', message: 'Invalid share link' } }, { status: 400 });
    }
    if (result.code === 'db_error') {
      return scanResultsUnavailableResponse();
    }
    if (result.code === 'not_found') {
      return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    }
    if (result.code === 'forbidden') {
      return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
    if (result.code === 'expired') {
      return Response.json({ error: { code: 'expired' } }, { status: 410 });
    }
    return Response.json({ error: { code: 'unknown' } }, { status: 500 });
  }

  const { data } = result;
  const benchmark = await getScoreBenchmark(
    createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    data.score
  );
  return Response.json({
    scanId: data.scanId,
    url: data.url,
    domain: data.domain,
    score: data.score,
    letterGrade: data.letterGrade,
    topIssues: data.topIssues,
    issues: data.issues,
    benchmark,
    categoryScores: data.categoryScores,
    accessMatrix: data.accessMatrix,
    bucketScores: data.bucketScores,
    eligibility: data.eligibility,
    scoreState: data.scoreState,
    hasPaidReport: data.hasPaidReport,
    reportStatus: data.reportStatus,
    pdfUrl: data.pdfUrl,
    markdownUrl: data.markdownUrl,
    startupWorkspaceId: data.startupWorkspaceId,
    agencyAccountId: data.agencyAccountId,
    agencyClientId: data.agencyClientId,
    viewerEmail: data.viewerEmail,
    checkoutMode: (isLegacyPaidEnabled(env.LEGACY_PAID_ENABLED) ? 'stripe' : 'free') as DeepAuditCheckoutMode,
    deepAuditAvailable: true,
  });
}
