/**
 * Multi-page deep audit: robots + sitemap discovery, section-aware URL cap (DA-001 + DA-002).
 * DA-004: Chunked execution + scan_runs.config.crawl_pending for queue continuation (100+ pages).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMProvider } from '../lib/interfaces/providers';
import { fetchHtmlPage } from '../lib/fetch-gate';
import { MAX_DEEP_AUDIT_PAGE_LIMIT } from '../../lib/server/deep-audit-page-limit';
import { structuredLog } from '../../lib/server/structured-log';
import { auditPageFromHtml } from './run-scan';
import {
  extractSameOriginLinks,
  normalizeUrlKey,
  pathSectionKey,
  prioritizeUrlsBySection,
  sameHostname,
} from './crawl-url-utils';
import {
  crawlDelayMsFromRobotsSeconds,
  fetchRobotsTxt,
  fetchSitemapXml,
  isPathAllowedByRobots,
  parseRobotsTxt,
  parseSitemapLocs,
} from './robots-and-sitemap';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DeepCrawlPageSummary = {
  readonly url: string;
  readonly normalizedUrl: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly issuesJson: unknown;
};

/** Re-export for tests and callers that imported from this module (DA-001). */
export { extractSameOriginLinks, normalizeUrlKey } from './crawl-url-utils';

function averageScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round(sum / scores.length);
}

function discoveredByFor(
  norm: string,
  seedNorm: string,
  sitemapNorms: ReadonlySet<string>
): 'seed' | 'sitemap' | 'link' {
  if (norm === seedNorm) return 'seed';
  if (sitemapNorms.has(norm)) return 'sitemap';
  return 'link';
}

const MAX_SITEMAPS = 5;
const MAX_LOCS_PER_SITEMAP = 200;

/** Re-export for callers that imported `MAX_DEEP_AUDIT_PAGE_LIMIT` from this module. */
export { MAX_DEEP_AUDIT_PAGE_LIMIT };
const DEFAULT_CHUNK_SIZE = 25;
const MAX_CHUNK_SIZE = 40;

export type CrawlPendingState = {
  readonly ordered_urls: readonly string[];
  readonly next_index: number;
  readonly chunk_size: number;
  readonly crawl_delay_ms: number;
  readonly sitemap_norms: readonly string[];
  readonly seed_norm: string;
  readonly robots_status: number;
  readonly sitemap_urls_considered: number;
};

export type DeepAuditCrawlResult =
  | { ok: true; phase: 'complete'; pages: readonly DeepCrawlPageSummary[]; aggregateScore: number }
  | { ok: true; phase: 'partial' }
  | { ok: false; reason: string };

type SeedFetchOk = { ok: true; html: string; finalUrl: string };

/** Parses crawl_pending; fills defaults for older partial states missing robots metadata. */
export function parseCrawlPending(raw: unknown): CrawlPendingState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o['ordered_urls']) || typeof o['next_index'] !== 'number') return null;
  const urls = o['ordered_urls'] as unknown[];
  if (!urls.every((u) => typeof u === 'string')) return null;
  if (typeof o['crawl_delay_ms'] !== 'number') return null;
  if (!Array.isArray(o['sitemap_norms'])) return null;
  const sn = o['sitemap_norms'] as unknown[];
  if (!sn.every((s) => typeof s === 'string')) return null;
  if (typeof o['seed_norm'] !== 'string') return null;
  return {
    ordered_urls: urls as string[],
    next_index: o['next_index'] as number,
    chunk_size: typeof o['chunk_size'] === 'number' && o['chunk_size'] > 0 ? (o['chunk_size'] as number) : DEFAULT_CHUNK_SIZE,
    crawl_delay_ms: o['crawl_delay_ms'] as number,
    sitemap_norms: sn as string[],
    seed_norm: o['seed_norm'] as string,
    robots_status: typeof o['robots_status'] === 'number' ? (o['robots_status'] as number) : 200,
    sitemap_urls_considered:
      typeof o['sitemap_urls_considered'] === 'number' ? (o['sitemap_urls_considered'] as number) : 1,
  };
}

