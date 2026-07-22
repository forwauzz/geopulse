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
const ATTEMPT_KEY = `${COHORT_METADATA_KEY}_last_attempt_at`;
/** Canonical domain actually observed after redirects (example.ca → example.com rebrands). */
const OBSERVED_KEY = `${COHORT_METADATA_KEY}_observed_domain`;
/** Weekly cadence with slack for hourly-cron jitter. */
export const COHORT_STALE_MS = 6.5 * 24 * 60 * 60 * 1000;
/**
 * Failed/incomplete attempts retry after hours, not a full week: the cron invocation can die
 * mid-scan (issue #104), and a full-cycle cooldown would burn that domain's slot for a week.
 * A genuinely dead site still costs at most one bounded (~65s) slot every cooldown.
 */
export const ATTEMPT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

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
  /** Position among the cohort's MEASURED domains (1 = best score); null when unmeasured. */
  readonly rank: number | null;
  /** Observable changes vs this domain's previous scan; empty until a second pass exists. */
  readonly deltas: SignalDelta[];
};

export type Cohort = {
  readonly vertical: string;
  readonly geoRegion: string;
  readonly domains: DomainComparison[];
  readonly standings: CohortStandings;
};

/** Aggregate market facts for one cohort — the synthesis layer's headline numbers (issue #123). */
export type CohortStandings = {
  readonly medianScore: number | null;
  readonly measuredCount: number;
  readonly totalCount: number;
  /** Per destination: how many measured-or-verified domains allow it, out of how many verified. */
  readonly destinationAllows: Partial<Record<DestinationId, { allows: number; of: number }>>;
};

/**
 * One observable change between two scans of the same domain. Framed as facts, reusable
 * verbatim by the future delta-email agent. Transitions in or out of 'not verified' are
 * never reported — we don't claim a change we didn't observe on both sides.
 */
