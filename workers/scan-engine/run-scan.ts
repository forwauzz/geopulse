/**
 * Orchestrates fetch → parse → registered checks → score (single responsibility: run one free scan).
 *
 * When the target blocks the scanner's own fetch, the scan does NOT fail with a content error:
 * it returns a `blocked` payload — every content check marked NOT_EVALUATED and chained to the
 * access root cause, plus an Access & Eligibility Matrix graded from whatever robots.txt reveals
 * (spec C4: NOT TESTED semantics; a WAF block is a finding, not a crash).
 */
import type { CheckCategory, CheckResult, CheckStatus } from '../lib/interfaces/audit';
import type { LLMProvider } from '../lib/interfaces/providers';
import { extractDomain } from '../lib/ssrf';
import { fetchGateText } from '../lib/fetch-gate';
import { fetchPage } from './fetch-page';
import { buildTextSample, parsePageSignals } from './parse-signals';
import { buildDeterministicChecks, buildFreeTierChecks } from './checks/registry';
import { buildAccessMatrix, type AccessMatrix } from './access-matrix';
import { CHECK_CATALOG_VERSION, bucketOf, type CheckBucket } from './check-catalog';
import {
  attachWeights,
  computeScore,
  computeBucketScores,
  computeCategoryScores,
  eligibilityBand,
  letterGrade,
  topFailedIssues,
  type BucketScore,
  type CategoryScore,
  type EligibilityBand,
} from './scoring';

// ── LLM verdict cache (issue #109) ────────────────────────────────────────────
// The two LLM checks judge ONLY the page's text sample. When that sample is
// byte-identical to a previous audit, we reuse the stored verdicts — so a site
// that has not changed produces an IDENTICAL score by construction (and repeat
// audits cost zero Gemini tokens). Registered per-invocation like the self-fetch.

