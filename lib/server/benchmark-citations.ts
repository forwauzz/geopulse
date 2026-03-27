import type { BenchmarkDomainRow } from './benchmark-repository';

export type ParsedBenchmarkCitation = {
  readonly citedDomain: string | null;
  readonly citedUrl: string | null;
  readonly citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention';
  readonly rankPosition: number | null;
  readonly confidence: number | null;
  readonly metadata?: Record<string, unknown>;
};

function normalizeUrl(raw: string): string | null {
  const cleaned = raw.trim().replace(/[),.;!?]+$/g, '');
  if (!cleaned) return null;

  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

function toCanonicalDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./i, '');
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./i, '');
  }
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueAliases(domain: BenchmarkDomainRow): string[] {
  const metadataAliases = Array.isArray(domain.metadata['brand_aliases'])
    ? (domain.metadata['brand_aliases'] as unknown[])
    : [];

  return Array.from(
    new Set(
      [domain.display_name, ...metadataAliases]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length >= 4)
    )
  );
}

export function parseBenchmarkCitations(
  responseText: string,
  domain: BenchmarkDomainRow
): ParsedBenchmarkCitation[] {
  const citations: ParsedBenchmarkCitation[] = [];
  const seenUrls = new Set<string>();
  const seenDomains = new Set<string>();
  let rankPosition = 1;

  const urlRegex = /https?:\/\/[^\s<>"'`]+/gi;
  for (const match of responseText.matchAll(urlRegex)) {
    const normalizedUrl = normalizeUrl(match[0]);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;

    const citedDomain = toCanonicalDomain(normalizedUrl);
    if (citedDomain) seenDomains.add(citedDomain);
    seenUrls.add(normalizedUrl);

    citations.push({
      citedDomain,
      citedUrl: normalizedUrl,
      citationType: 'explicit_url',
      rankPosition,
      confidence: 1,
      metadata: { match_type: 'url' },
    });
    rankPosition += 1;
  }

  const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
  for (const match of responseText.matchAll(domainRegex)) {
    const normalizedDomain = toCanonicalDomain(match[0]);
    if (!normalizedDomain || seenDomains.has(normalizedDomain)) continue;
    seenDomains.add(normalizedDomain);

    citations.push({
      citedDomain: normalizedDomain,
      citedUrl: null,
      citationType: 'explicit_domain',
      rankPosition,
      confidence: 0.8,
      metadata: { match_type: 'domain' },
    });
    rankPosition += 1;
  }

  if (!seenDomains.has(domain.canonical_domain)) {
    for (const alias of uniqueAliases(domain)) {
      const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      if (!aliasRegex.test(responseText)) continue;

      seenDomains.add(domain.canonical_domain);
      citations.push({
        citedDomain: domain.canonical_domain,
        citedUrl: null,
        citationType: 'brand_mention',
        rankPosition,
        confidence: 0.6,
        metadata: { match_type: 'brand_mention', alias },
      });
      break;
    }
  }

  return citations;
}
