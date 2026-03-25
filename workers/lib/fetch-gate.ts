/**
 * Central outbound fetch for the scan engine — all page/robots/sitemap fetches go through here (DA-002).
 */
import {
  ENGINE_FETCH_MAX_REDIRECTS,
  extractDomain,
  validateEngineFetchUrl,
  validateEngineRedirect,
} from './ssrf';

export type FetchGateTextResult =
  | { ok: true; text: string; finalUrl: string; status: number; contentType: string | null }
  | { ok: false; reason: string };

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'GEO-PulseBot/1.0 (+https://geopulse.io)';

async function readTextWithByteLimit(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    return new TextDecoder('utf-8', { fatal: false }).decode(slice);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export type FetchGateTextOptions = {
  readonly maxBytes: number;
  readonly timeoutMs?: number;
  readonly acceptHeader: string;
  /** If set, failure response when Content-Type does not match (e.g. HTML-only fetches). */
  readonly requireContentTypes?: readonly string[];
};

/**
 * GET with manual redirects (validated), response body capped by `maxBytes` (stream-safe).
 */
export async function fetchGateText(
  rawUrl: string,
  options: FetchGateTextOptions
): Promise<FetchGateTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const v = await validateEngineFetchUrl(rawUrl);
  if (!v.ok) return { ok: false, reason: v.reason };

  let currentUrl = v.safeUrl;
  let redirectCount = 0;

  while (redirectCount <= ENGINE_FETCH_MAX_REDIRECTS) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: options.acceptHeader,
        },
      });
    } catch {
      clearTimeout(t);
      return { ok: false, reason: 'Failed to fetch URL (timeout or network error)' };
    }
    clearTimeout(t);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      const next = await validateEngineRedirect(loc, currentUrl, redirectCount);
      if (!next.ok) return { ok: false, reason: next.reason };
      currentUrl = next.safeUrl;
      redirectCount += 1;
      continue;
    }

    const ctype = res.headers.get('Content-Type');
    if (options.requireContentTypes && options.requireContentTypes.length > 0) {
      const lower = ctype?.toLowerCase() ?? '';
      if (lower) {
        const okCt = options.requireContentTypes.some((c) => lower.includes(c.toLowerCase()));
        if (!okCt && res.ok) {
          return { ok: false, reason: 'URL did not return an allowed content type' };
        }
      }
    }

    if (!res.ok) {
      return { ok: false, reason: `Target returned HTTP ${String(res.status)}` };
    }

    const text = await readTextWithByteLimit(res, options.maxBytes);

    if (!extractDomain(currentUrl)) {
      return { ok: false, reason: 'Could not determine domain' };
    }

    return { ok: true, text, finalUrl: currentUrl, status: res.status, contentType: ctype };
  }

  return { ok: false, reason: 'Too many redirects' };
}

/**
 * HTML page fetch (same caps as legacy `fetch-page.ts` for free tier).
 */
export async function fetchHtmlPage(rawUrl: string): Promise<
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string }
> {
  const r = await fetchGateText(rawUrl, {
    maxBytes: 750_000,
    timeoutMs: 10_000,
    acceptHeader: 'text/html,application/xhtml+xml',
    requireContentTypes: ['text/html', 'application/xhtml'],
  });
  if (!r.ok) return r;
  return { ok: true, html: r.text, finalUrl: r.finalUrl };
}
