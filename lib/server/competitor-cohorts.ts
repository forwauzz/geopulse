/**
 * Local-competitor cohort benchmarking, Phase 1 (issue #118).
 *
 * A cohort is a hand-curated set of businesses in the same market — the customer plus their
 * actual named rivals — stored as `benchmark_domains` rows tagged `metadata.local_cohort`
 * (so citation-benchmark rows in the same table are never swept). Grouping key is
 * (vertical, geo_region). A weekly flag-gated sweep re-scans stale cohort domains with the
 * real scan engine and persists them as normal scans (run_source='internal_benchmark').
 *
 * Comparison shows OBSERVABLE on-page signals only — per-destination eligibility from the
 * access matrix, structured data, llms.txt, score. Three states everywhere: a competitor
 * whose site our scanner could not verify is 'not_verified', NEVER rendered as a negative.
 * No outcome claims (who gets cited) — that stays in the citation benchmark engine.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import type { AccessMatrix, DestinationId } from '../../workers/scan-engine/access-matrix';
import { buildAuditLlm } from './fix-agent-run';
import { deriveBenchmarkDomainIdentity, toCanonicalBenchmarkDomain } from './benchmark-domains';
import { isAgentEnabled } from './agent-flags';
import { structuredLog } from './structured-log';

export const COHORT_METADATA_KEY = 'local_cohort';
/** Weekly cadence with slack for hourly-cron jitter. */
export const COHORT_STALE_MS = 6.5 * 24 * 60 * 60 * 1000;
/** Failed attempts also wait a full cycle so a dead domain can't eat every tick's budget. */
const ATTEMPT_COOLDOWN_MS = COHORT_STALE_MS;

export type CohortEnvLike = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
};

export type CohortDomainRow = {
  readonly id: string;
  readonly domain: string;
  readonly canonical_domain: string;
  readonly site_url: string | null;
  readonly display_name: string | null;
  readonly vertical: string | null;
  readonly geo_region: string | null;
  readonly is_customer: boolean;
  readonly metadata: Record<string, unknown>;
};

/** Three-state signal: 'not_verified' means our scanner could not observe it — never a failure. */
export type AccessSignal = 'allows' | 'blocks' | 'not_verified';
export type PageSignal = 'present' | 'partial' | 'missing' | 'not_verified';

export type DomainComparison = {
  readonly domainId: string;
  readonly canonicalDomain: string;
  readonly displayName: string;
  readonly isCustomer: boolean;
  readonly score: number | null;
  readonly scoreState: 'measured' | 'not_tested' | 'never_scanned';
  readonly destinations: Partial<Record<DestinationId, AccessSignal>>;
  readonly structuredData: PageSignal;
  readonly llmsTxt: PageSignal;
  readonly scannedAt: string | null;
};

export type Cohort = {
  readonly vertical: string;
  readonly geoRegion: string;
  readonly domains: DomainComparison[];
};

type ScanIssueLike = { checkId?: string; status?: string };
type FullResultsLike = {
  issues?: ScanIssueLike[];
  accessMatrix?: AccessMatrix;
  scoreState?: string;
};

function pageSignalFromStatus(status: string | undefined): PageSignal {
  switch (status) {
    case 'PASS':
      return 'present';
    case 'WARNING':
      return 'partial';
    case 'FAIL':
      return 'missing';
    default:
      // BLOCKED / NOT_EVALUATED / absent — we did not observe it.
      return 'not_verified';
  }
}

