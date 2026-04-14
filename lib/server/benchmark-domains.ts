export type BenchmarkDomainIdentity = {
  readonly domain: string | null;
  readonly canonicalDomain: string | null;
  readonly siteUrl: string | null;
};

function cleanHostLikeValue(raw: string): string {
  const withoutProtocol = raw.trim().replace(/^https?:\/\//i, '').replace(/^\/+/, '');
  const firstSegment = withoutProtocol.split('/')[0] ?? '';
  const withoutQuery = firstSegment.split('?')[0] ?? '';
  const withoutHash = withoutQuery.split('#')[0] ?? '';
  return withoutHash.toLowerCase();
}

export function normalizeBenchmarkSiteUrl(siteUrl: string | null | undefined): string | null {
  const raw = siteUrl?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}

export function normalizeBenchmarkDomainValue(
  rawDomain: string | null | undefined
): string | null {
  const raw = rawDomain?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    const host = cleanHostLikeValue(raw);
    return host || null;
  }
}

export function toCanonicalBenchmarkDomain(
  rawDomain: string | null | undefined
): string | null {
  const normalized = normalizeBenchmarkDomainValue(rawDomain);
  if (!normalized) return null;
  return normalized.replace(/^www\./i, '');
}

export function deriveBenchmarkDomainIdentity(
  siteUrl: string | null | undefined,
  fallbackDomain?: string | null | undefined
): BenchmarkDomainIdentity {
  const normalizedSiteUrl = normalizeBenchmarkSiteUrl(siteUrl);
  const domain =
    normalizeBenchmarkDomainValue(fallbackDomain) ??
    normalizeBenchmarkDomainValue(normalizedSiteUrl);
  const canonicalDomain = toCanonicalBenchmarkDomain(domain);

  return {
    domain,
    canonicalDomain,
    siteUrl: normalizedSiteUrl,
  };
}
