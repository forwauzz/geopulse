import { z } from 'zod';
import type { BenchmarkDomainRow } from './benchmark-repository';
import { fetchHtmlPage } from '../../workers/lib/fetch-gate';
import {
  extractSameOriginLinks,
  prioritizeUrlsBySection,
} from '../../workers/scan-engine/crawl-url-utils';
import { buildTextSample, parsePageSignals } from '../../workers/scan-engine/parse-signals';

export const benchmarkRunModeSchema = z.enum([
  'ungrounded_inference',
  'grounded_site',
]);

export type BenchmarkRunMode = z.infer<typeof benchmarkRunModeSchema>;

export const DEFAULT_BENCHMARK_RUN_MODE: BenchmarkRunMode = 'ungrounded_inference';

export type BenchmarkGroundingEvidence = {
  readonly evidenceId: string;
  readonly sourceLabel: string;
  readonly excerpt: string;
  readonly pageUrl: string | null;
  readonly pageType: string | null;
  readonly evidenceLabel: string | null;
  readonly pageTitle: string | null;
  readonly fetchStatus: string | null;
  readonly fetchOrder: number | null;
  readonly selectionReason: string | null;
};

export type BenchmarkGroundingContext = {
  readonly mode: BenchmarkRunMode;
  readonly evidence: readonly BenchmarkGroundingEvidence[];
};

export type BenchmarkGroundingContextSource = 'metadata' | 'site_builder' | 'none';

export type BenchmarkGroundingResolution = {
  readonly context: BenchmarkGroundingContext | null;
  readonly source: BenchmarkGroundingContextSource;
  readonly error: string | null;
};

type FetchHtmlPageLike = typeof fetchHtmlPage;

type GroundingPageCandidate = {
  readonly pageType: string;
  readonly url: string;
  readonly score: number;
  readonly selectionReason: string;
};

const ABOUT_PATH_RE = /\/(about|company|who-we-are|our-story|team|mission)(\/|$)/i;
const SERVICES_PATH_RE = /\/(services|solutions|what-we-do|capabilities|offerings)(\/|$)/i;
const PRODUCT_PATH_RE = /\/(product|platform|features|pricing|software)(\/|$)/i;
const TRUST_PATH_RE = /\/(customers|case-studies|industries|why-us|approach)(\/|$)/i;
const LOW_SIGNAL_PATH_RE = /\/(blog|news|press|careers|jobs|privacy|terms|legal|contact)(\/|$)/i;
const MAX_GROUNDING_EXCERPT_CHARS = 1_200;
const MIN_GROUNDING_EXCERPT_CHARS = 120;
const MAX_GROUNDING_CANDIDATES = 3;

