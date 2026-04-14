/**
 * CVE-2025-29927 defense: reject forged internal middleware headers.
 * Extracted for unit tests; keep in sync with `middleware.ts`.
 */
export function shouldRejectForMiddlewareSubrequest(headers: Headers): boolean {
  return headers.has('x-middleware-subrequest');
}
