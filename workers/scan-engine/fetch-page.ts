/**
 * Fetch target page with SSRF validation and manual redirect handling.
 */
import { extractDomain, validateRedirect, validateUrl } from '../lib/ssrf';

export type FetchPageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string };

const MAX_BYTES = 750_000;
const FETCH_TIMEOUT_MS = 10_000;

function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const ctype = contentType?.toLowerCase() ?? '';
  if (ctype.includes('charset=utf-8') || ctype.includes('utf8')) {
    return new TextDecoder('utf-8').decode(buffer);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

export async function fetchPage(rawUrl: string): Promise<FetchPageResult> {
  const v = await validateUrl(rawUrl);
  if (!v.ok) return { ok: false, reason: v.reason };

  let currentUrl = v.safeUrl;
  let redirectCount = 0;

  while (redirectCount <= 3) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          'User-Agent': 'GEO-PulseBot/1.0 (+https://geopulse.io)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch {
      clearTimeout(t);
      return { ok: false, reason: 'Failed to fetch URL (timeout or network error)' };
    }
    clearTimeout(t);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      const next = await validateRedirect(loc, currentUrl, redirectCount);
      if (!next.ok) return { ok: false, reason: next.reason };
      currentUrl = next.safeUrl;
      redirectCount += 1;
      continue;
    }

    if (!res.ok) {
      return { ok: false, reason: `Target returned HTTP ${String(res.status)}` };
    }

    const ctype = res.headers.get('Content-Type');
    if (ctype && !ctype.includes('text/html') && !ctype.includes('application/xhtml')) {
      return { ok: false, reason: 'URL did not return HTML content' };
    }

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    const html = decodeBody(slice, ctype);

    if (!extractDomain(currentUrl)) {
      return { ok: false, reason: 'Could not determine domain' };
    }

    return { ok: true, html, finalUrl: currentUrl };
  }

  return { ok: false, reason: 'Too many redirects' };
}