/** Pure signal extraction from a persisted scan row, exported for tests. */
export function extractComparisonSignals(row: {
  score: number | null;
  full_results_json: unknown;
}): Pick<DomainComparison, 'score' | 'scoreState' | 'destinations' | 'structuredData' | 'llmsTxt'> {
  const full = (row.full_results_json ?? {}) as FullResultsLike;
  const destinations: Partial<Record<DestinationId, AccessSignal>> = {};
  for (const dest of full.accessMatrix?.rows ?? []) {
    destinations[dest.destination] =
      dest.status === 'eligible' ? 'allows' : dest.status === 'blocked' ? 'blocks' : 'not_verified';
  }
  const byCheck = new Map<string, string | undefined>(
    (full.issues ?? []).map((i) => [i.checkId ?? '', i.status])
  );
  return {
    score: full.scoreState === 'not_tested' ? null : row.score,
    scoreState: full.scoreState === 'not_tested' ? 'not_tested' : 'measured',
    destinations,
    structuredData: pageSignalFromStatus(byCheck.get('schema-types')),
    llmsTxt: pageSignalFromStatus(byCheck.get('llms-txt')),
  };
}

export async function listCohortDomains(supabase: SupabaseClient): Promise<CohortDomainRow[]> {
  const { data } = await supabase
    .from('benchmark_domains')
    .select('id,domain,canonical_domain,site_url,display_name,vertical,geo_region,is_customer,metadata')
    .eq(`metadata->>${COHORT_METADATA_KEY}`, 'true')
    .order('created_at', { ascending: true })
    .limit(300);
  return (data ?? []) as CohortDomainRow[];
}

export type UpsertCohortDomainInput = {
  readonly url: string;
  readonly displayName?: string | null;
  readonly vertical: string;
  readonly geoRegion: string;
  readonly isCustomer: boolean;
};

export async function upsertCohortDomain(
  supabase: SupabaseClient,
  input: UpsertCohortDomainInput
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const identity = deriveBenchmarkDomainIdentity(input.url);
  if (!identity.canonicalDomain || !identity.domain) {
    return { ok: false, reason: 'invalid_url' };
  }

  // The row may already exist for citation benchmarking — tag it instead of failing on the
  // canonical_domain unique constraint, and never clobber unrelated metadata.
  const { data: existing } = await supabase
    .from('benchmark_domains')
    .select('id,metadata')
    .eq('canonical_domain', identity.canonicalDomain)
    .maybeSingle();

  if (existing?.id) {
    const metadata = { ...(existing.metadata as Record<string, unknown> | null), [COHORT_METADATA_KEY]: 'true' };
    const { error } = await supabase
      .from('benchmark_domains')
      .update({
        display_name: input.displayName?.trim() || null,
        vertical: input.vertical.trim() || null,
        geo_region: input.geoRegion.trim() || null,
        is_customer: input.isCustomer,
        is_competitor: !input.isCustomer,
        site_url: identity.siteUrl,
        metadata,
      })
      .eq('id', existing.id as string);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, id: existing.id as string };
  }

  const { data, error } = await supabase
    .from('benchmark_domains')
    .insert({
      domain: identity.domain,
      canonical_domain: identity.canonicalDomain,
      site_url: identity.siteUrl,
      display_name: input.displayName?.trim() || null,
      vertical: input.vertical.trim() || null,
      geo_region: input.geoRegion.trim() || null,
      is_customer: input.isCustomer,
      is_competitor: !input.isCustomer,
      metadata: { [COHORT_METADATA_KEY]: 'true' },
    })
    .select('id')
    .single();
  if (error || !data?.id) return { ok: false, reason: error?.message ?? 'insert_failed' };
  return { ok: true, id: data.id as string };
}

/** Untag only — the row may serve the citation benchmark, so it is never deleted here. */
export async function removeCohortDomain(supabase: SupabaseClient, id: string): Promise<void> {
  const { data } = await supabase.from('benchmark_domains').select('metadata').eq('id', id).maybeSingle();
  if (!data) return;
  const metadata = { ...(data.metadata as Record<string, unknown> | null) };
  delete metadata[COHORT_METADATA_KEY];
  delete metadata[`${COHORT_METADATA_KEY}_last_attempt_at`];
  await supabase.from('benchmark_domains').update({ metadata }).eq('id', id);
}

