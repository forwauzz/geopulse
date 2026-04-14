import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';
import {
  resolveAgencyFeatureEntitlements,
  resolveAgencyScanAccess,
} from '@/lib/server/agency-access';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { validateStartupWorkspaceScanContext } from '@/lib/server/startup-scan-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { type DeepAuditCheckoutMode } from '@/lib/shared/deep-audit-checkout-mode';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  // If the requester is authenticated, allow reading their own scan (not subject to guest/public-share rules).
  try {
    const sessionClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (user?.id) {
      const env = await getScanApiEnv();
      if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
      }

      const adminDb = createServiceRoleClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: scan, error: scanErr } = await adminDb
        .from('scans')
        .select('id,url,domain,score,letter_grade,issues_json,full_results_json,user_id,agency_account_id,agency_client_id,startup_workspace_id')
        .eq('id', id)
        .maybeSingle();

      if (scanErr) {
        return Response.json(
          { error: { code: 'db_error', message: scanErr.message } },
          { status: 500 }
        );
      }
      if (!scan) {
        return Response.json({ error: { code: 'not_found' } }, { status: 404 });
      }
      const agencyAccess = await resolveAgencyScanAccess({
        supabase: adminDb,
        userId: user.id,
        scan: {
          agencyAccountId: scan.agency_account_id ?? null,
          agencyClientId: scan.agency_client_id ?? null,
        },
      });

      const canAccessAsOwner = scan.user_id === user.id;
      const canAccessAsAgency = agencyAccess.isMember;
      const agencyEntitlements = await resolveAgencyFeatureEntitlements({
        supabase: adminDb,
        agencyAccountId: scan.agency_account_id ?? null,
        agencyClientId: scan.agency_client_id ?? null,
      });

      const canAccessAsStartupMember =
        !canAccessAsAgency &&
        !!scan.startup_workspace_id &&
        !!(await validateStartupWorkspaceScanContext({
          supabase: adminDb,
          userId: user.id,
          startupWorkspaceId: scan.startup_workspace_id,
        }));

      if (scan.user_id !== null && !(canAccessAsOwner || canAccessAsAgency || canAccessAsStartupMember)) {
        return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
      }

      if (canAccessAsOwner || canAccessAsAgency || canAccessAsStartupMember) {
        const [paymentRes, reportRes] = await Promise.all([
          adminDb
            .from('payments')
            .select('id')
            .eq('scan_id', id)
            .eq('status', 'complete')
            .limit(1)
            .maybeSingle(),
          adminDb
            .from('reports')
            .select('id,pdf_url,markdown_url,email_delivered_at')
            .eq('scan_id', id)
            .eq('type', 'deep_audit')
            .limit(1)
            .maybeSingle(),
        ]);

        const hasPaid = !!paymentRes.data?.id;
        const report = reportRes.data;
        const reportStatus = report?.email_delivered_at ? 'delivered' : hasPaid ? 'generating' : 'none';

        const fullResults = scan.full_results_json as { categoryScores?: unknown[] } | null;
        return Response.json({
          scanId: scan.id,
          url: scan.url,
          domain: scan.domain,
          score: scan.score,
          letterGrade: scan.letter_grade,
          topIssues: Array.isArray(scan.issues_json) ? scan.issues_json.slice(0, 3) : [],
          categoryScores: Array.isArray(fullResults?.categoryScores) ? fullResults.categoryScores : [],
          hasPaidReport: hasPaid,
          reportStatus,
          pdfUrl: report?.pdf_url ?? null,
          markdownUrl: report?.markdown_url ?? null,
          startupWorkspaceId: scan.startup_workspace_id ?? null,
          agencyAccountId: scan.agency_account_id ?? null,
          agencyClientId: scan.agency_client_id ?? null,
          viewerEmail: user.email ?? null,
          checkoutMode: (
            canAccessAsStartupMember
              ? 'startup_bypass'
              : canAccessAsAgency && !agencyAccess.paymentRequired
                ? 'agency_bypass'
                : 'stripe'
          ) as DeepAuditCheckoutMode,
          deepAuditAvailable: canAccessAsAgency ? agencyEntitlements.deepAuditEnabled : true,
        });
      }
      // Guest scan (user_id is null) — fall through to public-share path
    }
  } catch {
    // not authenticated or server component cookie access unavailable — fall back to guest/public rules below
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const result = await getScanForPublicShare(id, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (!result.ok) {
    if (result.code === 'invalid_id') {
      return Response.json(
        { error: { code: 'invalid_id', message: 'Invalid scan id' } },
        { status: 400 }
      );
    }
    if (result.code === 'db_error') {
      return Response.json(
        { error: { code: 'db_error', message: result.message ?? 'Database error' } },
        { status: 500 }
      );
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
  return Response.json({
    scanId: data.scanId,
    url: data.url,
    domain: data.domain,
    score: data.score,
    letterGrade: data.letterGrade,
    topIssues: data.topIssues,
    categoryScores: data.categoryScores,
    hasPaidReport: data.hasPaidReport,
    reportStatus: data.reportStatus,
    pdfUrl: data.pdfUrl,
    markdownUrl: data.markdownUrl,
    startupWorkspaceId: data.startupWorkspaceId,
    agencyAccountId: data.agencyAccountId,
    agencyClientId: data.agencyClientId,
    viewerEmail: data.viewerEmail,
    deepAuditAvailable: true,
  });
}
