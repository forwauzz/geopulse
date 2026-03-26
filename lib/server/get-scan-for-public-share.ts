import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const uuid = z.string().uuid();

export type ReportStatus = 'none' | 'generating' | 'delivered';

export type PublicShareScanRow = {
  scanId: string;
  url: string;
  domain: string | null;
  score: number | null;
  letterGrade: string | null;
  topIssues: unknown[];
  categoryScores: unknown[];
  hasPaidReport: boolean;
  reportStatus: ReportStatus;
  pdfUrl: string | null;
  markdownUrl: string | null;
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
    .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,user_id')
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
  if (Number.isFinite(created.getTime()) && Date.now() - created.getTime() > MAX_AGE_MS) {
    return { ok: false, code: 'expired' };
  }

  const [paymentRes, reportRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id')
      .eq('scan_id', parsed.data)
      .eq('status', 'complete')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('reports')
      .select('id,pdf_url,markdown_url,email_delivered_at')
      .eq('scan_id', parsed.data)
      .eq('type', 'deep_audit')
      .limit(1)
      .maybeSingle(),
  ]);

  const hasPaid = !!paymentRes.data?.id;
  const report = reportRes.data;
  let reportStatus: ReportStatus = 'none';
  if (report?.email_delivered_at) {
    reportStatus = 'delivered';
  } else if (hasPaid) {
    reportStatus = 'generating';
  }

  const fullResults = data.full_results_json as { categoryScores?: unknown[] } | null;
  return {
    ok: true,
    data: {
      scanId: data.id,
      url: data.url,
      domain: data.domain,
      score: data.score,
      letterGrade: data.letter_grade,
      topIssues: extractTopIssues(data.issues_json),
      categoryScores: Array.isArray(fullResults?.categoryScores) ? fullResults.categoryScores : [],
      hasPaidReport: hasPaid,
      reportStatus,
      pdfUrl: report?.pdf_url ?? null,
      markdownUrl: report?.markdown_url ?? null,
    },
  };
}