export type SignalDelta = {
  readonly kind: 'score' | 'destination' | 'structured_data' | 'llms_txt';
  readonly direction: 'improved' | 'regressed';
  readonly label: string;
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

export const DESTINATION_LABELS: Record<DestinationId, string> = {
  google_search_ai_overviews: 'AI Overviews',
  chatgpt_search: 'ChatGPT search',
  claude: 'Claude',
  perplexity: 'Perplexity',
  bing_copilot: 'Copilot',
};

type ExtractedSignals = ReturnType<typeof extractComparisonSignals>;

const PAGE_SIGNAL_LADDER: Record<PageSignal, number | null> = {
  present: 2,
  partial: 1,
  missing: 0,
  not_verified: null,
};

/**
 * Observable changes between two scans of one domain. A signal must be verified on BOTH
 * sides to count — appearing from or vanishing into 'not verified' is not a change we saw.
 */
export function computeDomainDeltas(current: ExtractedSignals, previous: ExtractedSignals): SignalDelta[] {
  const deltas: SignalDelta[] = [];

  if (
    current.scoreState === 'measured' &&
    previous.scoreState === 'measured' &&
    current.score != null &&
    previous.score != null &&
    current.score !== previous.score
  ) {
    deltas.push({
      kind: 'score',
      direction: current.score > previous.score ? 'improved' : 'regressed',
      label: `Score ${String(previous.score)} → ${String(current.score)}`,
    });
  }

  for (const dest of Object.keys(DESTINATION_LABELS) as DestinationId[]) {
    const cur = current.destinations[dest];
    const prev = previous.destinations[dest];
    if (!cur || !prev || cur === 'not_verified' || prev === 'not_verified' || cur === prev) continue;
    deltas.push({
      kind: 'destination',
      direction: cur === 'allows' ? 'improved' : 'regressed',
      label: `${cur === 'allows' ? 'Now allows' : 'Now blocks'} ${DESTINATION_LABELS[dest]}`,
    });
  }

  const pageChecks: { kind: SignalDelta['kind']; label: string; cur: PageSignal; prev: PageSignal }[] = [
    { kind: 'structured_data', label: 'Structured data', cur: current.structuredData, prev: previous.structuredData },
    { kind: 'llms_txt', label: 'llms.txt', cur: current.llmsTxt, prev: previous.llmsTxt },
  ];
  for (const check of pageChecks) {
    const curRung = PAGE_SIGNAL_LADDER[check.cur];
    const prevRung = PAGE_SIGNAL_LADDER[check.prev];
    if (curRung == null || prevRung == null || curRung === prevRung) continue;
    deltas.push({
      kind: check.kind,
      direction: curRung > prevRung ? 'improved' : 'regressed',
      label: `${check.label}: ${check.prev.replace('_', ' ')} → ${check.cur.replace('_', ' ')}`,
    });
  }

  return deltas;
}

/** Aggregate market facts across one cohort's rows, exported for tests + the delta agent. */
export function computeCohortStandings(
  domains: Pick<DomainComparison, 'score' | 'scoreState' | 'destinations'>[]
): CohortStandings {
  const measured = domains
    .filter((d) => d.scoreState === 'measured' && d.score != null)
    .map((d) => d.score as number)
    .sort((a, b) => a - b);
  const mid = measured.length / 2;
  const medianScore =
    measured.length === 0
      ? null
      : measured.length % 2 === 1
        ? (measured[Math.floor(mid)] ?? null)
        : Math.round(((measured[mid - 1] ?? 0) + (measured[mid] ?? 0)) / 2);

  const destinationAllows: Partial<Record<DestinationId, { allows: number; of: number }>> = {};
  for (const dest of Object.keys(DESTINATION_LABELS) as DestinationId[]) {
    let allows = 0;
    let of = 0;
    for (const d of domains) {
      const signal = d.destinations[dest];
      if (signal !== 'allows' && signal !== 'blocks') continue;
      of += 1;
      if (signal === 'allows') allows += 1;
    }
    if (of > 0) destinationAllows[dest] = { allows, of };
  }

  return { medianScore, measuredCount: measured.length, totalCount: domains.length, destinationAllows };
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
  delete metadata[ATTEMPT_KEY];
  delete metadata[OBSERVED_KEY];
  await supabase.from('benchmark_domains').update({ metadata }).eq('id', id);
}

/** Scan one cohort domain now and persist it as a normal internal_benchmark scan. */
export async function scanCohortDomain(
  supabase: SupabaseClient,
  env: CohortEnvLike,
  row: Pick<CohortDomainRow, 'id' | 'domain' | 'canonical_domain' | 'site_url' | 'metadata'>
): Promise<{ ok: true; scanId: string } | { ok: false; reason: string }> {
  const targetUrl = row.site_url ?? `https://${row.domain}`;
  const attemptedAt = new Date().toISOString();
  const stampedMetadata = { ...row.metadata, [ATTEMPT_KEY]: attemptedAt };
  await supabase.from('benchmark_domains').update({ metadata: stampedMetadata }).eq('id', row.id);

  const scan = await runFreeScan(targetUrl, buildAuditLlm(env));

  // A cross-domain redirect (example.ca → example.com) persists the scan under the observed
  // host; remember it as an alias so the comparison and staleness lookups keep matching.
  if (scan.ok) {
    const observed = toCanonicalBenchmarkDomain(scan.domain);
    if (observed && observed !== row.canonical_domain) {
      await supabase
        .from('benchmark_domains')
        .update({ metadata: { ...stampedMetadata, [OBSERVED_KEY]: observed } })
        .eq('id', row.id);
    }
  }

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
    const lastAttemptRaw = d.metadata?.[ATTEMPT_KEY];
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

type CohortScanRow = { id: string; score: number | null; full_results_json: unknown; created_at: string };

/** Newest-first history per cohort canonical domain, capped at two rows (current + previous). */
async function latestCohortScans(
  supabase: SupabaseClient,
  domains: CohortDomainRow[]
): Promise<Map<string, CohortScanRow[]>> {
  const latest = new Map<string, CohortScanRow[]>();
  if (domains.length === 0) return latest;

  // Scans may be stored under a redirect-observed host — map every known alias back to the
  // cohort row's canonical_domain, which is the key everything else joins on.
  const aliasToCohort = new Map<string, string>();
  for (const d of domains) {
    aliasToCohort.set(d.canonical_domain, d.canonical_domain);
    const observed = d.metadata?.[OBSERVED_KEY];
    if (typeof observed === 'string' && observed) aliasToCohort.set(observed, d.canonical_domain);
  }
  const variants = Array.from(aliasToCohort.keys()).flatMap((a) => [a, `www.${a}`]);
  for (const d of domains) variants.push(d.domain);

  const { data } = await supabase
    .from('scans')
    .select('id,domain,score,full_results_json,created_at')
    .eq('run_source', 'internal_benchmark')
    .in('domain', Array.from(new Set(variants)))
    .order('created_at', { ascending: false })
    .limit(400);
  for (const row of (data ?? []) as (CohortScanRow & { domain: string })[]) {
    const canonical = toCanonicalBenchmarkDomain(row.domain);
    const cohortKey = canonical ? aliasToCohort.get(canonical) : undefined;
    if (!cohortKey) continue;
    const rows = latest.get(cohortKey) ?? [];
    if (rows.length >= 2) continue;
    rows.push(row);
    latest.set(cohortKey, rows);
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
  for (const [canonical, rows] of latest) {
    if (rows[0]) latestAt.set(canonical, Date.parse(rows[0].created_at));
  }

  const due = selectStaleCohortDomains(domains, latestAt, nowMs, maxScans);
  let scanned = 0;
  let failed = 0;
  for (const row of due) {
    // One throwing scan must not abort the rest of the tick's budget.
    try {
      const result = await scanCohortDomain(supabase, env, row);
      if (result.ok) scanned += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      structuredLog(
        'competitor_cohort_scan_failed',
        { domainId: row.id, reason: error instanceof Error ? error.message : 'unknown_throw' },
        'warning'
      );
    }
  }
  return { enabled: true, due: due.length, scanned, failed };
}

/** Everything the admin comparison page needs, grouped by (vertical, geo_region). */
export async function loadCohortComparison(supabase: SupabaseClient): Promise<Cohort[]> {
  const domains = await listCohortDomains(supabase);
  const latest = await latestCohortScans(supabase, domains);

  type MutableEntry = Omit<DomainComparison, 'rank'> & { rank: number | null };
  const groups = new Map<string, { vertical: string; geoRegion: string; domains: MutableEntry[] }>();
  for (const d of domains) {
    const vertical = d.vertical?.trim() || 'Unspecified market';
    const geoRegion = d.geo_region?.trim() || 'Unspecified region';
    const key = `${vertical}|${geoRegion}`;
    const history = latest.get(d.canonical_domain) ?? [];
    const scan = history[0];
    const signals = scan
      ? extractComparisonSignals(scan)
      : {
          score: null,
          scoreState: 'never_scanned' as const,
          destinations: {},
          structuredData: 'not_verified' as const,
          llmsTxt: 'not_verified' as const,
        };
    const previous = history[1];
    const entry: MutableEntry = {
      domainId: d.id,
      canonicalDomain: d.canonical_domain,
      displayName: d.display_name?.trim() || d.canonical_domain,
      isCustomer: d.is_customer,
      scannedAt: scan?.created_at ?? null,
      rank: null,
      deltas: scan && previous ? computeDomainDeltas(signals, extractComparisonSignals(previous)) : [],
      ...signals,
    };
    const group = groups.get(key) ?? { vertical, geoRegion, domains: [] };
    group.domains.push(entry);
    groups.set(key, group);
  }

  const cohorts: Cohort[] = [];
  for (const group of groups.values()) {
    // Rank by score across the cohort's measured domains (1 = best), then display customer-first.
    const measured = group.domains
      .filter((d) => d.scoreState === 'measured' && d.score != null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    measured.forEach((d, i) => {
      d.rank = i + 1;
    });
    group.domains.sort((a, b) => {
      if (a.isCustomer !== b.isCustomer) return a.isCustomer ? -1 : 1;
      return (b.score ?? -1) - (a.score ?? -1);
    });
    cohorts.push({
      vertical: group.vertical,
      geoRegion: group.geoRegion,
      domains: group.domains,
      standings: computeCohortStandings(group.domains),
    });
  }
  cohorts.sort((a, b) => `${a.vertical}|${a.geoRegion}`.localeCompare(`${b.vertical}|${b.geoRegion}`));
  return cohorts;
}