function buildGroundingEvidenceId(args: {
  readonly sourceLabel: string;
  readonly excerpt: string;
  readonly pageUrl: string | null;
  readonly pageType: string | null;
  readonly evidenceLabel: string | null;
  readonly pageTitle?: string | null;
  readonly fetchStatus?: string | null;
  readonly fetchOrder?: number | null;
  readonly selectionReason?: string | null;
}): string {
  const seed = [
    args.sourceLabel.trim().toLowerCase(),
    args.pageType?.trim().toLowerCase() ?? '',
    args.pageUrl?.trim().toLowerCase() ?? '',
    args.evidenceLabel?.trim().toLowerCase() ?? '',
    args.pageTitle?.trim().toLowerCase() ?? '',
    args.fetchStatus?.trim().toLowerCase() ?? '',
    args.fetchOrder == null ? '' : String(args.fetchOrder),
    args.selectionReason?.trim().toLowerCase() ?? '',
    args.excerpt.trim().toLowerCase(),
  ].join('|');

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `ge-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildEvidenceFromPage(args: {
  readonly pageType: string;
  readonly pageUrl: string;
  readonly html: string;
  readonly fetchOrder: number;
  readonly selectionReason: string;
}): BenchmarkGroundingEvidence | null {
  const excerpt = buildTextSample(args.html, MAX_GROUNDING_EXCERPT_CHARS).trim();
  if (excerpt.length < MIN_GROUNDING_EXCERPT_CHARS) return null;

  const signals = parsePageSignals(args.html);
  const pageTitle = signals.title?.trim() || null;
  const evidenceLabel = pageTitle;
  return {
    evidenceId: buildGroundingEvidenceId({
      sourceLabel: args.pageType,
      excerpt,
      pageUrl: args.pageUrl,
      pageType: args.pageType,
      evidenceLabel,
      pageTitle,
      fetchStatus: 'ok',
      fetchOrder: args.fetchOrder,
      selectionReason: args.selectionReason,
    }),
    sourceLabel: args.pageType,
    excerpt,
    pageUrl: args.pageUrl,
    pageType: args.pageType,
    evidenceLabel,
    pageTitle,
    fetchStatus: 'ok',
    fetchOrder: args.fetchOrder,
    selectionReason: args.selectionReason,
  };
}

function classifyGroundingPageType(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    if (ABOUT_PATH_RE.test(pathname)) return 'about';
    if (SERVICES_PATH_RE.test(pathname)) return 'services';
    if (PRODUCT_PATH_RE.test(pathname)) return 'product';
    return 'other';
  } catch {
    return 'other';
  }
}

function scoreGroundingPageCandidate(url: string): number {
  try {
    const pathname = new URL(url).pathname;
    if (ABOUT_PATH_RE.test(pathname)) return 100;
    if (SERVICES_PATH_RE.test(pathname)) return 90;
    if (PRODUCT_PATH_RE.test(pathname)) return 70;
    if (TRUST_PATH_RE.test(pathname)) return 55;
    if (LOW_SIGNAL_PATH_RE.test(pathname)) return -20;
    return 20;
  } catch {
    return -100;
  }
}

function describeGroundingSelectionReason(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    if (ABOUT_PATH_RE.test(pathname)) return 'about_path_priority';
    if (SERVICES_PATH_RE.test(pathname)) return 'services_path_priority';
    if (PRODUCT_PATH_RE.test(pathname)) return 'product_path_priority';
    if (TRUST_PATH_RE.test(pathname)) return 'trust_path_priority';
    return 'section_diverse_fallback';
  } catch {
    return 'fallback';
  }
}

function selectGroundingPageCandidates(homepageHtml: string, homepageUrl: string): GroundingPageCandidate[] {
  const links = extractSameOriginLinks(homepageHtml, homepageUrl, 60);
  const rankedUrls = [...links]
    .sort((left, right) => scoreGroundingPageCandidate(right) - scoreGroundingPageCandidate(left));
  const sectionAware = prioritizeUrlsBySection(homepageUrl, rankedUrls, links.length);

  return sectionAware
    .map((url) => ({
      url,
      pageType: classifyGroundingPageType(url),
      score: scoreGroundingPageCandidate(url),
      selectionReason: describeGroundingSelectionReason(url),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_GROUNDING_CANDIDATES);
}

function normalizeEvidenceItem(value: unknown): BenchmarkGroundingEvidence | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const sourceLabelValue =
    typeof record['sourceLabel'] === 'string'
      ? record['sourceLabel']
      : typeof record['source'] === 'string'
        ? record['source']
        : '';
  const evidenceLabelValue =
    typeof record['evidenceLabel'] === 'string'
      ? record['evidenceLabel']
      : typeof record['evidence_label'] === 'string'
        ? record['evidence_label']
      : typeof record['label'] === 'string'
        ? record['label']
        : '';
  const pageTypeValue =
    typeof record['pageType'] === 'string'
      ? record['pageType']
      : typeof record['page_type'] === 'string'
        ? record['page_type']
        : '';
  const pageUrlValue =
    typeof record['pageUrl'] === 'string'
      ? record['pageUrl']
      : typeof record['page_url'] === 'string'
        ? record['page_url']
        : typeof record['url'] === 'string'
          ? record['url']
          : '';
  const excerptValue =
    typeof record['excerpt'] === 'string'
      ? record['excerpt']
      : typeof record['text'] === 'string'
        ? record['text']
        : '';
  const pageTitleValue =
    typeof record['pageTitle'] === 'string'
      ? record['pageTitle']
      : typeof record['page_title'] === 'string'
        ? record['page_title']
        : '';
  const fetchStatusValue =
    typeof record['fetchStatus'] === 'string'
      ? record['fetchStatus']
      : typeof record['fetch_status'] === 'string'
        ? record['fetch_status']
        : '';
  const fetchOrderValue =
    typeof record['fetchOrder'] === 'number'
      ? record['fetchOrder']
      : typeof record['fetch_order'] === 'number'
        ? record['fetch_order']
        : null;
  const selectionReasonValue =
    typeof record['selectionReason'] === 'string'
      ? record['selectionReason']
      : typeof record['selection_reason'] === 'string'
        ? record['selection_reason']
        : '';
  const evidenceLabel = evidenceLabelValue.trim() || null;
  const pageType = pageTypeValue.trim() || null;
  const pageUrl = pageUrlValue.trim() || null;
  const excerpt = excerptValue.trim();
  const pageTitle = pageTitleValue.trim() || null;
  const fetchStatus = fetchStatusValue.trim() || null;
  const fetchOrder =
    typeof fetchOrderValue === 'number' && Number.isFinite(fetchOrderValue)
      ? fetchOrderValue
      : null;
  const selectionReason = selectionReasonValue.trim() || null;
  const sourceLabel =
    sourceLabelValue.trim() || evidenceLabel || pageType || (pageUrl ? 'page' : 'evidence');

  if (!excerpt) return null;

  const evidenceIdValue =
    typeof record['evidenceId'] === 'string'
      ? record['evidenceId']
      : typeof record['evidence_id'] === 'string'
        ? record['evidence_id']
        : '';
  const evidenceId =
    evidenceIdValue.trim() ||
    buildGroundingEvidenceId({
      sourceLabel,
      excerpt,
      pageUrl,
      pageType,
      evidenceLabel,
      pageTitle,
      fetchStatus,
      fetchOrder,
      selectionReason,
    });

  return {
    evidenceId,
    sourceLabel,
    excerpt,
    pageUrl,
    pageType,
    evidenceLabel,
    pageTitle,
    fetchStatus,
    fetchOrder,
    selectionReason,
  };
}

export function resolveBenchmarkGroundingContext(
  domain: Pick<BenchmarkDomainRow, 'metadata'>,
  runMode: BenchmarkRunMode
): BenchmarkGroundingContext | null {
  if (runMode !== 'grounded_site') return null;

  const groundingContext = domain.metadata?.['grounding_context'];
  if (!groundingContext || typeof groundingContext !== 'object') return null;

  const evidence = Array.isArray((groundingContext as Record<string, unknown>)['evidence'])
    ? ((groundingContext as Record<string, unknown>)['evidence'] as unknown[])
        .map(normalizeEvidenceItem)
        .filter((item): item is BenchmarkGroundingEvidence => item !== null)
    : [];

  if (evidence.length === 0) return null;

  return {
    mode: runMode,
    evidence,
  };
}

export async function resolveBenchmarkGroundingContextForRun(
  domain: Pick<BenchmarkDomainRow, 'metadata' | 'site_url' | 'canonical_domain'>,
  runMode: BenchmarkRunMode,
  fetchPageImpl: FetchHtmlPageLike = fetchHtmlPage
): Promise<BenchmarkGroundingResolution> {
  if (runMode !== 'grounded_site') {
    return {
      context: null,
      source: 'none',
      error: null,
    };
  }

  const metadataContext = resolveBenchmarkGroundingContext(domain, runMode);
  if (metadataContext) {
    return {
      context: metadataContext,
      source: 'metadata',
      error: null,
    };
  }

  const siteUrl = domain.site_url?.trim() || `https://${domain.canonical_domain}/`;
  const homepage = await fetchPageImpl(siteUrl);
  if (!homepage.ok) {
    return {
      context: null,
      source: 'none',
      error: `benchmark_grounding_builder_homepage_failed:${homepage.reason}`,
    };
  }

  const evidence: BenchmarkGroundingEvidence[] = [];
  const homepageEvidence = buildEvidenceFromPage({
    pageType: 'homepage',
    pageUrl: homepage.finalUrl,
    html: homepage.html,
    fetchOrder: 0,
    selectionReason: 'homepage_seed',
  });
  if (homepageEvidence) {
    evidence.push(homepageEvidence);
  }

  const candidates = selectGroundingPageCandidates(homepage.html, homepage.finalUrl);
  for (const candidate of candidates) {
    const page = await fetchPageImpl(candidate.url);
    if (!page.ok) continue;
    const pageEvidence = buildEvidenceFromPage({
      pageType: candidate.pageType,
      pageUrl: page.finalUrl,
      html: page.html,
      fetchOrder: evidence.length,
      selectionReason: candidate.selectionReason,
    });
    if (pageEvidence) {
      evidence.push(pageEvidence);
    }
  }

  if (evidence.length === 0) {
    return {
      context: null,
      source: 'none',
      error: 'benchmark_grounding_builder_empty',
    };
  }

  return {
    context: {
      mode: runMode,
      evidence,
    },
    source: 'site_builder',
    error: null,
  };
}