function mergeConfig(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

/**
 * Run bounded same-origin crawl, persist scan_pages rows, update scan_runs timestamps.
 * May return `phase: 'partial'` when more URLs remain; consumer must re-enqueue the same queue message.
 */
export async function runDeepAuditCrawl(
  supabase: SupabaseClient,
  llm: LLMProvider,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly pageLimit: number;
    readonly chunkSize?: number;
  }
): Promise<DeepAuditCrawlResult> {
  const { runId, seedUrl, pageLimit, chunkSize: chunkSizeIn } = params;
  const limit = Math.max(1, Math.min(pageLimit, MAX_DEEP_AUDIT_PAGE_LIMIT));
  const chunkSize = Math.max(
    1,
    Math.min(chunkSizeIn ?? DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE, limit)
  );

  const { data: runRow, error: runLoadErr } = await supabase
    .from('scan_runs')
    .select('config')
    .eq('id', runId)
    .maybeSingle();

  if (runLoadErr) {
    return { ok: false, reason: runLoadErr.message };
  }

  const cfg = runRow?.config;
  const pendingRaw = cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>)['crawl_pending'] : undefined;
  const pendingParsed = parseCrawlPending(pendingRaw);

  if (pendingParsed) {
    return continueChunkedCrawl(supabase, llm, {
      runId,
      seedUrl,
      pending: pendingParsed,
      limit,
      chunkSize,
    });
  }

  return startChunkedCrawl(supabase, llm, {
    runId,
    seedUrl,
    limit,
    chunkSize,
  });
}