/** Scan one cohort domain now and persist it as a normal internal_benchmark scan. */
export async function scanCohortDomain(
  supabase: SupabaseClient,
  env: CohortEnvLike,
  row: Pick<CohortDomainRow, 'id' | 'domain' | 'site_url' | 'metadata'>
): Promise<{ ok: true; scanId: string } | { ok: false; reason: string }> {
  const targetUrl = row.site_url ?? `https://${row.domain}`;
  const attemptedAt = new Date().toISOString();
  await supabase
    .from('benchmark_domains')
    .update({ metadata: { ...row.metadata, [`${COHORT_METADATA_KEY}_last_attempt_at`]: attemptedAt } })
    .eq('id', row.id);

  const scan = await runFreeScan(targetUrl, buildAuditLlm(env));

  if (!scan.ok && !scan.blocked) {
    structuredLog('competitor_cohort_scan_failed', { domainId: row.id, reason: scan.reason }, 'warning');
    return { ok: false, reason: scan.reason };
  }

  const insert = scan.ok
    ? {
        url: scan.finalUrl,
        domain: scan.domain,
        status: 'complete',
        score: scan.output.score,
        letter_grade: scan.output.letterGrade,
        issues_json: scan.output.issues,
        full_results_json: {
          issues: scan.output.issues,
          categoryScores: scan.output.categoryScores,
          bucketScores: scan.output.bucketScores,
          accessMatrix: scan.output.accessMatrix,
          eligibility: scan.output.eligibility,
          checkCatalogVersion: scan.output.checkCatalogVersion,
          scoreState: 'measured',
        },
        user_id: null,
        run_source: 'internal_benchmark',
      }
    : {
        // Scanner blocked (WAF etc.) — persist the diagnosis so the comparison can say
        // "couldn't verify" with a date, instead of silently showing nothing.
        url: targetUrl,
        domain: toCanonicalBenchmarkDomain(targetUrl) ?? row.domain,
        status: 'complete',
        score: null,
        letter_grade: null,
        issues_json: scan.blocked?.issues ?? [],
        full_results_json: {
          issues: scan.blocked?.issues ?? [],
          accessMatrix: scan.blocked?.accessMatrix,
          scoreState: 'not_tested',
        },
        user_id: null,
        run_source: 'internal_benchmark',
      };

  const { data, error } = await supabase.from('scans').insert(insert).select('id').single();
  if (error || !data?.id) return { ok: false, reason: error?.message ?? 'scan_insert_failed' };
  return { ok: true, scanId: data.id as string };
}

/**
 * Staleness selection, pure for tests: domains with no internal_benchmark scan and no recent
 * attempt first (oldest tag first), then domains whose latest scan is older than COHORT_STALE_MS.
 */
export function selectStaleCohortDomains<
  T extends Pick<CohortDomainRow, 'id' | 'canonical_domain' | 'metadata'>,
>(domains: T[], latestScanAtByDomain: Map<string, number>, nowMs: number, maxScans: number): T[] {
  const due = domains.filter((d) => {
    const lastScan = latestScanAtByDomain.get(d.canonical_domain);
    const lastAttemptRaw = d.metadata?.[`${COHORT_METADATA_KEY}_last_attempt_at`];
    const lastAttempt = typeof lastAttemptRaw === 'string' ? Date.parse(lastAttemptRaw) : NaN;
    if (Number.isFinite(lastAttempt) && nowMs - lastAttempt < ATTEMPT_COOLDOWN_MS) return false;
    return lastScan === undefined || nowMs - lastScan > COHORT_STALE_MS;
  });
  due.sort(
    (a, b) =>
      (latestScanAtByDomain.get(a.canonical_domain) ?? 0) -
      (latestScanAtByDomain.get(b.canonical_domain) ?? 0)
  );
  return due.slice(0, maxScans);
}

