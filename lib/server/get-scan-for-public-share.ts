import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fullIssueListFromScan } from '@/lib/server/scan-issue-list';
import { deriveReportStatus, type ReportStatus as DerivedReportStatus } from '@/lib/server/report-status';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const uuid = z.string().uuid();

// Run sources whose scans are served by /share/<slug> (unguessable slug is the capability). Monitor
// re-audits (Codex P1 #1) persist with run_source='monitor' and MUST be resolvable here, or every
// monthly monitor email links to a 403.
const SHARE_SLUG_RUN_SOURCES: ReadonlySet<string> = new Set(['recurring', 'monitor']);
// Share slugs are 32 hex chars (a dash-stripped UUID). Kept permissive on charset so a
// future generator can widen the alphabet without breaking existing links.
const shareSlug = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/);

export type ReportStatus = 'none' | 'generating' | 'delivered';

export type PublicShareScanRow = {
  scanId: string;
  url: string;
  domain: string | null;
  score: number | null;
  letterGrade: string | null;
  topIssues: unknown[];
  issues: unknown[];
  categoryScores: unknown[];
  bucketScores: unknown[];
  eligibility: unknown | null;
  accessMatrix: unknown | null;
  scoreState: 'measured' | 'not_tested';
  hasPaidReport: boolean;
  reportStatus: ReportStatus;
  pdfUrl: string | null;
  markdownUrl: string | null;
  startupWorkspaceId: string | null;
  agencyAccountId: string | null;
  agencyClientId: string | null;
  viewerEmail: string | null;
};

export type PublicShareScanError =
  | 'invalid_id'
  | 'not_found'
  | 'forbidden'
  | 'expired'
  | 'db_error';

export type PublicShareScanResult =
  | { ok: true; data: PublicShareScanRow }
  | { ok: false; code: PublicShareScanError; message?: string };

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
// Outreach + recurring-audit scans are DELIVERED BY EMAIL on a cadence — a prospect who
// opens day-3 must not hit a dead link (issue #114). Self-serve anonymous scans keep 48h.
const RECURRING_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function extractTopIssues(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  const failed = raw.filter(
    (x) => x && typeof x === 'object' && (x as { passed?: boolean }).passed === false
  );
  failed.sort(
    (a, b) =>
      Number((b as { weight?: number }).weight ?? 0) - Number((a as { weight?: number }).weight ?? 0)
  );
  return failed.slice(0, 3);
}

/** The subset of columns both share paths project into a PublicShareScanRow. */
type ShareScanCore = {
  id: string;
  url: string;
  domain: string | null;
  score: number | null;
  letter_grade: string | null;
  issues_json: unknown;
  full_results_json: unknown;
};

/**
 * Load payment/report state for a visible scan and project it into a PublicShareScanRow.
 * Shared by both the id-based (guest) path and the slug-based (recurring-audit) path so
 * they render identically; the visibility gate is the caller's responsibility.
 */
