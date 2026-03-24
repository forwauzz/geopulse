/**
 * SSRF Prevention Utility
 * GEO-Pulse — workers/lib/ssrf.ts
 *
 * Users submit URLs that the scan engine fetches. This is a classic Server-Side
 * Request Forgery (SSRF) vector. This module is the single source of truth for
 * URL validation. NEVER write inline URL validation — always import from here.
 *
 * Cloudflare Workers do not expose a DNS resolution API, so we rely on:
 * 1. Hostname parsing and blocklist matching
 * 2. Scheme validation
 * 3. Setting redirect: 'manual' and re-validating redirect targets
 *
 * Usage:
 *   const validation = await validateUrl(userInput);
 *   if (!validation.ok) return new Response(validation.reason, { status: 400 });
 *   const res = await fetch(validation.safeUrl, { redirect: 'manual' });
 */

export type UrlValidationResult =
  | { ok: true; safeUrl: string }
  | { ok: false; reason: string };

/**
 * Private IP ranges to block (SSRF protection)
 * Covers: loopback, private class A/B/C, link-local, APIPA, cloud metadata
 */
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8 loopback
  /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8 private class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12 private class B
  /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16 private class C
  /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16 link-local / AWS metadata
  /^::1$/, // IPv6 loopback
  /^fc[0-9a-f]{2}:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
  /^0\.0\.0\.0$/, // unspecified
  /^metadata\.google\.internal$/i, // GCP metadata
  /^metadata\.azure\.internal$/i, // Azure metadata
];

/**
 * Blocked TLDs and internal hostnames
 */
const BLOCKED_TLDS = new Set(['.local', '.internal', '.corp', '.home', '.lan']);

/**
 * Maximum URL length to prevent abuse
 */
const MAX_URL_LENGTH = 2048;

/**
 * Validate a user-submitted URL before fetching.
 * Returns a discriminated union: { ok: true, safeUrl } or { ok: false, reason }
 */
export async function validateUrl(rawUrl: string): Promise<UrlValidationResult> {
  // 1. Length check
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'URL is empty or exceeds maximum length' };
  }

  // 2. Parse and validate URL structure
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  // 3. Scheme must be https only
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are supported' };
  }

  // 4. No credentials in URL
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URLs with credentials are not allowed' };
  }

  // 5. No unusual ports (only 443 or default)
  if (parsed.port && parsed.port !== '443') {
    return { ok: false, reason: 'Non-standard ports are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 6. Check against private IP patterns
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { ok: false, reason: 'Internal or private addresses are not allowed' };
    }
  }

  // 7. Check for blocked TLDs (.local, .internal, etc.)
  for (const tld of BLOCKED_TLDS) {
    if (hostname.endsWith(tld)) {
      return { ok: false, reason: 'Internal network hostnames are not allowed' };
    }
  }

  // 8. Block IP address literals (only allow domain names)
  // IPv4 literal check
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (ipv4Pattern.test(hostname)) {
    return { ok: false, reason: 'IP address literals are not allowed — use a domain name' };
  }

  // IPv6 literal check (appears in brackets in URLs)
  if (hostname.startsWith('[')) {
    return { ok: false, reason: 'IPv6 address literals are not allowed' };
  }

  // 9. Hostname must have at least one dot (prevents single-label hostnames)
  if (!hostname.includes('.')) {
    return { ok: false, reason: 'Single-label hostnames are not allowed' };
  }

  // 10. Return the canonicalized URL (strip any fragment, normalize)
  const safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;

  return { ok: true, safeUrl };
}

/**
 * Validate a redirect target URL returned in a Location header.
 * Use this when fetch() returns a 3xx response with redirect: 'manual'.
 *
 * Usage:
 *   const res = await fetch(url, { redirect: 'manual' });
 *   if (res.status >= 300 && res.status < 400) {
 *     const location = res.headers.get('Location');
 *     const redirectValidation = await validateRedirect(location, originalUrl);
 *     if (!redirectValidation.ok) throw new Error(redirectValidation.reason);
 *     // Follow redirect manually with validated URL
 *   }
 */
export async function validateRedirect(
  locationHeader: string | null,
  originalUrl: string,
  redirectCount = 0
): Promise<UrlValidationResult> {
  const MAX_REDIRECTS = 3;

  if (redirectCount >= MAX_REDIRECTS) {
    return { ok: false, reason: 'Too many redirects' };
  }

  if (!locationHeader) {
    return { ok: false, reason: 'Empty redirect location' };
  }

  // Handle relative redirects by resolving against original URL
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(locationHeader, originalUrl).toString();
  } catch {
    return { ok: false, reason: 'Invalid redirect URL' };
  }

  // Re-validate the redirect target through the full validation pipeline
  return validateUrl(absoluteUrl);
}

/**
 * Extract the primary domain from a URL for display and storage.
 * e.g. "https://www.example.com/path" -> "example.com"
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // Remove www. prefix for display
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
