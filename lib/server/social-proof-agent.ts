/**
 * Social Distribution + Proof Agent.
 *
 * The agent turns already-verified GEO-Pulse evidence into reviewable distribution assets.
 * It never invents outcomes, never exposes a client domain without explicit consent, and never
 * publishes media-required posts until a provider-ready asset exists.
 *
 * The existing `automation_settings` row is the durable control plane:
 *   off        -> no work
 *   draft      -> create drafts only
 *   approval   -> create review-queue assets
 *   autonomous -> approve safe assets and create idempotent distribution jobs
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAutomationSetting } from './automation-settings';
import {
  createDistributionEngineRepository,
  type DistributionAccountRow,
  type DistributionAssetRow,
  type DistributionAssetType,
  type DistributionProviderFamily,
} from './distribution-engine-repository';
import {
  renderSocialCardSet,
  type BrowserRunBinding,
  type SocialMediaBucket,
  type SocialRenderedMedia,
} from './social-card-renderer';
import {
  buildDailySocialSlate,
  discoverSocialTrends,
  type SocialTrendEnv,
  type SocialTrendIdea,
} from './social-trend-agent';
import { collectInstagramPerformance } from './instagram-performance-agent';
import { structuredLogWithClientAndWait } from './structured-log';

export type SocialProofAgentMode = 'off' | 'draft' | 'approval' | 'autonomous';

export type SocialProofAgentConfig = {
  readonly mode: SocialProofAgentMode;
  readonly dailyCap: number;
  readonly beforeAfterEnabled: boolean;
  readonly auditScreenshotsEnabled: boolean;
  readonly aggregateDataEnabled: boolean;
  readonly educationalEnabled: boolean;
  readonly industryHumorEnabled: boolean;
  readonly clientProofEnabled: boolean;
  readonly carouselEnabled: boolean;
  readonly reelsEnabled: boolean;
  readonly trendResearchEnabled: boolean;
  readonly learningEnabled: boolean;
  readonly minAggregateSampleSize: number;
  readonly timezone: string;
  readonly postingHoursLocal: readonly number[];
};

export type SocialProofMedia = {
  readonly mediaKind: 'image' | 'carousel_slide';
  readonly storageUrl: string;
  readonly mimeType: string;
  readonly altText: string;
  readonly sortOrder: number;
  readonly metadata: Record<string, unknown>;
};

export type SocialProofCandidate = {
  readonly key: string;
  readonly kind:
    | 'before_after'
    | 'aggregate'
    | 'educational'
    | 'industry_humor'
    | 'timely'
    | 'carousel'
    | 'proof_demo';
  readonly title: string;
  readonly caption: string;
  readonly ctaUrl: string;
  readonly contentItemId: string | null;
  readonly mediaUrl: string | null;
  readonly mediaMimeType: string | null;
  readonly mediaAlt: string | null;
  readonly media?: readonly SocialProofMedia[];
  readonly assetType?: DistributionAssetType;
  readonly evidence: Record<string, unknown>;
  readonly safeForAutonomousPublish: boolean;
};

export type SocialProofAgentResult = {
  readonly status: 'created' | 'noop' | 'skipped' | 'failed';
  readonly mode: SocialProofAgentMode;
  readonly candidates: number;
  readonly assetsCreated: number;
  readonly jobsCreated: number;
  readonly reason?: string;
};

export type SocialProductionEnv = SocialTrendEnv & {
  readonly BROWSER?: BrowserRunBinding;
  readonly REPORT_FILES?: SocialMediaBucket;
  readonly SOCIAL_MEDIA_PUBLIC_BASE?: string;
  readonly INSTAGRAM_GRAPH_API_BASE_URL?: string;
};

type ScanRow = {
  readonly id: string;
  readonly domain: string;
  readonly score: number | null;
  readonly letter_grade: string | null;
  readonly issues_json: unknown;
  readonly run_source: string;
  readonly created_at: string;
};

type ContentRow = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly canonical_url: string | null;
  readonly metadata: unknown;
  readonly published_at: string | null;
};

function readBoolean(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInt(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number
): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), max)
    : fallback;
}

function readHour(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 23
    ? Math.floor(value)
    : fallback;
}

function readPostingHours(config: Record<string, unknown>): readonly number[] {
  const raw = config['posting_hours_local'];
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [
          readHour(config, 'morning_hour_local', 9),
          12,
          15,
          readHour(config, 'evening_hour_local', 19),
        ];
  const hours = [...new Set(values
    .map((value) => typeof value === 'number' ? value : Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 23)
    .map((value) => Math.floor(value)))]
    .sort((a, b) => a - b)
    .slice(0, 5);
  return hours.length > 0 ? hours : [9, 12, 15, 19];
}

export function resolveSocialProofAgentConfig(
  config: Record<string, unknown>,
  enabled: boolean,
  killed: boolean
): SocialProofAgentConfig {
  const rawMode = typeof config['mode'] === 'string' ? config['mode'] : '';
  const mode: SocialProofAgentMode =
    killed || !enabled
      ? 'off'
      : rawMode === 'draft' || rawMode === 'approval' || rawMode === 'autonomous'
        ? rawMode
        : 'draft';

  return {
    mode,
    dailyCap: readPositiveInt(config, 'daily_cap', 4, 5),
    beforeAfterEnabled: readBoolean(config, 'before_after_enabled', true),
    auditScreenshotsEnabled: readBoolean(config, 'audit_screenshots_enabled', false),
    aggregateDataEnabled: readBoolean(config, 'aggregate_data_enabled', true),
    educationalEnabled: readBoolean(config, 'educational_enabled', true),
    industryHumorEnabled: readBoolean(config, 'industry_humor_enabled', true),
    clientProofEnabled: readBoolean(config, 'client_proof_enabled', false),
    carouselEnabled: readBoolean(config, 'carousel_enabled', true),
    reelsEnabled: readBoolean(config, 'reels_enabled', false),
    trendResearchEnabled: readBoolean(config, 'trend_research_enabled', true),
    learningEnabled: readBoolean(config, 'learning_enabled', true),
    minAggregateSampleSize: readPositiveInt(config, 'min_aggregate_sample_size', 20, 500),
    timezone:
      typeof config['timezone'] === 'string' && config['timezone'].trim()
        ? config['timezone'].trim()
        : 'America/Toronto',
    postingHoursLocal: readPostingHours(config),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isOwnedProofDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, '');
  return normalized === 'getgeopulse.com';
}

function normalizedAppUrl(appUrl: string): string {
  try {
    return new URL(appUrl || 'https://getgeopulse.com').toString();
  } catch {
    return 'https://getgeopulse.com/';
  }
}

function absoluteContentUrl(rawUrl: string, appUrl: string): string {
  return new URL(rawUrl, normalizedAppUrl(appUrl)).toString();
}

function buildTrackedCta(appUrl: string, content: string): string {
  const url = new URL('/', normalizedAppUrl(appUrl));
  url.searchParams.set('utm_source', 'social');
  url.searchParams.set('utm_medium', 'organic');
  url.searchParams.set('utm_campaign', 'proof_agent');
  url.searchParams.set('utm_content', content);
  return url.toString();
}

export function buildBeforeAfterCandidate(
  scans: ReadonlyArray<ScanRow>,
  appUrl: string
): SocialProofCandidate | null {
  const owned = scans
    .filter((scan) => isOwnedProofDomain(scan.domain) && typeof scan.score === 'number')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (owned.length < 2) return null;

  const latest = owned[0]!;
  const previous = owned.find((scan) => scan.id !== latest.id);
  if (!previous || latest.score === null || previous.score === null || latest.score <= previous.score) {
    return null;
  }

  const delta = latest.score - previous.score;
  return {
    key: `before-after-${previous.id}-${latest.id}`,
    kind: 'before_after',
    title: `What changed after we fixed our own site`,
    caption: [
      `We re-audited getgeopulse.com after making changes.`,
      ``,
      `AI search readiness moved from ${previous.score}/100 to ${latest.score}/100 (+${delta}).`,
      ``,
      `That is an observed before-and-after on our own site—not a ranking or traffic guarantee.`,
      ``,
      `Run a free scan to see what is blocking your site.`,
    ].join('\n'),
    ctaUrl: buildTrackedCta(appUrl, 'before_after'),
    contentItemId: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    evidence: {
      domain: 'getgeopulse.com',
      before_scan_id: previous.id,
      after_scan_id: latest.id,
      before_score: previous.score,
      after_score: latest.score,
      delta,
    },
    // Own-site evidence is claim-safe; candidateCanPublish still requires rendered media.
    safeForAutonomousPublish: true,
  };
}

function failedCheckNames(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues
    .filter((issue) => {
      const row = readRecord(issue);
      const status = readString(row['status'])?.toUpperCase();
      return row['passed'] === false || status === 'FAIL';
    })
    .map((issue) => readString(readRecord(issue)['check']))
    .filter((value): value is string => Boolean(value));
}

export function buildAggregateCandidate(
  scans: ReadonlyArray<ScanRow>,
  appUrl: string,
  minSampleSize: number
): SocialProofCandidate | null {
  const eligible = scans.filter(
    (scan) =>
      scan.run_source !== 'internal_benchmark' &&
      typeof scan.score === 'number' &&
      Array.isArray(scan.issues_json)
  );
  if (eligible.length < minSampleSize) return null;

  const counts = new Map<string, number>();
  for (const scan of eligible) {
    for (const check of new Set(failedCheckNames(scan.issues_json))) {
      counts.set(check, (counts.get(check) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;

  const [check, count] = top;
  const percentage = Math.round((count / eligible.length) * 100);
  return {
    key: `aggregate-${eligible.length}-${check.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`,
    kind: 'aggregate',
    title: `A recurring AI-readiness problem`,
    caption: [
      `Across ${eligible.length} recent anonymous GEO-Pulse scans, ${percentage}% failed the ${check} check.`,
      ``,
      `This is a directional sample from recent product usage—not an industry benchmark.`,
      ``,
      `The useful question is whether the same issue appears on your site. Run a free scan to check.`,
    ].join('\n'),
    ctaUrl: buildTrackedCta(appUrl, 'aggregate_proof'),
    contentItemId: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    evidence: {
      sample_size: eligible.length,
      failed_check: check,
      failed_count: count,
      failed_percentage: percentage,
      anonymized: true,
    },
    safeForAutonomousPublish: true,
  };
}

export function buildEducationalCandidate(
  item: ContentRow,
  appUrl: string
): SocialProofCandidate | null {
  const metadata = readRecord(item.metadata);
  const heroUrl = readString(metadata['hero_image_url']);
  const heroAlt = readString(metadata['hero_image_alt']);
  if (!heroUrl || !heroAlt || !heroUrl.startsWith('https://')) return null;

  const articleUrl = absoluteContentUrl(
    readString(item.canonical_url) ?? `/blog/${encodeURIComponent(item.slug)}`,
    appUrl
  );
  return {
    key: `educational-${item.id}`,
    kind: 'educational',
    title: item.title,
    caption: [
      item.title,
      ``,
      `A practical GEO-Pulse guide for making a site easier for AI systems to understand and cite.`,
      ``,
      `Read the guide, then run a free scan to see where your own site breaks.`,
    ].join('\n'),
    ctaUrl: articleUrl,
    contentItemId: item.id,
    mediaUrl: heroUrl,
    mediaMimeType: /\.(?:jpe?g)(?:\?|$)/i.test(heroUrl) ? 'image/jpeg' : 'image/png',
    mediaAlt: heroAlt,
    evidence: {
      content_item_id: item.id,
      canonical_url: articleUrl,
      hero_verified: true,
    },
    safeForAutonomousPublish: true,
  };
}

export function buildIndustryHumorCandidate(
  item: ContentRow,
  appUrl: string
): SocialProofCandidate | null {
  const educational = buildEducationalCandidate(item, appUrl);
  if (!educational) return null;
  return {
    ...educational,
    key: `industry-humor-${item.id}`,
    kind: 'industry_humor',
    title: `Agency reality check: ${item.title}`,
    // Jordan renders a distinct meme card. Reusing the article hero made the old feed
    // repetitive and did not visually communicate humor.
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    caption: [
      `Client: “We rank on Google, so ChatGPT must recommend us too… right?”`,
      ``,
      `Agency: opens the AI-readiness audit`,
      ``,
      `The useful answer: search rankings and AI citations overlap, but they are not the same system.`,
      ``,
      `Save this for the next strategy call. Then run the free GEO-Pulse scan.`,
      ``,
      `#GenerativeEngineOptimization #AgencyLife #AISEO`,
    ].join('\n'),
    evidence: {
      ...educational.evidence,
      format: 'industry_humor',
      claim_boundary: 'no_equivalence_between_search_rank_and_ai_citation',
    },
  };
}

export function buildEducationalCarouselCandidate(
  item: ContentRow,
  appUrl: string
): SocialProofCandidate | null {
  const educational = buildEducationalCandidate(item, appUrl);
  if (!educational) return null;
  return {
    ...educational,
    key: `carousel-${item.id}`,
    kind: 'carousel',
    title: item.title,
    caption: [
      item.title,
      '',
      'A saveable checklist for making the useful answer easier for people and AI systems to find.',
      '',
      'Save it for your next site or client review. Run a free scan — link in bio.',
      '',
      '#AIVisibility #GenerativeEngineOptimization #AgencyTools',
    ].join('\n'),
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    assetType: 'carousel_post',
    evidence: {
      ...educational.evidence,
      format: 'original_checklist_carousel',
      checklist_items: [
        'Answer the core question early',
        'Use concrete headings and stable terminology',
        'Support claims with visible evidence',
        'Make the next action obvious',
      ],
    },
  };
}

export function buildProductDemoCandidate(appUrl: string): SocialProofCandidate {
  return {
    key: 'proof-demo-ai-readiness-audit-v1',
    kind: 'proof_demo',
    title: 'What an AI-readiness audit actually shows',
    caption: [
      'An AI-visibility score is only useful when it tells you what to fix.',
      '',
      'GEO-Pulse checks crawl access, extractability, structure, direct answers, and trust signals—then turns the findings into a prioritized next move.',
      '',
      'No ranking promises. Just observable problems and practical fixes.',
      '',
      'Run a free scan — link in bio.',
      '',
      '#AIVisibility #SEOAudit #AgencyTools',
    ].join('\n'),
    ctaUrl: buildTrackedCta(appUrl, 'proof-demo-ai-readiness-audit-v1'),
    contentItemId: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    assetType: 'single_image_post',
    evidence: {
      source_label: 'GEO-Pulse product behavior',
      product_truth: true,
      claim_boundary: 'observable_readiness_signals_no_ranking_guarantee',
    },
    safeForAutonomousPublish: true,
  };
}

function trendIdeaCandidate(idea: SocialTrendIdea, appUrl: string): SocialProofCandidate {
  return {
    key: `sofia-${idea.key}`,
    kind:
      idea.slot === 'timely'
        ? 'timely'
        : idea.slot === 'carousel'
          ? 'carousel'
          : idea.slot === 'proof'
            ? 'proof_demo'
            : 'industry_humor',
    title: idea.title,
    caption: idea.caption,
    ctaUrl: buildTrackedCta(appUrl, `sofia-${idea.key}`),
    contentItemId: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    assetType: idea.slot === 'carousel' ? 'carousel_post' : 'single_image_post',
    evidence: {
      research_agent: 'sofia',
      source_url: idea.sourceUrl,
      source_label: idea.sourceLabel,
      source_type: idea.sourceType,
      why_now: idea.whyNow,
      hook: idea.hook,
      audience: idea.audience,
      score: idea.score,
      discovered_at: idea.discoveredAt,
      original_angle: idea.angle,
      copied_media: false,
    },
    safeForAutonomousPublish: idea.safeForAutonomousPublish,
  };
}

function cardKind(candidate: SocialProofCandidate):
  | 'timely'
  | 'humor'
  | 'carousel'
  | 'proof'
  | 'educational' {
  if (candidate.kind === 'industry_humor') return 'humor';
  if (candidate.kind === 'carousel') return 'carousel';
  if (
    candidate.kind === 'before_after' ||
    candidate.kind === 'aggregate' ||
    candidate.kind === 'proof_demo'
  ) {
    return 'proof';
  }
  return candidate.kind === 'timely' ? 'timely' : 'educational';
}

function candidateBullets(candidate: SocialProofCandidate): string[] {
  const evidence = candidate.evidence;
  if (Array.isArray(evidence['checklist_items'])) {
    return evidence['checklist_items']
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 5);
  }
  if (candidate.kind === 'proof_demo') {
    return ['Crawl access', 'Extractability', 'Page structure', 'Trust signals'];
  }
  if (candidate.kind === 'aggregate') {
    return [
      `${String(evidence['failed_percentage'] ?? '')}% failed this check`,
      `${String(evidence['sample_size'] ?? '')} anonymous recent scans`,
      'Directional product usage, not an industry benchmark',
    ];
  }
  if (candidate.kind === 'before_after') {
    return [
      `Before: ${String(evidence['before_score'] ?? '')}/100`,
      `After: ${String(evidence['after_score'] ?? '')}/100`,
      'Observed on our own site; no ranking guarantee',
    ];
  }
  const angle = typeof evidence['original_angle'] === 'string'
    ? String(evidence['original_angle'])
    : '';
  return angle
    ? angle.split(/[.;]\s+/).map((value) => value.trim()).filter(Boolean).slice(0, 4)
    : [];
}

function candidateSupportingText(candidate: SocialProofCandidate): string {
  const firstParagraph = candidate.caption
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .find((value) => value && value !== candidate.title);
  return (firstParagraph || candidate.caption).replace(/#\w+/g, '').trim().slice(0, 240);
}

async function materializeCandidateMedia(args: {
  readonly candidate: SocialProofCandidate;
  readonly env: SocialProductionEnv;
  readonly dateKey: string;
}): Promise<SocialProofCandidate> {
  if (args.candidate.media && args.candidate.media.length > 0) return args.candidate;
  if (
    args.candidate.mediaUrl &&
    args.candidate.mediaMimeType === 'image/jpeg'
  ) {
    return args.candidate;
  }
  const publicBase = args.env.SOCIAL_MEDIA_PUBLIC_BASE?.trim();
  if (!args.env.BROWSER || !args.env.REPORT_FILES || !publicBase) return args.candidate;
  const sourceLabel =
    typeof args.candidate.evidence['source_label'] === 'string'
      ? String(args.candidate.evidence['source_label'])
      : null;
  const media = await renderSocialCardSet({
    browser: args.env.BROWSER,
    bucket: args.env.REPORT_FILES,
    publicBase,
    dateKey: args.dateKey,
    brief: {
      key: args.candidate.key,
      kind: cardKind(args.candidate),
      eyebrow:
        args.candidate.kind === 'industry_humor'
          ? 'Agency reality'
          : args.candidate.kind === 'aggregate' || args.candidate.kind === 'before_after'
            ? 'What the evidence shows'
            : args.candidate.kind === 'carousel'
              ? 'Save this checklist'
              : 'What changed',
      headline: args.candidate.title,
      supportingText: candidateSupportingText(args.candidate),
      sourceLabel,
      bullets: candidateBullets(args.candidate),
    },
  });
  return {
    ...args.candidate,
    media: media.map((row: SocialRenderedMedia) => ({
      mediaKind: row.mediaKind,
      storageUrl: row.storageUrl,
      mimeType: row.mimeType,
      altText: row.altText,
      sortOrder: row.sortOrder,
      metadata: row.metadata,
    })),
    assetType: media.length > 1 ? 'carousel_post' : 'single_image_post',
  };
}

function trackedProviderCta(rawUrl: string, provider: string, assetKey: string): string {
  const url = new URL(rawUrl, 'https://getgeopulse.com');
  url.searchParams.set('utm_source', provider);
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'autonomous_social');
  url.searchParams.set('utm_content', assetKey.slice(0, 100));
  return url.toString();
}

function localParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
  };
}

export function instagramScheduleSlot(
  now: Date,
  timezone: string,
  hourLocal: number
): string {
  const targetMinute = 30;
  for (let minutes = 1; minutes <= 48 * 60; minutes += 1) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const local = localParts(candidate, timezone);
    if (
      local.hour === hourLocal &&
      local.minute === targetMinute
    ) {
      return candidate.toISOString();
    }
  }
  return new Date(now.getTime() + 2 * 60_000).toISOString();
}

function providerFamily(account: DistributionAccountRow | null): DistributionProviderFamily {
  if (!account) return 'generic';
  return account.provider_name === 'instagram' ||
    account.provider_name === 'linkedin' ||
    account.provider_name === 'x' ||
    account.provider_name === 'threads' ||
    account.provider_name === 'facebook'
    ? account.provider_name
    : 'generic';
}

function preferredAccount(accounts: ReadonlyArray<DistributionAccountRow>): DistributionAccountRow | null {
  const priority = ['instagram', 'linkedin', 'x', 'facebook', 'threads'];
  return (
    [...accounts].sort(
      (a, b) => priority.indexOf(a.provider_name) - priority.indexOf(b.provider_name)
    )[0] ?? null
  );
}

function assetStatusForMode(mode: SocialProofAgentMode): DistributionAssetRow['status'] {
  if (mode === 'autonomous') return 'approved';
  return mode === 'approval' ? 'review' : 'draft';
}

function makeAssetId(candidate: SocialProofCandidate, family: DistributionProviderFamily): string {
  const safe = candidate.key.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 110);
  return `proof_${family}_${safe}`;
}

function candidateCanPublish(
  candidate: SocialProofCandidate,
  account: DistributionAccountRow | null
): boolean {
  if (!account || !candidate.safeForAutonomousPublish) return false;
  if (account.provider_name === 'instagram') {
    if (candidate.assetType === 'carousel_post') {
      return Boolean(
        candidate.media &&
        candidate.media.length >= 2 &&
        candidate.media.every((row) => row.mimeType === 'image/jpeg')
      );
    }
    return Boolean(
      (candidate.mediaUrl && candidate.mediaMimeType === 'image/jpeg') ||
      candidate.media?.some(
        (row) => row.mediaKind === 'image' && row.mimeType === 'image/jpeg'
      )
    );
  }
  return true;
}

export function orderAutonomousCandidates(
  candidates: ReadonlyArray<SocialProofCandidate>,
  historicalPerformance: ReadonlyMap<SocialProofCandidate['kind'], number> = new Map()
): SocialProofCandidate[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      (historicalPerformance.get(b.kind) ?? 0) -
        (historicalPerformance.get(a.kind) ?? 0) ||
      a.key.localeCompare(b.key)
  );
  const ordered: SocialProofCandidate[] = [];
  const used = new Set<SocialProofCandidate>();
  const usedMedia = new Set<string>();

  const add = (candidate: SocialProofCandidate | undefined) => {
    if (!candidate || used.has(candidate)) return;
    if (candidate.mediaUrl && usedMedia.has(candidate.mediaUrl)) return;
    ordered.push(candidate);
    used.add(candidate);
    if (candidate.mediaUrl) usedMedia.add(candidate.mediaUrl);
  };

  const groups: ReadonlyArray<ReadonlyArray<SocialProofCandidate['kind']>> = [
    ['timely'],
    ['industry_humor'],
    ['carousel'],
    ['before_after', 'aggregate', 'proof_demo'],
    ['educational'],
  ];
  for (const kinds of groups) {
    add(ranked.find(
      (candidate) => candidate.safeForAutonomousPublish && kinds.includes(candidate.kind)
    ));
  }

  for (const candidate of ranked) {
    if (used.has(candidate)) continue;
    if (candidate.mediaUrl && usedMedia.has(candidate.mediaUrl)) continue;
    add(candidate);
  }
  return ordered;
}

function historicalPerformanceByKind(
  assets: ReadonlyArray<DistributionAssetRow>
): ReadonlyMap<SocialProofCandidate['kind'], number> {
  const totals = new Map<SocialProofCandidate['kind'], { total: number; count: number }>();
  for (const asset of assets) {
    const kind = asset.metadata['proof_kind'];
    const score = asset.metadata['performance_score'];
    if (
      (kind === 'before_after' ||
        kind === 'aggregate' ||
        kind === 'educational' ||
        kind === 'industry_humor' ||
        kind === 'timely' ||
        kind === 'carousel' ||
        kind === 'proof_demo') &&
      typeof score === 'number' &&
      Number.isFinite(score)
    ) {
      const row = totals.get(kind) ?? { total: 0, count: 0 };
      row.total += score;
      row.count += 1;
      totals.set(kind, row);
    }
  }
  return new Map(
    [...totals].map(([kind, row]) => [kind, row.count > 0 ? row.total / row.count : 0])
  );
}

function accountProviderIsInstagram(accounts: ReadonlyArray<DistributionAccountRow>): boolean {
  return accounts.some((account) => account.provider_name === 'instagram');
}

export async function runSocialProofAgent(args: {
  readonly supabase: SupabaseClient;
  readonly appUrl: string;
  readonly env?: SocialProductionEnv;
  readonly force?: boolean;
  readonly now?: Date;
}): Promise<SocialProofAgentResult> {
  const setting = await loadAutomationSetting(args.supabase, 'social_proof_agent');
  const config = resolveSocialProofAgentConfig(setting.config, setting.enabled, setting.killSwitch);
  const mode = args.force && config.mode === 'off' && !setting.killSwitch ? 'draft' : config.mode;
  if (mode === 'off') {
    return {
      status: 'skipped',
      mode,
      candidates: 0,
      assetsCreated: 0,
      jobsCreated: 0,
      reason: setting.killSwitch ? 'kill_switch' : 'disabled',
    };
  }

  try {
    const repo = createDistributionEngineRepository(args.supabase as never);
    const now = args.now ?? new Date();
    const [scanResult, contentResult, accounts, existingAssets] = await Promise.all([
      args.supabase
        .from('scans')
        .select('id,domain,score,letter_grade,issues_json,run_source,created_at')
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(250),
      args.supabase
        .from('content_items')
        .select('id,title,slug,canonical_url,metadata,published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(25),
      repo.listAccounts({ status: 'connected' }),
      repo.listAssets({ providerFamily: 'instagram' }),
    ]);
    if (scanResult.error) throw scanResult.error;
    if (contentResult.error) throw contentResult.error;

    let performanceLearning = { checked: 0, updated: 0, failed: 0 };
    if (config.learningEnabled && accountProviderIsInstagram(accounts)) {
      try {
        performanceLearning = await collectInstagramPerformance({
          supabase: args.supabase,
          graphBaseUrl: args.env?.INSTAGRAM_GRAPH_API_BASE_URL,
          now,
        });
      } catch {
        performanceLearning = { checked: 0, updated: 0, failed: 1 };
      }
    }

    const scans = (scanResult.data ?? []) as ScanRow[];
    const content = (contentResult.data ?? []) as ContentRow[];
    const candidates: SocialProofCandidate[] = [];

    if (config.beforeAfterEnabled) {
      const beforeAfter = buildBeforeAfterCandidate(scans, args.appUrl);
      if (beforeAfter) candidates.push(beforeAfter);
    }
    if (config.aggregateDataEnabled) {
      const aggregate = buildAggregateCandidate(scans, args.appUrl, config.minAggregateSampleSize);
      if (aggregate) candidates.push(aggregate);
    }
    if (config.educationalEnabled) {
      for (const item of content) {
        const candidate = buildEducationalCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    if (config.industryHumorEnabled) {
      for (const item of content) {
        const candidate = buildIndustryHumorCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    if (config.carouselEnabled) {
      for (const item of content) {
        const candidate = buildEducationalCarouselCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    candidates.push(buildProductDemoCandidate(args.appUrl));

    let trendProvider: string | null = null;
    let trendReason: string | null = null;
    if (config.trendResearchEnabled && args.env) {
      const discovery = await discoverSocialTrends(args.env, now);
      if (discovery.ok) {
        trendProvider = discovery.provider;
        const recentlyUsed = new Set(
          existingAssets
            .map((asset) => asset.source_key ?? '')
            .filter((key) => key.startsWith('sofia-'))
            .map((key) => key.slice('sofia-'.length))
        );
        for (const idea of buildDailySocialSlate(discovery.ideas, recentlyUsed)) {
          candidates.push(trendIdeaCandidate(idea, args.appUrl));
        }
      } else {
        trendReason = discovery.reason;
      }
    }

    const account = preferredAccount(accounts);
    const family = providerFamily(account);
    const orderedCandidates =
      mode === 'autonomous'
        ? orderAutonomousCandidates(candidates, historicalPerformanceByKind(existingAssets))
        : candidates;
    let assetsCreated = 0;
    let jobsCreated = 0;

    for (const rawCandidate of orderedCandidates) {
      if (assetsCreated >= config.dailyCap) break;
      const assetId = makeAssetId(rawCandidate, family);
      // A deterministic asset is immutable from the agent's perspective. Check before
      // rendering so retries never spend Browser Run time on an existing post.
      if (await repo.getAssetByAssetId(assetId)) continue;
      let candidate = rawCandidate;
      if (account?.provider_name === 'instagram' && args.env) {
        try {
          candidate = await materializeCandidateMedia({
            candidate,
            env: args.env,
            dateKey: now.toISOString().slice(0, 10),
          });
        } catch (error) {
          await structuredLogWithClientAndWait(
            args.supabase,
            'jordan_media_render_failed',
            {
              candidate_key: candidate.key,
              reason: error instanceof Error ? error.message : 'unknown',
            },
            'error'
          );
        }
      }
      // A deterministic asset is immutable from the agent's perspective. This both rotates
      // through the candidate pool on later runs and prevents a mode change from silently
      // promoting a previously reviewed/rejected draft.
      const asset = await repo.upsertAsset({
        assetId,
        contentItemId: candidate.contentItemId,
        sourceType: candidate.contentItemId ? 'content_item' : 'manual',
        sourceKey: candidate.key,
        assetType:
          candidate.assetType ??
          (candidate.media || candidate.mediaUrl ? 'single_image_post' : 'link_post'),
        providerFamily: family,
        title: candidate.title,
        bodyPlaintext: candidate.caption,
        captionText: candidate.caption,
        status:
          mode === 'autonomous' && !candidate.safeForAutonomousPublish
            ? 'review'
            : assetStatusForMode(mode),
        ctaUrl: trackedProviderCta(candidate.ctaUrl, account?.provider_name ?? 'social', candidate.key),
        metadata: {
          created_by_agent: 'jordan',
          researched_by_agent:
            candidate.evidence['research_agent'] === 'sofia' ? 'sofia' : null,
          proof_kind: candidate.kind,
          evidence: candidate.evidence,
          claim_boundary: 'observed_or_directional_no_ranking_guarantee',
          client_safe: true,
          client_proof_enabled: config.clientProofEnabled,
          audit_screenshots_enabled: config.auditScreenshotsEnabled,
          carousel_enabled: config.carouselEnabled,
          reels_enabled: config.reelsEnabled,
          industry_humor_enabled: config.industryHumorEnabled,
          trend_research_enabled: config.trendResearchEnabled,
          learning_enabled: config.learningEnabled,
          posting_hours_local: config.postingHoursLocal,
          visual_contract:
            account?.provider_name === 'instagram'
              ? 'instagram_4x5_feed_and_profile_grid_safe'
              : 'provider_ready',
          reel_publish_contract:
            'Reels require 1080x1920, reel_9x16_center_safe metadata, and a recorded Meta preview approval.',
        },
      });
      assetsCreated += 1;

      if (candidate.media && candidate.media.length > 0) {
        await repo.replaceAssetMedia(
          asset.id,
          candidate.media.map((row) => ({
            mediaKind: row.mediaKind,
            storageUrl: row.storageUrl,
            mimeType: row.mimeType,
            altText: row.altText,
            sortOrder: row.sortOrder,
            providerReadyStatus: 'ready',
            metadata: {
              ...row.metadata,
              proof_kind: candidate.kind,
              source: 'jordan_original_render',
            },
          }))
        );
      } else if (candidate.mediaUrl) {
        await repo.replaceAssetMedia(asset.id, [
          {
            mediaKind: 'image',
            storageUrl: candidate.mediaUrl,
            mimeType: candidate.mediaMimeType,
            altText: candidate.mediaAlt,
            providerReadyStatus: 'ready',
            metadata: {
              proof_kind: candidate.kind,
              source: 'verified_editorial_hero',
              width: 1024,
              height: 1024,
              aspect_ratio: '1:1',
              safe_area_contract: 'central_80_percent',
            },
          },
        ]);
      }

      if (mode === 'autonomous' && candidateCanPublish(candidate, account) && account) {
        const jobId = `proof_job_${account.account_id}_${candidate.key}`
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .slice(0, 150);
        const existingJob = await repo.getJobByJobId(jobId);
        if (!existingJob) {
          await repo.createJob({
            jobId,
            distributionAssetId: asset.id,
            distributionAccountId: account.id,
            publishMode: account.provider_name === 'instagram' ? 'scheduled' : 'publish_now',
            scheduledFor:
              account.provider_name === 'instagram'
                ? instagramScheduleSlot(
                     now,
                     config.timezone,
                     config.postingHoursLocal[
                       Math.min(jobsCreated, config.postingHoursLocal.length - 1)
                     ] ?? 19
                   )
                : null,
            status: account.provider_name === 'instagram' ? 'scheduled' : 'queued',
          });
          jobsCreated += 1;
        }
      }
    }

    const result: SocialProofAgentResult = {
      status: assetsCreated > 0 ? 'created' : 'noop',
      mode,
      candidates: candidates.length,
      assetsCreated,
      jobsCreated,
      ...(candidates.length === 0 ? { reason: 'no_safe_candidates' } : {}),
    };
    await structuredLogWithClientAndWait(
      args.supabase,
      'social_proof_agent_run',
      {
        status: result.status,
        mode,
        candidates: result.candidates,
        assets_created: assetsCreated,
        jobs_created: jobsCreated,
        account_provider: account?.provider_name ?? null,
        trend_provider: trendProvider,
        trend_reason: trendReason,
        performance_checked: performanceLearning.checked,
        performance_updated: performanceLearning.updated,
        performance_failed: performanceLearning.failed,
      },
      'info'
    );
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    await structuredLogWithClientAndWait(
      args.supabase,
      'social_proof_agent_run',
      { status: 'failed', mode, reason },
      'error'
    );
    return {
      status: 'failed',
      mode,
      candidates: 0,
      assetsCreated: 0,
      jobsCreated: 0,
      reason,
    };
  }
}
