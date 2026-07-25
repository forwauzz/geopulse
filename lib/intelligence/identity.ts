export const IDENTITY_NORMALIZATION_VERSION = 'domain-page-v1';

export type NormalizedDomain = {
  readonly normalizedHost: string;
  readonly observedHost: string;
  readonly normalizationVersion: typeof IDENTITY_NORMALIZATION_VERSION;
};

export type NormalizedPage = {
  readonly normalizedUrl: string;
  readonly originalUrl: string;
  readonly normalizedHost: string;
  readonly normalizationVersion: typeof IDENTITY_NORMALIZATION_VERSION;
};

export type IdentityNormalizationFailure =
  | 'empty_identity'
  | 'invalid_url'
  | 'unsupported_protocol'
  | 'host_missing'
  | 'ip_address'
  | 'localhost';

export type IdentityNormalizationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: IdentityNormalizationFailure };

function asUrl(input: string): URL | null {
  const value = input.trim();
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function normalizedHost(url: URL): IdentityNormalizationResult<NormalizedDomain> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  const observedHost = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!observedHost) return { ok: false, reason: 'host_missing' };
  if (observedHost === 'localhost' || observedHost.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost' };
  }
  if (isIpAddress(observedHost)) return { ok: false, reason: 'ip_address' };

  const host = observedHost.startsWith('www.') ? observedHost.slice(4) : observedHost;
  return {
    ok: true,
    value: {
      normalizedHost: host,
      observedHost,
      normalizationVersion: IDENTITY_NORMALIZATION_VERSION,
    },
  };
}

export function normalizeDomainIdentity(
  input: string | null | undefined
): IdentityNormalizationResult<NormalizedDomain> {
  if (!input?.trim()) return { ok: false, reason: 'empty_identity' };
  const url = asUrl(input);
  if (!url) return { ok: false, reason: 'invalid_url' };
  return normalizedHost(url);
}

export function normalizePageIdentity(
  input: string | null | undefined
): IdentityNormalizationResult<NormalizedPage> {
  if (!input?.trim()) return { ok: false, reason: 'empty_identity' };
  const url = asUrl(input);
  if (!url) return { ok: false, reason: 'invalid_url' };
  const domain = normalizedHost(url);
  if (!domain.ok) return domain;

  url.protocol = 'https:';
  url.hostname = domain.value.normalizedHost;
  url.hash = '';
  url.username = '';
  url.password = '';
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
  const query = [...url.searchParams.entries()].sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b)
  );
  url.search = '';
  for (const [key, value] of query) url.searchParams.append(key, value);

  return {
    ok: true,
    value: {
      normalizedUrl: url.toString(),
      originalUrl: input.trim(),
      normalizedHost: domain.value.normalizedHost,
      normalizationVersion: IDENTITY_NORMALIZATION_VERSION,
    },
  };
}

export type IdentityCandidate = {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceTable: string;
  readonly domainInput?: string | null;
  readonly pageInput?: string | null;
  readonly ownerType?: 'startup_workspace' | 'agency_account' | 'agency_client' | 'user' | 'internal_benchmark';
  readonly ownerId?: string | null;
};

export type IdentityPlan =
  | {
      readonly status: 'mapped';
      readonly candidate: IdentityCandidate;
      readonly domain: NormalizedDomain;
      readonly page: NormalizedPage | null;
    }
  | {
      readonly status: 'unmapped';
      readonly candidate: IdentityCandidate;
      readonly reason: IdentityNormalizationFailure;
    };

export function planIdentity(candidate: IdentityCandidate): IdentityPlan {
  const page = candidate.pageInput ? normalizePageIdentity(candidate.pageInput) : null;
  const domain = normalizeDomainIdentity(
    candidate.domainInput ?? (page?.ok ? page.value.normalizedHost : candidate.pageInput)
  );
  if (!domain.ok) return { status: 'unmapped', candidate, reason: domain.reason };
  return {
    status: 'mapped',
    candidate,
    domain: domain.value,
    page: page?.ok ? page.value : null,
  };
}

export function findIdentityCollisions(plans: readonly IdentityPlan[]): ReadonlyMap<string, readonly string[]> {
  const observedHostsByCanonicalHost = new Map<string, Set<string>>();
  for (const plan of plans) {
    if (plan.status !== 'mapped') continue;
    const entries = observedHostsByCanonicalHost.get(plan.domain.normalizedHost) ?? new Set<string>();
    entries.add(plan.domain.observedHost);
    observedHostsByCanonicalHost.set(plan.domain.normalizedHost, entries);
  }
  return new Map(
    [...observedHostsByCanonicalHost.entries()]
      .filter(([, observedHosts]) => observedHosts.size > 1)
      .map(([host, observedHosts]) => [host, [...observedHosts].sort()])
  );
}