async function startChunkedCrawl(
  supabase: SupabaseClient,
  llm: LLMProvider,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly limit: number;
    readonly chunkSize: number;
  }
): Promise<DeepAuditCrawlResult> {
  const { runId, seedUrl, limit, chunkSize } = params;
  const crawlWallStart = Date.now();
  let pagesErrored = 0;
  const started = new Date().toISOString();
  const { error: startErr } = await supabase
    .from('scan_runs')
    .update({ started_at: started })
    .eq('id', runId);
  if (startErr) {
    structuredLog('deep_audit_crawl_start_failed', { runId, message: startErr.message.slice(0, 120) });
    return { ok: false, reason: startErr.message };
  }

  let originBase: string;
  let hostLower: string;
  let seedPath: string;
  try {
    const o = new URL(seedUrl);
    originBase = `${o.protocol}//${o.host}/`;
    hostLower = o.hostname.toLowerCase();
    seedPath = o.pathname || '/';
  } catch {
    return { ok: false, reason: 'Invalid seed URL' };
  }

  const robotsRes = await fetchRobotsTxt(originBase);
  if (!robotsRes.ok) {
    structuredLog('robots_fetch_failed', { runId, message: robotsRes.reason.slice(0, 120) });
    return { ok: false, reason: robotsRes.reason };
  }

  let disallows: readonly string[] = [];
  const sitemapUrlsFromRobots: string[] = [];
  let crawlDelaySeconds: number | null = null;
  if (robotsRes.status !== 404 && robotsRes.status !== 403 && robotsRes.text.length > 0) {
    const parsed = parseRobotsTxt(robotsRes.text);
    disallows = parsed.disallows;
    sitemapUrlsFromRobots.push(...parsed.sitemapUrls);
    crawlDelaySeconds = parsed.crawlDelaySeconds;
  }
  const crawlDelayMs = crawlDelayMsFromRobotsSeconds(crawlDelaySeconds);

  if (!isPathAllowedByRobots(seedPath, disallows)) {
    const seedNorm = normalizeUrlKey(seedUrl);
    await supabase.from('scan_pages').insert({
      run_id: runId,
      url: seedUrl,
      normalized_url: seedNorm || seedUrl,
      parent_id: null,
      status: 'skipped',
      discovered_by: 'seed',
      blocked_by_robots: true,
      error_message: 'Disallowed by robots.txt',
      section: pathSectionKey(seedPath),
    });
    await supabase
      .from('scan_runs')
      .update({
        completed_at: new Date().toISOString(),
        coverage_summary: { seed_blocked_by_robots: true, robots_status: robotsRes.status },
      })
      .eq('id', runId);
    return { ok: false, reason: 'seed_blocked_by_robots' };
  }

  const sitemapNorms = new Set<string>();
  const candidateUrls: string[] = [seedUrl];

  const ingestSitemap = async (smUrl: string): Promise<void> => {
    const sx = await fetchSitemapXml(smUrl, 5_000_000);
    if (!sx.ok) return;
    const locs = parseSitemapLocs(sx.text, MAX_LOCS_PER_SITEMAP);
    for (const loc of locs) {
      if (!sameHostname(loc, hostLower)) continue;
      try {
        const p = new URL(loc).pathname;
        if (!isPathAllowedByRobots(p, disallows)) continue;
      } catch {
        continue;
      }
      const n = normalizeUrlKey(loc);
      if (n) sitemapNorms.add(n);
      candidateUrls.push(loc);
    }
  };

  const smList =
    sitemapUrlsFromRobots.length > 0
      ? sitemapUrlsFromRobots.slice(0, MAX_SITEMAPS)
      : [new URL('/sitemap.xml', originBase).toString()];

  for (const sm of smList) {
    await ingestSitemap(sm);
  }

  const seedFetch = await fetchHtmlPage(seedUrl);
  if (!seedFetch.ok) {
    const seedNorm = normalizeUrlKey(seedUrl);
    const t0 = Date.now();
    pagesErrored += 1;
    await supabase.from('scan_pages').insert({
      run_id: runId,
      url: seedUrl,
      normalized_url: seedNorm || seedUrl,
      parent_id: null,
      status: 'error',
      discovered_by: 'seed',
      fetch_ms: Date.now() - t0,
      error_message: seedFetch.reason,
      section: pathSectionKey(seedPath),
    });
    return { ok: false, reason: seedFetch.reason };
  }

  candidateUrls.push(seedFetch.finalUrl);

  const links = extractSameOriginLinks(seedFetch.html, seedFetch.finalUrl, 500);
  for (const l of links) {
    try {
      const p = new URL(l).pathname;
      if (!isPathAllowedByRobots(p, disallows)) continue;
    } catch {
      continue;
    }
    candidateUrls.push(l);
  }

  const merged = [...new Set(candidateUrls)];
  const allowed = merged.filter((u) => {
    try {
      return isPathAllowedByRobots(new URL(u).pathname, disallows);
    } catch {
      return false;
    }
  });

  const ordered = prioritizeUrlsBySection(seedFetch.finalUrl, allowed, limit);
  const seedNormFinal = normalizeUrlKey(seedFetch.finalUrl);

  const end = Math.min(chunkSize, ordered.length);
  const sliceRes = await processUrlSlice(supabase, llm, {
    runId,
    seedUrl,
    ordered,
    startIndex: 0,
    endExclusive: end,
    crawlDelayMs,
    sitemapNorms,
    seedNormFinal,
    seedFetchCached: { ok: true, html: seedFetch.html, finalUrl: seedFetch.finalUrl },
    robotsTxtContent: robotsRes.text,
  });
  pagesErrored += sliceRes.pagesErroredDelta;

  if (end < ordered.length) {
    const { data: cfgRow } = await supabase.from('scan_runs').select('config').eq('id', runId).maybeSingle();
    const nextConfig = mergeConfig(cfgRow?.config, {
      crawl_pending: {
        ordered_urls: [...ordered],
        next_index: end,
        chunk_size: chunkSize,
        crawl_delay_ms: crawlDelayMs,
        sitemap_norms: [...sitemapNorms],
        seed_norm: seedNormFinal,
        robots_status: robotsRes.status,
        sitemap_urls_considered: smList.length,
      } satisfies CrawlPendingState,
    });
    const { error: cfgErr } = await supabase.from('scan_runs').update({ config: nextConfig }).eq('id', runId);
    if (cfgErr) {
      return { ok: false, reason: cfgErr.message };
    }
    structuredLog('deep_audit_crawl_chunk_partial', {
      runId,
      next_index: end,
      total: ordered.length,
      chunk_size: chunkSize,
    });
    return { ok: true, phase: 'partial' };
  }

  return finalizeDeepCrawl(supabase, {
    runId,
    seedUrl,
    ordered,
    crawlWallStart,
    crawlDelayMs,
    limit,
    robotsStatus: robotsRes.status,
    sitemapCount: smList.length,
  });
}