type LlmVerdictCache = {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

let llmVerdictCache: LlmVerdictCache | null = null;

export function registerLlmVerdictCache(cache: LlmVerdictCache | null): void {
  llmVerdictCache = cache;
}

const LLM_CACHE_VERSION = 'llmv1';
const LLM_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const LLM_CHECK_IDS = new Set(['llm-qa-pattern', 'llm-extractability']);

async function llmCacheKey(textSample: string): Promise<string> {
  const bytes = new TextEncoder().encode(textSample);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${LLM_CACHE_VERSION}:${hash}`;
}

function isCacheableVerdict(r: CheckResult): boolean {
  // Transient provider failures must not stick for 30 days.
  if (r.confidence === 'low' && /^(http_|unparseable|GEMINI_API_KEY)/i.test(r.finding)) return false;
  return true;
}

export interface ScanIssueJson {
  check: string;
  checkId: string;
  weight: number;
  passed: boolean;
  status: CheckStatus;
  category: CheckCategory;
  /** Scoring bucket (spec §3): hygiene issues never affect the AI-readiness score. */
  bucket: CheckBucket;
  finding: string;
  fix?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface FreeScanOutput {
  score: number;
  letterGrade: string;
  issues: ScanIssueJson[];
  topIssues: ScanIssueJson[];
  categoryScores: CategoryScore[];
  /** Bucket subtotals with published weights (spec C6/C7). */
  bucketScores: BucketScore[];
  /** Which catalog version produced these weights — the score is reproducible from it. */
  checkCatalogVersion: string;
  /** Access & Eligibility Matrix — per-destination eligibility + training panel (spec C3). */
  accessMatrix?: AccessMatrix;
  /** Plain-English eligibility band derived from the matrix (spec C6). */
  eligibility?: { band: EligibilityBand; label: string };
}

/** Payload for a scan whose page fetch was blocked — a diagnosis, not a graded audit. */
export interface BlockedScanPayload {
  accessMatrix: AccessMatrix;
  /** Every registered check, marked NOT_EVALUATED and chained to the access root cause. */
  issues: ScanIssueJson[];
  domain: string;
  requestedUrl: string;
}

/**
 * Run audit checks on already-fetched HTML (deep crawl: one fetch per URL).
 */
export async function auditPageFromHtml(
  finalUrl: string,
  html: string,
  llm: LLMProvider,
  options: {
    useLlm: boolean;
    robotsTxtContent?: string;
    llmsTxtContent?: string;
    responseHeaders?: Record<string, string>;
  }
): Promise<FreeScanOutput> {
  const signals = parsePageSignals(html);
  const textSample = buildTextSample(html);
  const ctx = {
    signals,
    finalUrl,
    textSample,
    robotsTxtContent: options.robotsTxtContent ?? '',
    llmsTxtContent: options.llmsTxtContent ?? '',
    responseHeaders: options.responseHeaders ?? {},
  };

  const checks = options.useLlm ? buildFreeTierChecks(llm) : buildDeterministicChecks();

  // Deterministic repeat audits (issue #109): identical text sample → identical verdicts.
  let cachedLlmResults: Map<string, CheckResult> | null = null;
  let cacheKey: string | null = null;
  if (options.useLlm && llmVerdictCache) {
    try {
      cacheKey = await llmCacheKey(textSample);
      const hit = await llmVerdictCache.get(cacheKey, 'text');
      if (hit) {
        const parsed: unknown = JSON.parse(hit);
        if (Array.isArray(parsed)) {
          cachedLlmResults = new Map(
            parsed
              .filter((r): r is CheckResult => Boolean(r && typeof r === 'object' && LLM_CHECK_IDS.has((r as CheckResult).id)))
              .map((r) => [r.id, r])
          );
        }
      }
    } catch {
      cachedLlmResults = null;
    }
  }

  const results: CheckResult[] = [];
  const freshLlmResults: CheckResult[] = [];
  for (const c of checks) {
    const cached = LLM_CHECK_IDS.has(c.id) ? cachedLlmResults?.get(c.id) : undefined;
    if (cached) {
      results.push(cached);
      continue;
    }
    const result = await c.run(ctx);
    results.push(result);
    if (LLM_CHECK_IDS.has(c.id)) freshLlmResults.push(result);
  }

  if (
    llmVerdictCache &&
    cacheKey &&
    freshLlmResults.length === LLM_CHECK_IDS.size &&
    freshLlmResults.every(isCacheableVerdict)
  ) {
    try {
      await llmVerdictCache.put(cacheKey, JSON.stringify(freshLlmResults), {
        expirationTtl: LLM_CACHE_TTL_SECONDS,
      });
    } catch {
      /* caching is an optimization, never a failure */
    }
  }

  const weighted = attachWeights(
    checks.map((c) => ({ weight: c.weight, category: c.category })),
    results
  );

  const score = computeScore(weighted);
  const lg = letterGrade(score);
  const categoryScores = computeCategoryScores(weighted);
  const bucketScores = computeBucketScores(weighted);

  const mapIssue = (r: (typeof weighted)[number]): ScanIssueJson => ({
    check: checks.find((c) => c.id === r.id)?.name ?? r.id,
    checkId: r.id,
    weight: r.weight,
    passed: r.passed,
    status: r.status,
    category: r.category,
    bucket: r.bucket,
    finding: r.finding,
    fix: r.fix,
    confidence: r.confidence,
  });

  const issues: ScanIssueJson[] = weighted.map(mapIssue);

  const topWeighted = topFailedIssues(weighted, 3);
  const topIssues: ScanIssueJson[] = topWeighted.map(mapIssue);

  return {
    score,
    letterGrade: lg,
    issues,
    topIssues:
      topIssues.length > 0 ? topIssues : issues.filter((i) => !i.passed).slice(0, 3),
    categoryScores,
    bucketScores,
    checkCatalogVersion: CHECK_CATALOG_VERSION,
  };
}

async function fetchSideResource(baseUrl: string, path: string): Promise<string | null> {
  try {
    const origin = new URL(baseUrl).origin;
    const r = await fetchGateText(`${origin}${path}`, {
      maxBytes: 32_000,
      timeoutMs: 5_000,
      acceptHeader: 'text/plain,*/*',
    });
    return r.ok ? r.text : null;
  } catch {
    return null;
  }
}

/** Every registered check as a NOT_EVALUATED row chained to the access root cause. */
function notTestedIssues(rootCause: string): ScanIssueJson[] {
  return buildDeterministicChecks().map((c) => ({
    check: c.name,
    checkId: c.id,
    weight: c.weight,
    passed: false,
    status: 'NOT_EVALUATED' as CheckStatus,
    category: c.category,
    bucket: bucketOf(c.id),
    finding: `Not tested — the page could not be retrieved (${rootCause}). This is an access problem, not a content problem.`,
  }));
}

export async function runFreeScan(url: string, llm: LLMProvider): Promise<
  | { ok: true; output: FreeScanOutput; finalUrl: string; domain: string; textSample: string }
  | { ok: false; reason: string; blocked?: BlockedScanPayload }
> {
  const fetched = await fetchPage(url);

  if (!fetched.ok) {
    // The scanner itself was blocked. robots.txt is usually still served by the CDN edge,
    // so grade what we can and diagnose the rest instead of failing the scan.
    const domain = extractDomain(url);
    if (!domain) return { ok: false, reason: fetched.reason };

    const robotsTxtContent = await fetchSideResource(url, '/robots.txt');
    const accessMatrix = buildAccessMatrix({
      robotsTxt: robotsTxtContent,
      pageFetched: false,
      failure: { status: fetched.status, headers: fetched.headers, reason: fetched.reason },
    });

    return {
      ok: false,
      reason: fetched.reason,
      blocked: {
        accessMatrix,
        issues: notTestedIssues(accessMatrix.diagnosis.rootCause ?? fetched.reason),
        domain,
        requestedUrl: url,
      },
    };
  }

  const [robotsTxtContent, llmsTxtContent] = await Promise.all([
    fetchSideResource(fetched.finalUrl, '/robots.txt'),
    fetchSideResource(fetched.finalUrl, '/llms.txt'),
  ]);

  const output = await auditPageFromHtml(fetched.finalUrl, fetched.html, llm, {
    useLlm: true,
    robotsTxtContent: robotsTxtContent ?? '',
    llmsTxtContent: llmsTxtContent ?? '',
    // Without this the header-based checks (e.g. security headers) saw an empty map and
    // reported "Present: none" for EVERY site — a false negative on every free scan.
    responseHeaders: fetched.headers,
  });

  const signals = parsePageSignals(fetched.html);
  const robotsMeta = signals.robotsMetaContent?.toLowerCase() ?? '';
  output.accessMatrix = buildAccessMatrix({
    robotsTxt: robotsTxtContent,
    pageFetched: true,
    signals: {
      noindex: robotsMeta.includes('noindex') || robotsMeta.includes('none'),
      snippetRestricted: signals.hasSnippetRestriction,
    },
  });
  output.eligibility = eligibilityBand(output.accessMatrix.rows);

  const domain = extractDomain(fetched.finalUrl);
  if (!domain) return { ok: false, reason: 'Could not extract domain' };

  return {
    ok: true,
    finalUrl: fetched.finalUrl,
    domain,
    output,
    // Exposed so downstream consumers (e.g. the Fix Agent) can ground generation in what the page
    // actually says instead of inferring product facts from the domain name.
    textSample: buildTextSample(fetched.html),
  };
}
