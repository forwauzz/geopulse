/**
 * Turnstile site keys must be real keys from the Cloudflare dashboard.
 * `wrangler.jsonc` may use a placeholder; loading the widget with it causes client error 400020 (invalid sitekey).
 */
const PLACEHOLDER_TURNSTILE_SITE_KEY = 'your-turnstile-site-key';

export function getTurnstileSiteKey(): string {
  const raw = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === PLACEHOLDER_TURNSTILE_SITE_KEY) {
    return '';
  }
  return trimmed;
}
