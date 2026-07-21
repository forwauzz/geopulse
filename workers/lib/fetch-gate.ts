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
  | {
      ok: true;
      text: string;
      finalUrl: string;
      status: number;
      contentType: string | null;
      /** Lower-cased response headers — needed by header-based checks (e.g. security headers). */
      headers: Record<string, string>;
    }
  | {
      ok: false;
      reason: string;
      /** HTTP status when a response arrived (lets callers distinguish WAF blocks from network failures). */
      status?: number;
      /** Response headers on failure — WAF/CDN markers (cf-mitigated, server) live here. */
      headers?: Record<string, string>;
    };

/** Response headers as a plain lower-cased map (Headers isn't structured-cloneable across layers). */
function toHeaderMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
  } catch {
    /* best effort */
  }
  return out;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'GEO-PulseBot/1.0 (+https://geopulse.io)';

// ── Self-fetch (fixes HTTP 525 when auditing our OWN domain) ─────────────────────
// A Cloudflare Worker fetching its own public hostname is routed to the zone origin (to avoid
// loops), whose SSL handshake fails → 525. For the Worker's own host we instead invoke the Worker
// directly through the WORKER_SELF_REFERENCE service binding. Registered per-request by the Worker
// entrypoint; only ever used for the exact self-host, so all other scans are unaffected.
type SelfFetcher = { host: string; fetch: (url: string) => Promise<Response> };
let selfFetcher: SelfFetcher | null = null;

export function registerSelfFetch(host: string | null | undefined, fn: ((url: string) => Promise<Response>) | null): void {
  const clean = host?.trim().replace(/^www\./i, '').toLowerCase();
  selfFetcher = clean && fn ? { host: clean, fetch: fn } : null;
}

function matchSelfFetch(rawUrl: string): SelfFetcher | null {
  if (!selfFetcher) return null;
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase() === selfFetcher.host ? selfFetcher : null;
  } catch {
    return null;
  }
}

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

  // Own domain → invoke the Worker directly (bypasses the edge→origin 525). Safe: it's our host.
  // MUST be time-bounded: an unbounded await on a self-call hung the entire cron invocation
  // for hours (the 2026-07-21 recurring-audit starvation) — on timeout we fall through to
  // the normal path, which fails fast and lets the caller degrade.
  const self = matchSelfFetch(rawUrl);
  if (self) {
    let selfTimer: ReturnType<typeof setTimeout> | undefined;
    const selfTimeout = new Promise<never>((_, reject) => {
      selfTimer = setTimeout(() => reject(new Error('self_fetch_timeout')), timeoutMs);
    });
    // The race loser must never become an unhandled rejection (fatal in Workers).
    selfTimeout.catch(() => {});
    try {
      const res = await Promise.race([self.fetch(rawUrl), selfTimeout]);
      if (!res.ok) return { ok: false, reason: `Target returned HTTP ${String(res.status)}` };
      const ctype = res.headers.get('Content-Type');
      const text = await readTextWithByteLimit(res, options.maxBytes);
      return {
        ok: true,
        text,
        finalUrl: rawUrl,
        status: res.status,
        contentType: ctype,
        headers: toHeaderMap(res.headers),
      };
    } catch {
      // Self-fetch unavailable or timed out — fall through to the normal (validated) path.
    } finally {
      clearTimeout(selfTimer);
    }
  }

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
      return {
        ok: false,
        reason: `Target returned HTTP ${String(res.status)}`,
        status: res.status,
        headers: toHeaderMap(res.headers),
      };
    }

    const text = await readTextWithByteLimit(res, options.maxBytes);

    if (!extractDomain(currentUrl)) {
      return { ok: false, reason: 'Could not determine domain' };
    }

    return {
      ok: true,
      text,
      finalUrl: currentUrl,
      status: res.status,
      contentType: ctype,
      headers: toHeaderMap(res.headers),
    };
  }

  return { ok: false, reason: 'Too many redirects' };
}

export type FetchGateBytesResult =
  | {
      ok: true;
      bytes: Uint8Array;
      finalUrl: string;
      status: number;
      contentType: string | null;
    }
  | { ok: false; reason: string };

export type FetchGateBytesOptions = {
  /** Hard cap — a body that exceeds it FAILS the fetch rather than being truncated. */
  readonly maxBytes: number;
  readonly timeoutMs?: number;
  readonly acceptHeader: string;
};

/**
 * Read the full body, failing when it exceeds `maxBytes`.
 *
 * Unlike {@link readTextWithByteLimit} this never truncates: a cut-off HTML page still parses, but
 * a cut-off image is a corrupt file — and for binary fetches the cap is a rejection of oversized
 * payloads, not a trim.
 */
async function readBytesWithByteCap(
  res: Response,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return { ok: false };
    return { ok: true, bytes: new Uint8Array(buf) };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return { ok: true, bytes: merged };
}

/**
 * BINARY variant of {@link fetchGateText} — same URL validation and manual redirect handling,
 * returning raw bytes. Exists so image fetches (e.g. a customer logo referenced from their own
 * HTML) go through the gate instead of a raw `fetch`; the URL is attacker-influencable, so it gets
 * the same SSRF treatment as every other engine fetch.
 *
 * Content-Type is reported but never enforced here — it is attacker-controlled. Callers must
 * validate the bytes themselves (magic bytes, e.g. `detectImageType`).
 */
export async function fetchGateBytes(
  rawUrl: string,
  options: FetchGateBytesOptions
): Promise<FetchGateBytesResult> {
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

    if (!res.ok) {
      return { ok: false, reason: `Target returned HTTP ${String(res.status)}` };
    }

    // Reject early on a declared oversize body; the stream cap below is the real enforcement.
    const declared = Number(res.headers.get('Content-Length') ?? '');
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      return { ok: false, reason: 'Response exceeds the size limit' };
    }

    const body = await readBytesWithByteCap(res, options.maxBytes);
    if (!body.ok) {
      return { ok: false, reason: 'Response exceeds the size limit' };
    }

    return {
      ok: true,
      bytes: body.bytes,
      finalUrl: currentUrl,
      status: res.status,
      contentType: res.headers.get('Content-Type'),
    };
  }

  return { ok: false, reason: 'Too many redirects' };
}

/**
 * HTML page fetch (same caps as legacy `fetch-page.ts` for free tier).
 */
export async function fetchHtmlPage(rawUrl: string): Promise<
  | { ok: true; html: string; finalUrl: string; headers: Record<string, string> }
  | { ok: false; reason: string; status?: number; headers?: Record<string, string> }
> {
  const r = await fetchGateText(rawUrl, {
    maxBytes: 750_000,
    timeoutMs: 10_000,
    acceptHeader: 'text/html,application/xhtml+xml',
    requireContentTypes: ['text/html', 'application/xhtml'],
  });
  if (!r.ok) return r;
  return { ok: true, html: r.text, finalUrl: r.finalUrl, headers: r.headers };
}