async function latestCohortScans(
  supabase: SupabaseClient,
  domains: CohortDomainRow[]
): Promise<Map<string, { id: string; score: number | null; full_results_json: unknown; created_at: string }>> {
  const latest = new Map<string, { id: string; score: number | null; full_results_json: unknown; created_at: string }>();
  if (domains.length === 0) return latest;
  const wanted = new Set(domains.map((d) => d.canonical_domain));
  const variants = domains.flatMap((d) => [d.canonical_domain, `www.${d.canonical_domain}`, d.domain]);
  const { data } = await supabase
    .from('scans')
    .select('id,domain,score,full_results_json,created_at')
    .eq('run_source', 'internal_benchmark')
    .in('domain', Array.from(new Set(variants)))
    .order('created_at', { ascending: false })
    .limit(400);
  for (const row of (data ?? []) as { id: string; domain: string; score: number | null; full_results_json: unknown; created_at: string }[]) {
    const canonical = toCanonicalBenchmarkDomain(row.domain);
    if (!canonical || !wanted.has(canonical) || latest.has(canonical)) continue;
    latest.set(canonical, row);
  }
  return latest;
}

/**
 * The flag-gated weekly sweep, called from the hourly cron. Fail-CLOSED: scanning third-party
 * sites autonomously never happens unless 'competitor_benchmark' is switched on.
 */
export async function runCompetitorCohortSweep(args: {
  supabase: SupabaseClient;
  env: CohortEnvLike;
  nowMs: number;
  maxScans?: number;
}): Promise<{ enabled: boolean; due: number; scanned: number; failed: number }> {
  const { supabase, env, nowMs } = args;
  const maxScans = args.maxScans ?? 2;

  if (!(await isAgentEnabled(supabase, 'competitor_benchmark', { failOpen: false }))) {
    return { enabled: false, due: 0, scanned: 0, failed: 0 };
  }

  const domains = await listCohortDomains(supabase);
  const latest = await latestCohortScans(supabase, domains);
  const latestAt = new Map<string, number>();
  for (const [canonical, row] of latest) latestAt.set(canonical, Date.parse(row.created_at));

  const due = selectStaleCohortDomains(domains, latestAt, nowMs, maxScans);
  let scanned = 0;
  let failed = 0;
  for (const row of due) {
    const result = await scanCohortDomain(supabase, env, row);
    if (result.ok) scanned += 1;
    else failed += 1;
  }
  return { enabled: true, due: due.length, scanned, failed };
}

/** Everything the admin comparison page needs, grouped by (vertical, geo_region). */
export async function loadCohortComparison(supabase: SupabaseClient): Promise<Cohort[]> {
  const domains = await listCohortDomains(supabase);
  const latest = await latestCohortScans(supabase, domains);

  const groups = new Map<string, { vertical: string; geoRegion: string; domains: DomainComparison[] }>();
  for (const d of domains) {
    const vertical = d.vertical?.trim() || 'Unspecified market';
    const geoRegion = d.geo_region?.trim() || 'Unspecified region';
    const key = `${vertical}|${geoRegion}`;
    const scan = latest.get(d.canonical_domain);
    const signals = scan
      ? extractComparisonSignals(scan)
      : {
          score: null,
          scoreState: 'never_scanned' as const,
          destinations: {},
          structuredData: 'not_verified' as const,
          llmsTxt: 'not_verified' as const,
        };
    const entry: DomainComparison = {
      domainId: d.id,
      canonicalDomain: d.canonical_domain,
      displayName: d.display_name?.trim() || d.canonical_domain,
      isCustomer: d.is_customer,
      scannedAt: scan?.created_at ?? null,
      ...signals,
    };
    const group = groups.get(key) ?? { vertical, geoRegion, domains: [] };
    group.domains.push(entry);
    groups.set(key, group);
  }

  const cohorts = Array.from(groups.values());
  for (const cohort of cohorts) {
    cohort.domains.sort((a, b) => {
      if (a.isCustomer !== b.isCustomer) return a.isCustomer ? -1 : 1;
      return (b.score ?? -1) - (a.score ?? -1);
    });
  }
  cohorts.sort((a, b) => `${a.vertical}|${a.geoRegion}`.localeCompare(`${b.vertical}|${b.geoRegion}`));
  return cohorts;
}
