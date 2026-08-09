import type { SupabaseClient } from '@supabase/supabase-js';
import { fullIssueListFromScan } from './scan-issue-list';
import type { PreviewContact, PreviewScanContext } from './email-campaign-preview';

type ScanRow = {
  readonly id: string;
  readonly domain: string | null;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly issues_json: unknown;
  readonly full_results_json: unknown;
  readonly created_at: string | null;
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

export function scanContextFromRow(
  row: ScanRow,
  appUrl = 'https://getgeopulse.com',
): PreviewScanContext | null {
  if (!row.id || typeof row.score !== 'number' || !Number.isFinite(row.score)) return null;
  if (!row.letter_grade?.trim() || !row.created_at) return null;
  const topIssues = fullIssueListFromScan(row.issues_json, row.full_results_json)
    .map(issuePreview)
    .filter((issue): issue is { check?: string; fix?: string } => Boolean(issue))
    .slice(0, 2);
  if (topIssues.length === 0) return null;

  return {
    scanId: row.id,
    score: row.score,
    grade: row.letter_grade.trim(),
    topIssues,
    completedAt: row.created_at,
    reportUrl: `${appUrl.replace(/\/+$/, '')}/results/${encodeURIComponent(row.id)}`,
  };
}

/** Resolve only a completed, public-site scan for this exact recipient domain. */
export async function loadCampaignScanContext(args: {
  readonly supabase: SupabaseClient;
  readonly contact: PreviewContact;
  readonly appUrl?: string;
}): Promise<PreviewScanContext | null> {
  const domain = canonicalDomain(args.contact.companyDomain);
  if (!domain) return null;

  const { data, error } = await args.supabase
    .from('scans')
    .select('id,domain,score,letter_grade,issues_json,full_results_json,created_at')
    .in('domain', [domain, `www.${domain}`])
    .eq('status', 'complete')
    .is('user_id', null)
    .neq('run_source', 'internal_benchmark')
    .not('score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return scanContextFromRow(data as ScanRow, args.appUrl);
}

export async function loadCampaignScanContexts(args: {
  readonly supabase: SupabaseClient;
  readonly contacts: readonly PreviewContact[];
  readonly appUrl?: string;
}): Promise<ReadonlyMap<string, PreviewScanContext>> {
  const pairs = await Promise.all(args.contacts.map(async (contact) => [
    contact.contactId,
    await loadCampaignScanContext({ supabase: args.supabase, contact, appUrl: args.appUrl }),
  ] as const));
  return new Map(pairs.filter((pair): pair is readonly [string, PreviewScanContext] => Boolean(pair[1])));
}
