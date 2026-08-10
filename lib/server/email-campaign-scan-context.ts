import type { SupabaseClient } from '@supabase/supabase-js';
import { fullIssueListFromScan } from './scan-issue-list';
import { campaignGreetingName, type PreviewContact, type PreviewScanContext } from './email-campaign-preview';
import { issueAuditFullReportCapability } from './audit-report-capability';

type ScanRow = {
  readonly id: string;
  readonly url: string | null;
  readonly domain: string | null;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly issues_json: unknown;
  readonly full_results_json: unknown;
  readonly created_at: string | null;
  readonly share_slug?: string | null;
};

type ProofCounts = {
  readonly passedChecks: number;
  readonly totalChecks: number;
  readonly eligibleDestinations: number;
  readonly testedDestinations: number;
  readonly retrievalScore: number;
  readonly understandingTrustScore: number;
};

function canonicalDomain(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!value || value.includes('/') || value.includes('@')) return null;
  return value;
}

function issuePreview(raw: unknown): { check?: string; fix?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row['passed'] === true) return null;
  const check = typeof row['check'] === 'string' ? row['check'].trim() : '';
  const fix = typeof row['fix'] === 'string' ? row['fix'].trim() : '';
  if (!check) return null;
  return { check, ...(fix ? { fix } : {}) };
}

function finiteScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

function proofCounts(fullIssues: readonly unknown[], fullResults: unknown): ProofCounts | null {
  if (fullIssues.length === 0 || !fullResults || typeof fullResults !== 'object') return null;
  const full = fullResults as Record<string, unknown>;
  const matrix = full['accessMatrix'];
  const rows = matrix && typeof matrix === 'object'
    ? (matrix as Record<string, unknown>)['rows']
    : null;
  if (!Array.isArray(rows)) return null;

  const statuses = rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const status = (raw as Record<string, unknown>)['status'];
    return status === 'eligible' || status === 'blocked' || status === 'not_tested' ? [status] : [];
  });
  const testedDestinations = statuses.filter((status) => status !== 'not_tested').length;
  const eligibleDestinations = statuses.filter((status) => status === 'eligible').length;
  if (statuses.length === 0 || testedDestinations === 0) return null;

  const buckets = Array.isArray(full['bucketScores']) ? full['bucketScores'] : [];
  const scoreFor = (bucket: string): number | null => {
    const match = buckets.find((raw) => raw && typeof raw === 'object' && (raw as Record<string, unknown>)['bucket'] === bucket);
    return match && typeof match === 'object'
      ? finiteScore((match as Record<string, unknown>)['score'])
      : null;
  };
  const retrievalScore = scoreFor('eligibility');
  const understandingTrustScore = scoreFor('understanding');
  if (retrievalScore === null || understandingTrustScore === null) return null;

  return {
    passedChecks: fullIssues.filter((raw) => raw && typeof raw === 'object' && (raw as Record<string, unknown>)['passed'] === true).length,
    totalChecks: fullIssues.length,
    eligibleDestinations,
    testedDestinations,
    retrievalScore,
    understandingTrustScore,
  };
}

function canonicalSiteUrl(raw: string | null, expectedDomain: string | null): string | null {
  try {
    const url = new URL(raw ?? '');
    const hostname = canonicalDomain(url.hostname);
    const domain = canonicalDomain(expectedDomain);
    if (!hostname || !domain || hostname !== domain) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function scanContextFromRow(
  row: ScanRow,
  appUrl = 'https://getgeopulse.com',
): PreviewScanContext | null {
  if (!row.id || typeof row.score !== 'number' || !Number.isFinite(row.score)) return null;
  if (!row.letter_grade?.trim() || !row.created_at) return null;
  const siteUrl = canonicalSiteUrl(row.url, row.domain);
  if (!siteUrl) return null;
  const fullIssues = fullIssueListFromScan(row.issues_json, row.full_results_json);
  const topIssues = fullIssues
    .map(issuePreview)
    .filter((issue): issue is { check?: string; fix?: string } => Boolean(issue))
    .slice(0, 2);
  const counts = proofCounts(fullIssues, row.full_results_json);
  if (topIssues.length < 2 || !counts) return null;

  return {
    scanId: row.id,
    siteUrl,
    score: row.score,
    grade: row.letter_grade.trim(),
    topIssues,
    completedAt: row.created_at,
    ...counts,
    reportUrl: `${appUrl.replace(/\/+$/, '')}/results/${encodeURIComponent(row.id)}`,
  };
}

/** Resolve only a completed, public-site scan for this exact recipient domain. */
export async function loadCampaignScanContext(args: {
  readonly supabase: SupabaseClient;
  readonly contact: PreviewContact;
  readonly appUrl?: string;
  readonly auditPreview?: { readonly secret: string; readonly campaignId: string; readonly nowMs?: number } | null;
}): Promise<PreviewScanContext | null> {
  const domain = canonicalDomain(args.contact.companyDomain);
  if (!domain) return null;

  const { data, error } = await args.supabase
    .from('scans')
    .select('id,url,domain,score,letter_grade,issues_json,full_results_json,created_at,share_slug')
    .in('domain', [domain, `www.${domain}`])
    .eq('status', 'complete')
    .is('user_id', null)
    .neq('run_source', 'internal_benchmark')
    .not('score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ScanRow;
  const context = scanContextFromRow(row, args.appUrl);
  if (!context || !args.auditPreview) return context;
  const { data: report, error: reportError } = await args.supabase
    .from('reports')
    .select('pdf_url')
    .eq('scan_id', row.id)
    .eq('type', 'deep_audit')
    .not('pdf_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError || !report?.pdf_url) return null;
  const firstName = campaignGreetingName(args.contact.name) ?? '';
  const company = args.contact.company?.trim() ?? '';
  if (!firstName || !company || args.auditPreview.secret.length < 24) return null;
  const nowMs = args.auditPreview.nowMs ?? Date.now();
  const token = issueAuditFullReportCapability({
    secret: args.auditPreview.secret,
    nowMs,
    expiresAtMs: nowMs + 30 * 24 * 60 * 60 * 1000,
    scanId: row.id,
    shareSlug: row.share_slug,
    recipientEmail: args.contact.email,
    recipientFirstName: firstName,
    recipientCompany: company,
    domain,
    campaignId: args.auditPreview.campaignId,
  });
  return { ...context, reportUrl: `${(args.appUrl ?? 'https://getgeopulse.com').replace(/\/+$/, '')}/api/audit-preview/pdf/${encodeURIComponent(token)}` };
}

export async function loadCampaignScanContexts(args: {
  readonly supabase: SupabaseClient;
  readonly contacts: readonly PreviewContact[];
  readonly appUrl?: string;
  readonly auditPreview?: { readonly secret: string; readonly campaignId: string; readonly nowMs?: number } | null;
}): Promise<ReadonlyMap<string, PreviewScanContext>> {
  const pairs = await Promise.all(args.contacts.map(async (contact) => [
    contact.contactId,
    await loadCampaignScanContext({ supabase: args.supabase, contact, appUrl: args.appUrl, auditPreview: args.auditPreview }),
  ] as const));
  return new Map(pairs.filter((pair): pair is readonly [string, PreviewScanContext] => Boolean(pair[1])));
}
