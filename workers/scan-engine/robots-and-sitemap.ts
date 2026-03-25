/**
 * robots.txt + sitemap.xml discovery helpers (DA-002). Conservative parsing; no external deps.
 */

import { fetchGateText } from '../lib/fetch-gate';

export type RobotsParseResult = {
  readonly disallows: readonly string[];
  readonly sitemapUrls: readonly string[];
  /** Seconds from `Crawl-delay:` for `User-agent: *` (or global block); null if absent. */
  readonly crawlDelaySeconds: number | null;
};

/** Cap crawl-delay to avoid Worker wall-clock blowups (DA-004 politeness). */
export function crawlDelayMsFromRobotsSeconds(seconds: number | null, maxMs = 10_000): number {
  if (seconds == null || seconds <= 0) return 0;
  return Math.min(Math.round(seconds * 1000), maxMs);
}

/**
 * Parse robots.txt body: `User-agent: *` Disallow rules + `Sitemap:` lines.
 * Lines before any `User-agent:` are treated as global (common legacy pattern).
 */
export function parseRobotsTxt(text: string): RobotsParseResult {
  const disallows: string[] = [];
  const sitemapUrls: string[] = [];
  let crawlDelaySeconds: number | null = null;
  let mode: 'none' | 'star' | 'other' = 'none';

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      const agent = ua[1]?.trim().toLowerCase() ?? '';
      mode = agent === '*' ? 'star' : 'other';
      continue;
    }

    const sm = /^sitemap:\s*(.+)$/i.exec(line);
    if (sm) {
      const u = sm[1]?.trim();
      if (u) sitemapUrls.push(u);
      continue;
    }

    const cd = /^crawl-delay:\s*(\d+(?:\.\d+)?)\s*$/i.exec(line);
    if (cd && (mode === 'star' || mode === 'none')) {
      const n = Number(cd[1]);
      if (!Number.isNaN(n) && n >= 0) {
        crawlDelaySeconds = Math.min(n, 60);
      }
      continue;
    }

    const dis = /^disallow:\s*(.*)$/i.exec(line);
    if (dis && (mode === 'star' || mode === 'none')) {
      disallows.push(dis[1]?.trim() ?? '');
    }
  }

  return { disallows, sitemapUrls, crawlDelaySeconds };
}

/**
 * True if `pathname` is allowed (not matched by a non-empty Disallow prefix).
 */
export function isPathAllowedByRobots(pathname: string, disallows: readonly string[]): boolean {
  const path = pathname === '' ? '/' : pathname;
  for (const d of disallows) {
    if (!d) continue;
    if (d === '/') return false;
    if (path.startsWith(d)) return false;
  }
  return true;
}

const LOC_RE = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;

/**
 * Extract `<loc>` URLs from sitemap XML (bounded by caller via fetch maxBytes).
 */
export function parseSitemapLocs(xml: string, maxUrls: number): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LOC_RE.source, LOC_RE.flags);
  while ((m = re.exec(xml)) !== null && out.length < maxUrls) {
    const u = m[1]?.trim();
    if (u) out.push(u);
  }
  return out;
}

export async function fetchRobotsTxt(originBase: string): Promise<
  | { ok: true; text: string; status: number }
  | { ok: false; reason: string }
> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL('/robots.txt', originBase).toString();
  } catch {
    return { ok: false, reason: 'invalid_origin' };
  }

  const r = await fetchGateText(robotsUrl, {
    maxBytes: 512_000,
    timeoutMs: 10_000,
    acceptHeader: 'text/plain,text/html,*/*',
  });

  if (!r.ok) {
    if (r.reason.includes('HTTP 404')) {
      return { ok: true, text: '', status: 404 };
    }
    if (r.reason.includes('HTTP 403')) {
      return { ok: true, text: '', status: 403 };
    }
    return { ok: false, reason: r.reason };
  }

  return { ok: true, text: r.text, status: r.status };
}

export async function fetchSitemapXml(
  sitemapUrl: string,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const r = await fetchGateText(sitemapUrl, {
    maxBytes,
    timeoutMs: 15_000,
    acceptHeader: 'application/xml,text/xml,text/plain,*/*',
  });
  if (!r.ok) return r;
  return { ok: true, text: r.text };
}