export function buildBenchmarkPrompt(args: {
  readonly queryText: string;
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly runMode: BenchmarkRunMode;
  readonly groundingContext: BenchmarkGroundingContext | null;
}): string {
  const siteUrl = args.siteUrl ?? `https://${args.canonicalDomain}/`;
  if (args.runMode === 'grounded_site') {
    if (!args.groundingContext) {
      throw new Error('benchmark_grounded_context_missing');
    }

    const evidenceBlock = args.groundingContext.evidence
      .map((item, index) => {
        const descriptorParts = [
          item.sourceLabel,
          item.pageType && item.pageType !== item.sourceLabel ? item.pageType : null,
          item.pageUrl,
        ].filter((part): part is string => typeof part === 'string' && part.length > 0);

        return `Evidence ${index + 1} (${descriptorParts.join(' | ')}): ${item.excerpt}`;
      })
      .join('\n');

    return [
      `You are answering a question about a company using only the evidence excerpts below, drawn from ${args.canonicalDomain}. Do not use outside knowledge.`,
      '',
      'If the evidence does not support a claim, say so explicitly rather than inferring. Paraphrase in your own words instead of copying long phrases from the excerpts. Avoid marketing adjectives unless the evidence clearly supports them.',
      '',
      'Evidence:',
      evidenceBlock,
      '',
      `Question: ${args.queryText}`,
      '',
      `Answer in 3 to 5 sentences in plain text. Mention ${args.canonicalDomain} naturally at least once when the evidence supports the target company. If the evidence is ambiguous or incomplete, flag that briefly.`,
    ].join('\n');
  }

  return [
    'You are participating in an AI visibility benchmark.',
    'This run is in ungrounded brand inference mode.',
    `Target domain: ${args.canonicalDomain}`,
    `Target site URL: ${siteUrl}`,
    `User query: ${args.queryText}`,
    'Answer the user query naturally in 3 to 6 sentences.',
    'Do not return JSON.',
    'If you mention the target brand or website, use the exact domain when appropriate.',
  ].join('\n');
}

export function serializeGroundingEvidenceSnapshot(
  groundingContext: BenchmarkGroundingContext | null
): Array<{
  readonly evidence_id: string;
  readonly source_label: string;
  readonly page_type: string | null;
  readonly page_url: string | null;
  readonly evidence_label: string | null;
  readonly page_title: string | null;
  readonly fetch_status: string | null;
  readonly fetch_order: number | null;
  readonly selection_reason: string | null;
  readonly excerpt: string;
}> {
  if (!groundingContext) return [];

  return groundingContext.evidence.map((item) => ({
    evidence_id: item.evidenceId,
    source_label: item.sourceLabel,
    page_type: item.pageType,
    page_url: item.pageUrl,
    evidence_label: item.evidenceLabel,
    page_title: item.pageTitle,
    fetch_status: item.fetchStatus,
    fetch_order: item.fetchOrder,
    selection_reason: item.selectionReason,
    excerpt: item.excerpt,
  }));
}
