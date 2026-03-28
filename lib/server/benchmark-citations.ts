import type { BenchmarkGroundingContext } from './benchmark-grounding';
import type { BenchmarkDomainRow } from './benchmark-repository';

export type ParsedBenchmarkCitation = {
  readonly citedDomain: string | null;
  readonly citedUrl: string | null;
  readonly citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention';
  readonly rankPosition: number | null;
  readonly confidence: number | null;
  readonly metadata?: Record<string, unknown>;
};

export type BenchmarkCitationGroundingMatch = {
  readonly groundingEvidenceId: string;
  readonly groundingPageUrl: string;
  readonly groundingPageType: string | null;
  readonly provenanceMatchMethod: 'exact_url' | 'normalized_page';
  readonly provenanceConfidence: 1 | 0.9;
};

export type BenchmarkClaimEvidenceMatch = {
  readonly status: 'supported_overlap' | 'weak_overlap' | 'no_overlap' | 'unavailable';
  readonly claimText: string | null;
  readonly overlapTokenCount: number;
  readonly claimTokenCount: number;
  readonly evidenceTokenCount: number;
  readonly overlapRatio: number;
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

function normalizeComparableUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const normalized = normalizeUrl(raw);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    return url.toString();
  } catch {
    return normalized.toLowerCase();
  }
}

const TRACKING_QUERY_PARAM_RE = /^(utm_[a-z0-9_]+|gclid|fbclid|mc_cid|mc_eid)$/i;

function normalizePageEquivalenceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const normalized = normalizeUrl(raw);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./i, '');
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    const pathname = url.pathname.replace(/\/+$/, '');
    url.pathname = pathname.length > 0 ? pathname : '/';

    const keptParams = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_QUERY_PARAM_RE.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
      );

    url.search = '';
    for (const [key, value] of keptParams) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  } catch {
    return normalized.toLowerCase();
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

const CLAIM_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'first',
  'from',
  'have',
  'into',
  'just',
  'more',
  'most',
  'other',
  'over',
  'same',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'through',
  'under',
  'very',
  'what',
  'when',
  'which',
  'with',
  'would',
]);

function splitClaimSentences(responseText: string): string[] {
  return responseText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeClaimTokens(value: string): Set<string> {
  const matches = value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  return new Set(matches.filter((token) => !CLAIM_STOPWORDS.has(token)));
}

function selectClaimSentence(responseText: string, citation: ParsedBenchmarkCitation): string | null {
  const sentences = splitClaimSentences(responseText);
  if (sentences.length === 0) return null;

  const citedUrl = citation.citedUrl?.toLowerCase() ?? null;
  const citedDomain = citation.citedDomain?.toLowerCase() ?? null;
  const scoreSentence = (sentence: string): number => {
    const lower = sentence.toLowerCase();
    const tokens = normalizeClaimTokens(sentence).size;
    const citesUrl = citedUrl ? lower.includes(citedUrl) : false;
    const citesDomain = citedDomain ? lower.includes(citedDomain) : false;
    const sourcePenalty = /^(source|sources|reference|references)\s*:/i.test(sentence) ? 4 : 0;
    return tokens + (citesDomain ? 3 : 0) + (citesUrl ? 1 : 0) - sourcePenalty;
  };

  return [...sentences].sort((left, right) => scoreSentence(right) - scoreSentence(left))[0] ?? null;
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

export function matchCitationToGroundingEvidence(
  citation: ParsedBenchmarkCitation,
  groundingContext: BenchmarkGroundingContext | null
): BenchmarkCitationGroundingMatch | null {
  if (!groundingContext || !citation.citedUrl) return null;

  const citedUrl = normalizeComparableUrl(citation.citedUrl);
  if (!citedUrl) return null;
  const normalizedPageUrl = normalizePageEquivalenceUrl(citation.citedUrl);

  for (const evidence of groundingContext.evidence) {
    const pageUrl = normalizeComparableUrl(evidence.pageUrl);
    if (pageUrl && pageUrl === citedUrl) {
      return {
        groundingEvidenceId: evidence.evidenceId,
        groundingPageUrl: evidence.pageUrl ?? citedUrl,
        groundingPageType: evidence.pageType,
        provenanceMatchMethod: 'exact_url',
        provenanceConfidence: 1,
      };
    }

    const normalizedEvidencePageUrl = normalizePageEquivalenceUrl(evidence.pageUrl);
    if (!normalizedPageUrl || !normalizedEvidencePageUrl || normalizedEvidencePageUrl !== normalizedPageUrl) {
      continue;
    }

    return {
      groundingEvidenceId: evidence.evidenceId,
      groundingPageUrl: evidence.pageUrl ?? citation.citedUrl,
      groundingPageType: evidence.pageType,
      provenanceMatchMethod: 'normalized_page',
      provenanceConfidence: 0.9,
    };
  }

  return null;
}

export function assessCitationClaimEvidenceMatch(args: {
  readonly citation: ParsedBenchmarkCitation;
  readonly responseText: string;
  readonly groundingContext: BenchmarkGroundingContext | null;
  readonly groundingMatch: BenchmarkCitationGroundingMatch | null;
}): BenchmarkClaimEvidenceMatch {
  if (!args.groundingContext || !args.groundingMatch) {
    return {
      status: 'unavailable',
      claimText: null,
      overlapTokenCount: 0,
      claimTokenCount: 0,
      evidenceTokenCount: 0,
      overlapRatio: 0,
    };
  }

  const evidence = args.groundingContext.evidence.find(
    (item) => item.evidenceId === args.groundingMatch?.groundingEvidenceId
  );
  const claimText = selectClaimSentence(args.responseText, args.citation);
  if (!evidence || !claimText) {
    return {
      status: 'unavailable',
      claimText: claimText ?? null,
      overlapTokenCount: 0,
      claimTokenCount: 0,
      evidenceTokenCount: 0,
      overlapRatio: 0,
    };
  }

  const claimTokens = normalizeClaimTokens(claimText);
  const evidenceTokens = normalizeClaimTokens(evidence.excerpt);
  const overlapTokenCount = [...claimTokens].filter((token) => evidenceTokens.has(token)).length;
  const overlapRatio = claimTokens.size === 0 ? 0 : overlapTokenCount / claimTokens.size;

  return {
    status:
      overlapTokenCount >= 2
        ? 'supported_overlap'
        : overlapTokenCount === 1
          ? 'weak_overlap'
          : 'no_overlap',
    claimText,
    overlapTokenCount,
    claimTokenCount: claimTokens.size,
    evidenceTokenCount: evidenceTokens.size,
    overlapRatio: Number(overlapRatio.toFixed(3)),
  };
}
