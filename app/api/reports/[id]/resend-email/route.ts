import { z } from 'zod';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  resolveAgencyFeatureEntitlements,
  resolveAgencyScanAccess,
} from '@/lib/server/agency-access';
import { validateStartupWorkspaceScanContext } from '@/lib/server/startup-scan-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { sendDeepAuditEmail } from '@workers/report/resend-delivery';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

function buildTopIssues(raw: unknown): Array<{ check: string; fix?: string; weight?: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && (item as { passed?: boolean }).passed === false)
    .sort(
      (a, b) =>
        Number((b as { weight?: number }).weight ?? 0) - Number((a as { weight?: number }).weight ?? 0)
    )
    .slice(0, 3)
    .map((item) => ({
      check: String((item as { check?: unknown; checkId?: unknown }).check ?? (item as { checkId?: unknown }).checkId ?? 'Check'),
      fix: typeof (item as { fix?: unknown }).fix === 'string' ? String((item as { fix?: unknown }).fix) : undefined,
      weight: typeof (item as { weight?: unknown }).weight === 'number' ? Number((item as { weight?: unknown }).weight) : undefined,
    }));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: { code: 'invalid_id', message: 'Invalid scan id' } }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: { code: 'unauthorized', message: 'Sign in first.' } }, { status: 401 });
  }

  const env = await getPaymentApiEnv();
  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.RESEND_API_KEY ||
    !env.RESEND_FROM_EMAIL
  ) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Report email delivery is not configured.' } },
      { status: 503 }
    );
  }

  const adminDb = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: scan, error: scanErr } = await adminDb
    .from('scans')
    .select(
      'id,url,domain,score,letter_grade,issues_json,full_results_json,user_id,agency_account_id,agency_client_id,startup_workspace_id'
    )
    .eq('id', parsedId.data)
    .maybeSingle();

  if (scanErr) {
    return Response.json({ error: { code: 'db_error', message: scanErr.message } }, { status: 500 });
  }
  if (!scan) {
    return Response.json({ error: { code: 'not_found', message: 'Scan not found.' } }, { status: 404 });
  }

  const agencyAccess =
    scan.agency_account_id || scan.agency_client_id
      ? await resolveAgencyScanAccess({
          supabase: adminDb,
          userId: user.id,
          scan: {
            agencyAccountId: scan.agency_account_id ?? null,
            agencyClientId: scan.agency_client_id ?? null,
          },
        })
      : { isMember: false, paymentRequired: false };
  const canAccessAsOwner = scan.user_id === user.id;
  const canAccessAsStartupMember =
    !agencyAccess.isMember &&
    !!scan.startup_workspace_id &&
    !!(await validateStartupWorkspaceScanContext({
      supabase: adminDb,
      userId: user.id,
      startupWorkspaceId: scan.startup_workspace_id,
    }));

  if (!(canAccessAsOwner || agencyAccess.isMember || canAccessAsStartupMember)) {
    return Response.json({ error: { code: 'forbidden', message: 'You cannot access this report.' } }, { status: 403 });
  }

  const { data: report, error: reportErr } = await adminDb
    .from('reports')
    .select('id,pdf_url,markdown_url,email_delivered_at')
    .eq('scan_id', parsedId.data)
    .eq('type', 'deep_audit')
    .maybeSingle();

  if (reportErr) {
    return Response.json({ error: { code: 'db_error', message: reportErr.message } }, { status: 500 });
  }
  if (!report?.id || !report.pdf_url) {
    return Response.json(
      { error: { code: 'report_unavailable', message: 'No downloadable report is available yet.' } },
      { status: 409 }
    );
  }

  const recipientEmail = user.email?.trim().toLowerCase();
  if (!recipientEmail) {
    return Response.json(
      { error: { code: 'missing_email', message: 'No account email is available for delivery.' } },
      { status: 409 }
    );
  }

  const issues = Array.isArray(scan.issues_json) ? scan.issues_json : [];
  const failedCount = issues.filter(
    (item) => item && typeof item === 'object' && (item as { passed?: boolean }).passed === false
  ).length;
  const totalChecks = issues.length > 0 ? issues.length : undefined;
  const passedChecks = totalChecks != null ? Math.max(totalChecks - failedCount, 0) : undefined;

  const emailResult = await sendDeepAuditEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    to: recipientEmail,
    domain: scan.domain,
    url: scan.url,
    pdfBytes: new Uint8Array(),
    filename: `geo-pulse-deep-audit-${scan.id}.pdf`,
    idempotencyKey: `deep-audit-resend/${scan.id}/${report.id}/${recipientEmail}`,
    attachPdf: false,
    downloadLinks: {
      pdfUrl: report.pdf_url,
      markdownUrl: report.markdown_url ?? undefined,
    },
    score: typeof scan.score === 'number' ? scan.score : undefined,
    grade: typeof scan.letter_grade === 'string' ? scan.letter_grade : undefined,
    topIssues: buildTopIssues(scan.issues_json),
    totalChecks,
    passedChecks,
    scanId: scan.id,
    appUrl: env.NEXT_PUBLIC_APP_URL?.trim() || undefined,
  });

  if (!emailResult.ok) {
    return Response.json(
      { error: { code: 'email_send_failed', message: emailResult.message } },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, recipientEmail });
}