async function buildPublicShareRow(
  supabase: SupabaseClient,
  data: ShareScanCore
): Promise<PublicShareScanResult> {
  const [paymentRes, reportRes, runRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id')
      .eq('scan_id', data.id)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('reports')
      .select('id,pdf_url,markdown_url,email_delivered_at')
      .eq('scan_id', data.id)
      .eq('type', 'deep_audit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A full-audit run's live state drives whether the report page keeps polling. In free mode
    // (LEGACY_PAID_ENABLED=false) there is no payment to key off, so we read the run itself — but
    // only its timestamps, so a dead run doesn't poll forever (Codex P1 #3, via deriveReportStatus).
    supabase
      .from('scan_runs')
      .select('created_at, started_at, completed_at')
      .eq('scan_id', data.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hasPaid = !!paymentRes.data?.id;
  const report = reportRes.data;
  const reportStatus: DerivedReportStatus = deriveReportStatus({
    emailDelivered: !!report?.email_delivered_at,
    hasReport: !!report?.id,
    hasPaid,
    run: runRes.data ?? null,
    nowMs: Date.now(),
  });

  const fullResults = data.full_results_json as {
    categoryScores?: unknown[];
    bucketScores?: unknown[];
    eligibility?: unknown;
    accessMatrix?: unknown;
    scoreState?: string;
  } | null;
  return {
    ok: true,
    data: {
      scanId: data.id,
      url: data.url,
      domain: data.domain,
      score: data.score,
      letterGrade: data.letter_grade,
      topIssues: extractTopIssues(data.issues_json),
      issues: fullIssueListFromScan(data.issues_json, data.full_results_json),
      categoryScores: Array.isArray(fullResults?.categoryScores) ? fullResults.categoryScores : [],
      accessMatrix: fullResults?.accessMatrix ?? null,
      bucketScores: Array.isArray(fullResults?.bucketScores) ? fullResults.bucketScores : [],
      eligibility: fullResults?.eligibility ?? null,
      scoreState: fullResults?.scoreState === 'not_tested' ? 'not_tested' : 'measured',
      hasPaidReport: hasPaid,
      reportStatus,
      pdfUrl: report?.pdf_url ?? null,
      markdownUrl: report?.markdown_url ?? null,
      startupWorkspaceId: null,
      agencyAccountId: null,
      agencyClientId: null,
      viewerEmail: null,
    },
  };
}

/**
 * Same visibility rules as GET /api/scans/[id]: guest scans only, within 48h of creation.
 */
export async function getScanForPublicShare(
  id: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<PublicShareScanResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_id' };
  }

  const supabase = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from('scans')
    .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,user_id,run_source')
    .eq('id', parsed.data)
    .maybeSingle();

  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }
  if (!data) {
    return { ok: false, code: 'not_found' };
  }

  if (data.user_id !== null) {
    return { ok: false, code: 'forbidden' };
  }

  const created = new Date(data.created_at);
  const maxAge = SHARE_SLUG_RUN_SOURCES.has(data.run_source) ? RECURRING_MAX_AGE_MS : MAX_AGE_MS;
  if (Number.isFinite(created.getTime()) && Date.now() - created.getTime() > maxAge) {
    return { ok: false, code: 'expired' };
  }

  // Funnel visibility (issue #116): a cadence-delivered report being SERVED is the
  // strongest engagement signal we have (beats the pixel, which images-off kills).
  if (data.run_source === 'recurring') {
    structuredLog('outreach_report_viewed', { scanId: data.id }, 'info');
  }

  return buildPublicShareRow(supabase, data);
}

/**
 * Load a recurring-audit scan by its share slug (issue #128). Recurring-audit scans persist
 * with the OWNER's user_id, so the id-based public route rejects them ("This scan is private").
 * We mint an unguessable `share_slug` for those scans and serve them here via the service-role
 * client: the slug is the capability, so — unlike getScanForPublicShare — we do NOT require
 * user_id IS NULL. Gated to run_source='recurring' with the same 90-day cadence window.
 *
 * NB: we deliberately do NOT set scans.is_public — that flag activates the anon-key
 * `scans_public_read` RLS policy, which would expose these owner-owned reports (and their full
 * results) to enumeration via the public anon key, bypassing the slug entirely.
 */
export async function getScanForShareSlug(
  slug: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<PublicShareScanResult> {
  const parsed = shareSlug.safeParse(slug);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_id' };
  }

  const supabase = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from('scans')
    .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,run_source')
    .eq('share_slug', parsed.data)
    .maybeSingle();

  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }
  if (!data) {
    return { ok: false, code: 'not_found' };
  }

  // Slugs are minted ONLY for cadence-delivered audits (recurring + monitor). This gate (not
  // user_id) plus the unguessable slug is what keeps arbitrary scans off this route.
  if (!SHARE_SLUG_RUN_SOURCES.has(data.run_source)) {
    return { ok: false, code: 'forbidden' };
  }

  const created = new Date(data.created_at);
  if (Number.isFinite(created.getTime()) && Date.now() - created.getTime() > RECURRING_MAX_AGE_MS) {
    return { ok: false, code: 'expired' };
  }

  structuredLog('recurring_share_viewed', { scanId: data.id }, 'info');

  return buildPublicShareRow(supabase, data);
}