async function continueChunkedCrawl(
  supabase: SupabaseClient,
  llm: LLMProvider,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly pending: CrawlPendingState;
    readonly limit: number;
    readonly chunkSize: number;
  }
): Promise<DeepAuditCrawlResult> {
  const { runId, seedUrl, pending, limit, chunkSize } = params;

  const ordered = pending.ordered_urls.slice(0, limit);
  const sitemapNorms = new Set(pending.sitemap_norms);
  const seedNormFinal = pending.seed_norm;
  const crawlDelayMs = pending.crawl_delay_ms;
  const start = Math.max(0, pending.next_index);
  if (start >= ordered.length) {
    await clearCrawlPending(supabase, runId);
    return { ok: false, reason: 'crawl_pending_exhausted' };
  }
  const end = Math.min(start + chunkSize, ordered.length);

  await processUrlSlice(supabase, llm, {
    runId,
    seedUrl,
    ordered,
    startIndex: start,
    endExclusive: end,
    crawlDelayMs,
    sitemapNorms,
    seedNormFinal,
    seedFetchCached: undefined,
  });

  if (end < ordered.length) {
    const { data: cfgRow } = await supabase.from('scan_runs').select('config').eq('id', runId).maybeSingle();
    const nextConfig = mergeConfig(cfgRow?.config, {
      crawl_pending: {
        ordered_urls: [...ordered],
        next_index: end,
        chunk_size: chunkSize,
        crawl_delay_ms: pending.crawl_delay_ms,
        sitemap_norms: [...pending.sitemap_norms],
        seed_norm: pending.seed_norm,
        robots_status: pending.robots_status,
        sitemap_urls_considered: pending.sitemap_urls_considered,
      } satisfies CrawlPendingState,
    });
    const { error: cfgErr } = await supabase.from('scan_runs').update({ config: nextConfig }).eq('id', runId);
    if (cfgErr) {
      return { ok: false, reason: cfgErr.message };
    }
    structuredLog('deep_audit_crawl_chunk_partial', {
      runId,
      next_index: end,
      total: ordered.length,
      chunk_size: chunkSize,
    });
    return { ok: true, phase: 'partial' };
  }

  const fin = await finalizeDeepCrawl(supabase, {
    runId,
    seedUrl,
    ordered,
    crawlWallStart: Date.now(),
    crawlDelayMs,
    limit,
    robotsStatus: pending.robots_status,
    sitemapCount: pending.sitemap_urls_considered,
  });
  if (fin.ok) {
    await clearCrawlPending(supabase, runId);
  }
  return fin;
}

async function clearCrawlPending(supabase: SupabaseClient, runId: string): Promise<void> {
  const { data: cfgRow } = await supabase.from('scan_runs').select('config').eq('id', runId).maybeSingle();
  const c = cfgRow?.config;
  if (!c || typeof c !== 'object') return;
  const next = { ...(c as Record<string, unknown>) };
  delete next['crawl_pending'];
  await supabase.from('scan_runs').update({ config: next }).eq('id', runId);
}

async function processUrlSlice(
  supabase: SupabaseClient,
  llm: LLMProvider,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly ordered: readonly string[];
    readonly startIndex: number;
    readonly endExclusive: number;
    readonly crawlDelayMs: number;
    readonly sitemapNorms: ReadonlySet<string>;
    readonly seedNormFinal: string;
    readonly seedFetchCached?: SeedFetchOk;
    readonly robotsTxtContent?: string;
  }
): Promise<{ pagesErroredDelta: number }> {
  const {
    runId,
    seedUrl,
    ordered,
    startIndex,
    endExclusive,
    crawlDelayMs,
    sitemapNorms,
    seedNormFinal,
    seedFetchCached,
    robotsTxtContent,
  } = params;

  let pagesErroredDelta = 0;

  const { count: fetchedBeforeChunk } = await supabase
    .from('scan_pages')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('status', 'fetched');

  let llmRemaining = (fetchedBeforeChunk ?? 0) === 0;

  for (let i = startIndex; i < endExclusive; i += 1) {
    const targetUrl = ordered[i];
    if (!targetUrl) continue;

    const norm = normalizeUrlKey(targetUrl);
    if (!norm) continue;

    const { data: existingRow } = await supabase
      .from('scan_pages')
      .select('id,status')
      .eq('run_id', runId)
      .eq('normalized_url', norm)
      .maybeSingle();

    if (existingRow?.status === 'fetched') {
      continue;
    }

    const pathForSection = (() => {
      try {
        return new URL(targetUrl).pathname;
      } catch {
        return '/';
      }
    })();
    const section = pathSectionKey(pathForSection);
    const isSeedPage = norm === seedNormFinal;
    const disc: 'seed' | 'sitemap' | 'link' = isSeedPage
      ? 'seed'
      : discoveredByFor(norm, seedNormFinal, sitemapNorms);
    const t0 = Date.now();

    let html: string;
    let finalUrl: string;

    if (isSeedPage && startIndex === 0 && seedFetchCached?.ok) {
      html = seedFetchCached.html;
      finalUrl = seedFetchCached.finalUrl;
    } else if (isSeedPage) {
      if (crawlDelayMs > 0) {
        await sleep(crawlDelayMs);
      }
      const fr = await fetchHtmlPage(seedUrl);
      const fetchMs = Date.now() - t0;
      if (!fr.ok) {
        pagesErroredDelta += 1;
        await supabase.from('scan_pages').insert({
          run_id: runId,
          url: targetUrl,
          normalized_url: norm,
          parent_id: null,
          status: 'error',
          discovered_by: disc,
          fetch_ms: fetchMs,
          error_message: fr.reason,
          section,
        });
        continue;
      }
      html = fr.html;
      finalUrl = fr.finalUrl;
    } else {
      if (crawlDelayMs > 0) {
        await sleep(crawlDelayMs);
      }
      const fr = await fetchHtmlPage(targetUrl);
      const fetchMs = Date.now() - t0;
      if (!fr.ok) {
        pagesErroredDelta += 1;
        await supabase.from('scan_pages').insert({
          run_id: runId,
          url: targetUrl,
          normalized_url: norm,
          parent_id: null,
          status: 'error',
          discovered_by: disc,
          fetch_ms: fetchMs,
          error_message: fr.reason,
          section,
        });
        continue;
      }
      html = fr.html;
      finalUrl = fr.finalUrl;
    }

    const fetchMs = Date.now() - t0;
    const useLlm = llmRemaining;
    const output = await auditPageFromHtml(finalUrl, html, llm, {
      useLlm,
      robotsTxtContent: robotsTxtContent ?? '',
    });
    if (useLlm) {
      llmRemaining = false;
    }

    const { data: row, error: insOkErr } = await supabase
      .from('scan_pages')
      .insert({
        run_id: runId,
        url: finalUrl,
        normalized_url: norm,
        parent_id: null,
        status: 'fetched',
        discovered_by: disc,
        http_status: 200,
        fetch_ms: fetchMs,
        content_type: 'text/html',
        issues_json: output.issues,
        score: output.score,
        letter_grade: output.letterGrade,
        section,
      })
      .select('id')
      .single();

    if (insOkErr || !row?.id) {
      const msg = insOkErr?.message ?? 'insert_failed';
      if (insOkErr && String(insOkErr.code) === '23505') {
        structuredLog('deep_audit_page_duplicate_skip', { runId, norm: norm.slice(0, 80) });
        continue;
      }
      structuredLog('deep_audit_page_insert_failed', { runId, message: msg.slice(0, 120) });
      throw new Error(msg);
    }
  }

  return { pagesErroredDelta };
}

