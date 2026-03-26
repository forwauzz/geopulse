/**
 * Single source of truth for deep-audit page caps (must stay aligned with `workers/scan-engine/deep-audit-crawl.ts` usage).
 */
export const MAX_DEEP_AUDIT_PAGE_LIMIT = 120;

const FALLBACK_DEFAULT = 10;

/**
 * Parses `DEEP_AUDIT_DEFAULT_PAGE_LIMIT` from Worker / Next env (plaintext var). Invalid or empty → 10, capped at {@link MAX_DEEP_AUDIT_PAGE_LIMIT}.
 */
export function resolveDefaultDeepAuditPageLimit(envRaw: string | undefined): number {
  const raw = (envRaw ?? '').trim();
  if (!raw) return FALLBACK_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return FALLBACK_DEFAULT;
  return Math.min(n, MAX_DEEP_AUDIT_PAGE_LIMIT);
}
