/**
 * Normalize email (lowercase + trim) then produce full SHA-256 hex (64 chars).
 * Uses Web Crypto API — works in both Workers and Node 20+.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function hashEmailSha256(raw: string): Promise<string> {
  const normalized = normalizeEmail(raw);
  const encoded = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SOURCE_ALIASES: Record<string, string> = {
  'x.com': 'x',
  'twitter.com': 'x',
  twitter: 'x',
  'lnkd.in': 'linkedin',
  'linkedin.com': 'linkedin',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  't.co': 'x',
};

export function canonicalizeSource(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SOURCE_ALIASES[key] ?? key;
}