async function finalizeDeepCrawl(
  supabase: SupabaseClient,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly ordered: readonly string[];
    readonly crawlWallStart: number;
    readonly crawlDelayMs: number;
    readonly limit: number;
    readonly robotsStatus: number;
    readonly sitemapCount: number;
  }
): Promise<DeepAuditCrawlResult> {
  const { runId, seedUrl, ordered, crawlWallStart, crawlDelayMs, limit, robotsStatus, sitemapCount } = params;

  const { data: runMeta } = await supabase.from('scan_runs').select('started_at').eq('id', runId).maybeSingle();
  const startedMs = runMeta?.started_at ? new Date(runMeta.started_at).getTime() : crawlWallStart;
  const wallMs = Math.max(0, Date.now() - startedMs);

  const { data: pageRows } = await supabase
    .from('scan_pages')
    .select('score')
    .eq('run_id', runId)
    .eq('status', 'fetched');

  const scores = (pageRows ?? []).map((p) => p.score).filter((s): s is number => typeof s === 'number');
  const aggregateScore = averageScores(scores);

  const { count: errCount } = await supabase
    .from('scan_pages')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('status', 'error');

  const pagesErrored = errCount ?? 0;
  const completed = new Date().toISOString();

  const { error: doneErr } = await supabase
    .from('scan_runs')
    .update({
      completed_at: completed,
      coverage_summary: {
        pages_fetched: scores.length,
        pages_errored: pagesErrored,
        wall_time_ms: wallMs,
        crawl_delay_ms: crawlDelayMs,
        page_limit: limit,
        seed_url: seedUrl,
        robots_status: robotsStatus,
        sitemap_urls_considered: sitemapCount,
        urls_planned: ordered.length,
        chunked: true,
      },
    })
    .eq('id', runId);

  if (doneErr) {
    structuredLog('deep_audit_crawl_complete_failed', { runId, message: doneErr.message.slice(0, 120) });
    return { ok: false, reason: doneErr.message };
  }

  structuredLog('deep_audit_crawl_complete', {
    runId,
    wall_time_ms: wallMs,
    pages_fetched: scores.length,
    pages_errored: pagesErrored,
    crawl_delay_ms: crawlDelayMs,
  });

  const pagesOut: DeepCrawlPageSummary[] = [];
  return { ok: true, phase: 'complete', pages: pagesOut, aggregateScore };
}
