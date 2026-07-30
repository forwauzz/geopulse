const PRODUCT_SURFACE_PREFIXES = [
  '/admin',
  '/dashboard',
  '/results',
  '/share',
  '/client-summary',
  '/visibility-scorecard',
  '/dev',
] as const;

/**
 * Public pages share the editorial marketing system. Product surfaces keep their
 * denser application chrome and respect the user's selected light/dark theme.
 */
export function isPublicSiteRoute(pathname: string): boolean {
  return !PRODUCT_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
