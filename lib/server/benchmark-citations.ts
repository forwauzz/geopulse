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

type ResponseStructure = 'numbered_list' | 'bullet_list' | 'ordinal_prose' | 'prose';

type LineSegment = {
  readonly start: number;
  readonly end: number;
  readonly rank: number | null;
};

const NUMBERED_LIST_LINE_RE = /^\s*(\d+)[.)]\s/;
const BULLET_LIST_LINE_RE = /^\s*[-*•]\s/;
const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'] as const;
const ORDINAL_RANK: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

function detectResponseStructure(text: string): ResponseStructure {
  const lines = text.split('\n');
  if (lines.filter((l) => NUMBERED_LIST_LINE_RE.test(l)).length >= 2) return 'numbered_list';
  if (lines.filter((l) => BULLET_LIST_LINE_RE.test(l)).length >= 2) return 'bullet_list';
  if (new RegExp(`\\b(${ORDINAL_WORDS.join('|')})\\b`, 'i').test(text)) return 'ordinal_prose';
  return 'prose';
}

function buildLineSegments(text: string, structure: ResponseStructure): readonly LineSegment[] {
  if (structure === 'prose') return [];

  if (structure === 'numbered_list' || structure === 'bullet_list') {
    const segments: LineSegment[] = [];
    let pos = 0;
    let bulletRank = 0;
    for (const line of text.split('\n')) {
      const lineStart = pos;
      const lineEnd = pos + line.length;
      pos = lineEnd + 1;
      if (structure === 'numbered_list') {
        const m = NUMBERED_LIST_LINE_RE.exec(line);
        if (m) segments.push({ start: lineStart, end: lineEnd, rank: parseInt(m[1]!, 10) });
      } else if (BULLET_LIST_LINE_RE.test(line)) {
        bulletRank += 1;
        segments.push({ start: lineStart, end: lineEnd, rank: bulletRank });
      }
    }
    return segments;
  }

  if (structure === 'ordinal_prose') {
    const segments: LineSegment[] = [];
    const re = new RegExp(`\\b(${ORDINAL_WORDS.join('|')})\\b`, 'gi');
    const hits: Array<{ index: number; rank: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const rank = ORDINAL_RANK[m[1]!.toLowerCase()];
      if (rank !== undefined) hits.push({ index: m.index, rank });
    }
    for (let i = 0; i < hits.length; i++) {
      const start = hits[i]!.index;
      const end = i + 1 < hits.length ? hits[i + 1]!.index : text.length;
      segments.push({ start, end, rank: hits[i]!.rank });
    }
    return segments;
  }

  return [];
}

function getRankAtOffset(charOffset: number, segments: readonly LineSegment[]): number | null {
  for (const seg of segments) {
    if (charOffset >= seg.start && charOffset < seg.end) return seg.rank;
  }
  return null;
}

export function parseBenchmarkCitations(
  responseText: string,
  domain: BenchmarkDomainRow
): ParsedBenchmarkCitation[] {
  const citations: ParsedBenchmarkCitation[] = [];
  const seenUrls = new Set<string>();
  const seenDomains = new Set<string>();
  const structure = detectResponseStructure(responseText);
  const segments = buildLineSegments(responseText, structure);

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
      rankPosition: getRankAtOffset(match.index!, segments),
      confidence: 1,
      metadata: { match_type: 'url', response_structure: structure },
    });
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
      rankPosition: getRankAtOffset(match.index!, segments),
      confidence: 0.8,
      metadata: { match_type: 'domain', response_structure: structure },
    });
  }

  if (!seenDomains.has(domain.canonical_domain)) {
    for (const alias of uniqueAliases(domain)) {
      const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      const aliasMatch = aliasRegex.exec(responseText);
      if (!aliasMatch) continue;

      seenDomains.add(domain.canonical_domain);
      citations.push({
        citedDomain: domain.canonical_domain,
        citedUrl: null,
        citationType: 'brand_mention',
        rankPosition: getRankAtOffset(aliasMatch.index, segments),
        confidence: 0.6,
        metadata: { match_type: 'brand_mention', alias, response_structure: structure },
      });
      break;
    }
  }

  return citations;
}

const DOMAIN_LIKE_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function parseCompetitorCitations(
  responseText: string,
  competitorList: readonly string[],
  measuredCanonicalDomain: string
): ParsedBenchmarkCitation[] {
  if (competitorList.length === 0) return [];

  const citations: ParsedBenchmarkCitation[] = [];
  const structure = detectResponseStructure(responseText);
  const segments = buildLineSegments(responseText, structure);
  const seenKeys = new Set<string>();

  for (const competitor of competitorList) {
    const trimmed = competitor.trim();
    if (!trimmed || trimmed.length < 3) continue;

    if (DOMAIN_LIKE_RE.test(trimmed)) {
      const canonicalCompetitor = toCanonicalDomain(trimmed) ?? trimmed.toLowerCase();
      if (canonicalCompetitor === measuredCanonicalDomain) continue;
      if (seenKeys.has(canonicalCompetitor)) continue;

      const urlRegex = /https?:\/\/[^\s<>"'`]+/gi;
      let found = false;
      for (const match of responseText.matchAll(urlRegex)) {
        const normalizedUrl = normalizeUrl(match[0]);
        if (!normalizedUrl) continue;
        if (toCanonicalDomain(normalizedUrl) !== canonicalCompetitor) continue;
        seenKeys.add(canonicalCompetitor);
        citations.push({
          citedDomain: canonicalCompetitor,
          citedUrl: normalizedUrl,
          citationType: 'explicit_url',
          rankPosition: getRankAtOffset(match.index!, segments),
          confidence: 1,
          metadata: { match_type: 'url', is_competitor: true, competitor_name: trimmed, response_structure: structure },
        });
        found = true;
        break;
      }

      if (!found) {
        const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
        for (const match of responseText.matchAll(domainRegex)) {
          if (toCanonicalDomain(match[0]) !== canonicalCompetitor) continue;
          seenKeys.add(canonicalCompetitor);
          citations.push({
            citedDomain: canonicalCompetitor,
            citedUrl: null,
            citationType: 'explicit_domain',
            rankPosition: getRankAtOffset(match.index!, segments),
            confidence: 0.8,
            metadata: { match_type: 'domain', is_competitor: true, competitor_name: trimmed, response_structure: structure },
          });
          break;
        }
      }
    } else {
      const key = trimmed.toLowerCase();
      if (seenKeys.has(key)) continue;
      const aliasRegex = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i');
      const aliasMatch = aliasRegex.exec(responseText);
      if (!aliasMatch) continue;
      seenKeys.add(key);
      citations.push({
        citedDomain: null,
        citedUrl: null,
        citationType: 'brand_mention',
        rankPosition: getRankAtOffset(aliasMatch.index, segments),
        confidence: 0.6,
        metadata: { match_type: 'brand_mention', is_competitor: true, competitor_name: trimmed, response_structure: structure },
      });
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
