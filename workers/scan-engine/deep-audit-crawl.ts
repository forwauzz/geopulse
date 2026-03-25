/**
 * Multi-page deep audit: robots + sitemap discovery, section-aware URL cap (DA-001 + DA-002).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMProvider } from '../lib/interfaces/providers';
import { fetchHtmlPage } from '../lib/fetch-gate';
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

/**
 * Run bounded same-origin crawl, persist scan_pages rows, update scan_runs timestamps.
 */
export async function runDeepAuditCrawl(
  supabase: SupabaseClient,
  llm: LLMProvider,
  params: {
    readonly runId: string;
    readonly seedUrl: string;
    readonly pageLimit: number;
  }
): Promise<
  | { ok: true; pages: readonly DeepCrawlPageSummary[]; aggregateScore: number }
  | { ok: false; reason: string }
> {
  const { runId, seedUrl, pageLimit } = params;
  const limit = Math.max(1, Math.min(pageLimit, 50));
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

  const pagesOut: DeepCrawlPageSummary[] = [];
  let fetchedCount = 0;

  for (const targetUrl of ordered) {
    const norm = normalizeUrlKey(targetUrl);
    if (!norm) continue;

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
    if (isSeedPage) {
      html = seedFetch.html;
      finalUrl = seedFetch.finalUrl;
    } else {
      if (crawlDelayMs > 0) {
        await sleep(crawlDelayMs);
      }
      const fr = await fetchHtmlPage(targetUrl);
      const fetchMs = Date.now() - t0;
      if (!fr.ok) {
        pagesErrored += 1;
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
    const useLlm = fetchedCount === 0;
    const output = await auditPageFromHtml(finalUrl, html, llm, { useLlm });
    fetchedCount += 1;

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
      structuredLog('deep_audit_page_insert_failed', { runId, message: msg.slice(0, 120) });
      return { ok: false, reason: msg };
    }

    pagesOut.push({
      url: finalUrl,
      normalizedUrl: norm,
      score: output.score,
      letterGrade: output.letterGrade,
      issuesJson: output.issues,
    });
  }

  const scores = pagesOut.map((p) => p.score).filter((s): s is number => typeof s === 'number');
  const aggregateScore = averageScores(scores);

  const completed = new Date().toISOString();
  const wallMs = Date.now() - crawlWallStart;
  const { error: doneErr } = await supabase
    .from('scan_runs')
    .update({
      completed_at: completed,
      coverage_summary: {
        pages_fetched: pagesOut.length,
        pages_errored: pagesErrored,
        wall_time_ms: wallMs,
        crawl_delay_ms: crawlDelayMs,
        page_limit: limit,
        seed_url: seedUrl,
        robots_status: robotsRes.status,
        sitemap_urls_considered: smList.length,
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
    pages_fetched: pagesOut.length,
    pages_errored: pagesErrored,
    crawl_delay_ms: crawlDelayMs,
  });

  return { ok: true, pages: pagesOut, aggregateScore };
}
