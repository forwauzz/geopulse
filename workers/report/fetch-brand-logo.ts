/**
 * Fetch a customer logo referenced from their own HTML.
 *
 * The URL comes out of scanned page markup (`Organization.logo`, apple-touch-icon, …), which makes
 * it attacker-influencable: a crafted page could point it at an internal address. So the download
 * goes through the fetch gate (same SSRF validation and manual redirect handling as every engine
 * fetch), is hard-capped at {@link MAX_LOGO_BYTES}, and is accepted only when the magic bytes say
 * PNG or JPEG — Content-Type is the server's claim, not evidence.
 */
import { fetchGateBytes } from '../lib/fetch-gate';
import { detectImageType, MAX_LOGO_BYTES } from '../scan-engine/parse-brand-signals';

export type BrandLogoFetchResult =
  | { ok: true; bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; finalUrl: string }
  | { ok: false; reason: string };

export async function fetchBrandLogo(rawUrl: string): Promise<BrandLogoFetchResult> {
  const r = await fetchGateBytes(rawUrl, {
    maxBytes: MAX_LOGO_BYTES,
    timeoutMs: 10_000,
    acceptHeader: 'image/png,image/jpeg',
  });
  if (!r.ok) return r;

  const mime = detectImageType(r.bytes);
  if (!mime) return { ok: false, reason: 'URL did not return a PNG or JPEG image' };

  return { ok: true, bytes: r.bytes, mime, finalUrl: r.finalUrl };
}
