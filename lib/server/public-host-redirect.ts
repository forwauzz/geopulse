const CANONICAL_PUBLIC_HOST = 'getgeopulse.com';
const LEGACY_PUBLIC_HOST = 'www.getgeopulse.com';

/**
 * Consolidate the one known public host alias without affecting previews, local development,
 * customer domains, or internal Worker service-binding requests.
 */
export function resolvePublicHostRedirect(requestUrl: string): URL | null {
  const url = new URL(requestUrl);
  if (url.hostname.toLowerCase() !== LEGACY_PUBLIC_HOST) return null;

  url.protocol = 'https:';
  url.hostname = CANONICAL_PUBLIC_HOST;
  url.port = '';
  return url;
}
