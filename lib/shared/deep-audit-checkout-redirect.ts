export type DeepAuditCheckoutRedirect =
  | { kind: 'replace'; href: string }
  | { kind: 'assign'; href: string };

export function resolveDeepAuditCheckoutRedirect(
  targetUrl: string,
  currentOrigin: string
): DeepAuditCheckoutRedirect {
  const nextUrl = new URL(targetUrl, currentOrigin);
  if (nextUrl.origin === currentOrigin) {
    return {
      kind: 'replace',
      href: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
    };
  }
  return { kind: 'assign', href: nextUrl.toString() };
}
