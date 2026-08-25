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
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import { reserveProviderSpend } from './provider-spend-control';
import {
  classifyCampaignVertical,
  loadActiveGrowthCampaigns,
  type GrowthCampaign,
} from './growth-campaign-intelligence';
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
import {
  socialTrendToPriyaIdea,
  upsertPriyaResearchIdeas,
} from './priya-research-ideas';
import { collectInstagramPerformance } from './instagram-performance-agent';
import { structuredLogWithClientAndWait } from './structured-log';
import {
  buildJordanReelScript,
  chooseJordanReelSource,
  JORDAN_REEL_VALIDATION_VERSION,
  jordanReelAttemptKey,
  jordanReelSlotKey,
  resolveJordanReelConfig,
  shouldPlanJordanReel,
  type JordanReelCategory,
  type JordanReelPublishMode,
} from './jordan-reel-production';

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
  readonly reelsPerWeek: number;
  readonly reelDaysLocal: readonly number[];
  readonly reelCategories: readonly JordanReelCategory[];
  readonly reelPublishMode: JordanReelPublishMode;
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
  readonly queuedContentItemIds: readonly string[];
  readonly reason?: string;
};

export const SOCIAL_SEQUENCE_VERSION = 'social-flow-v1';

export type SocialSequenceAnchor = {
  readonly narrativeKind: SocialProofCandidate['kind'];
  readonly assetType: DistributionAssetType;
  readonly visualFamily: 'timely' | 'humor' | 'carousel' | 'proof' | 'educational';
};

export type SocialProductionEnv = SocialTrendEnv & {
  readonly BROWSER?: BrowserRunBinding;
  readonly REPORT_FILES?: SocialMediaBucket;
  readonly SOCIAL_MEDIA_PUBLIC_BASE?: string;
  readonly INSTAGRAM_GRAPH_API_BASE_URL?: string;
  readonly DISTRIBUTION_TOKEN_ENCRYPTION_KEY?: string;
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

type AssignedSocialRow = {
  readonly id: string;
  readonly content_id: string;
  readonly title: string;
  readonly brief_markdown: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly growth_campaign_id: string | null;
  readonly growth_intervention_id: string | null;
};

const CAMPAIGN_SOCIAL_VERTICALS = new Set([
  'msp_it_services',
  'managed_service_providers',
  'marketing_agencies',
]);

export function filterCampaignAssignedSocial<T extends {
  readonly metadata?: Record<string, unknown> | null;
}>(items: readonly T[]): T[] {
  return items.filter((item) => {
    const metadata = item.metadata ?? {};
    const campaignId = String(
      metadata['growth_campaign_id'] ?? metadata['campaign_id'] ?? metadata['campaign_key'] ?? '',
    ).trim();
    const vertical = String(metadata['campaign_vertical'] ?? metadata['vertical'] ?? '').trim();
    return Boolean(campaignId) && CAMPAIGN_SOCIAL_VERTICALS.has(vertical);
  });
}

export function growthCampaignForSocialCandidate(
  candidate: Pick<SocialProofCandidate, 'title' | 'caption' | 'evidence'>,
  campaigns: readonly GrowthCampaign[],
): GrowthCampaign | null {
  const explicitCampaignId = readString(candidate.evidence['growth_campaign_id']);
  const classification = classifyCampaignVertical({
    id: 'social-candidate',
    title: candidate.title,
    evidence: candidate.caption,
    metadata: candidate.evidence,
    growth_campaign_id: explicitCampaignId || null,
  });
  if (classification.vertical === 'background') return null;

  const campaign = explicitCampaignId
    ? campaigns.find((item) => item.id === explicitCampaignId)
    : campaigns.find((item) => item.vertical === classification.vertical);
  if (!campaign || campaign.vertical !== classification.vertical) return null;
  return campaign;
}

export function remainingDailyAssetCapacity(
  assets: readonly Pick<DistributionAssetRow, 'created_at' | 'metadata'>[],
  now: Date,
  dailyCap: number,
  timezone = 'UTC',
): number {
  const localDay = (value: Date): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const day = localDay(now);
  const createdToday = assets.filter((asset) => {
    const created = new Date(asset.created_at);
    return Number.isFinite(created.getTime())
      && localDay(created) === day
      && asset.metadata['created_by_agent'] === 'jordan';
  }).length;
  return Math.max(0, dailyCap - createdToday);
}

export function assignedSocialCandidate(
  item: AssignedSocialRow,
  appUrl: string,
): SocialProofCandidate | null {
  const metadata = item.metadata ?? {};
  const sourceUrl = typeof metadata['source_url'] === 'string' ? metadata['source_url'] : '';
  const recommendation = typeof metadata['recommendation'] === 'string'
    ? metadata['recommendation'].trim()
    : '';
  const evidence = typeof metadata['evidence'] === 'string'
    ? metadata['evidence'].trim()
    : '';
  if (!sourceUrl.startsWith('https://') || !recommendation || !evidence) return null;
  const caption = [
    item.title,
    '',
    recommendation,
    '',
    'The useful question is not whether AI search exists. It is whether your business is understood, cited, and recommended when buyers ask.',
    '',
    'Measure it at getgeopulse.com.',
  ].join('\n').slice(0, 1_900);
  return {
    key: `assigned-carousel-v2-${item.content_id}`,
    kind: 'carousel',
    title: item.title,
    caption,
    ctaUrl: `${appUrl.replace(/\/$/, '')}/ai-visibility-audit`,
    contentItemId: item.id,
    mediaUrl: null,
    mediaMimeType: null,
    mediaAlt: null,
    assetType: 'carousel_post',
    evidence: {
      source_url: sourceUrl,
      source_label: metadata['source_label'] ?? null,
      research_channel: metadata['research_channel'] ?? null,
      seo_family_key: metadata['seo_family_key'] ?? null,
      source_excerpt: evidence.slice(0, 800),
      intelligence_evidence_ids: Array.isArray(metadata['intelligence_evidence_ids'])
        ? metadata['intelligence_evidence_ids']
        : [],
      growth_campaign_id: item.growth_campaign_id ?? metadata['growth_campaign_id'] ?? null,
      growth_intervention_id:
        item.growth_intervention_id ?? metadata['growth_intervention_id'] ?? null,
      campaign_key: metadata['campaign_key'] ?? null,
      campaign_role: metadata['campaign_role'] ?? null,
      campaign_vertical: metadata['campaign_vertical'] ?? null,
      checklist_items: [
        'State the buyer question in plain language',
        'Put the direct answer near the top',
        'Support the claim with visible evidence',
        'Route the reader to one next action',
      ],
    },
    safeForAutonomousPublish: true,
  };
}

export function assignedSocialCandidates(
  item: AssignedSocialRow,
  appUrl: string,
): SocialProofCandidate[] {
  const primary = assignedSocialCandidate(item, appUrl);
  if (!primary) return [];

  const metadata = item.metadata ?? {};
  const recommendation = String(metadata['recommendation'] ?? '').trim();
  const evidence = String(metadata['evidence'] ?? '').trim();
  const sharedEvidence = {
    ...primary.evidence,
    source_excerpt: evidence.slice(0, 800),
  };

  return [
    primary,
    {
      ...primary,
      key: `assigned-carousel-evidence-v1-${item.content_id}`,
      title: `Proof before promise: ${item.title}`,
      caption: [
        `Proof before promise: ${item.title}`,
        '',
        evidence,
        '',
        'Use the source, show the limitation, and route the buyer to one measurable next action.',
        '',
        'Run a free GEO-Pulse scan — link in bio.',
      ].join('\n').slice(0, 1_900),
      evidence: {
        ...sharedEvidence,
        content_variant: 'evidence_before_claim',
        checklist_items: [
          'Name the buyer question precisely',
          evidence.slice(0, 100),
          'Separate observed evidence from inference',
          'Offer one measurable next action',
        ],
      },
    },
    {
      ...primary,
      key: `assigned-carousel-action-v1-${item.content_id}`,
      title: `Turn this MSP question into a clearer page`,
      caption: [
        'Turn this MSP question into a clearer page.',
        '',
        recommendation,
        '',
        'The goal is clarity and verifiable evidence—not a ranking or citation promise.',
        '',
        'Save the checklist, then run a free GEO-Pulse scan.',
      ].join('\n').slice(0, 1_900),
      evidence: {
        ...sharedEvidence,
        content_variant: 'buyer_question_to_action',
        checklist_items: [
          'Lead with the direct answer',
          recommendation.slice(0, 100),
          'Place visible proof beside the claim',
          'End with one concrete next step',
        ],
      },
    },
  ];
}

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
  const reel = resolveJordanReelConfig(config);
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
    reelsEnabled: reel.enabled,
    reelsPerWeek: reel.reelsPerWeek,
    reelDaysLocal: reel.daysLocal,
    reelCategories: reel.categories,
    reelPublishMode: reel.publishMode,
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
      source_url: `${appUrl.replace(/\/+$/, '')}/methodology/ai-search-readiness-audit`,
      source_type: 'first_party_methodology',
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

function candidateAssetType(candidate: SocialProofCandidate): DistributionAssetType {
  return candidate.assetType ??
    (candidate.media || candidate.mediaUrl ? 'single_image_post' : 'link_post');
}

export function socialSequenceDimensions(
  candidate: SocialProofCandidate,
): SocialSequenceAnchor & { readonly version: typeof SOCIAL_SEQUENCE_VERSION } {
  return {
    version: SOCIAL_SEQUENCE_VERSION,
    narrativeKind: candidate.kind,
    assetType: candidateAssetType(candidate),
    visualFamily: cardKind(candidate),
  };
}

export function socialSequenceMetadata(
  candidate: SocialProofCandidate,
  previous: SocialSequenceAnchor | null,
  runPosition: number,
): Record<string, unknown> {
  const current = socialSequenceDimensions(candidate);
  return {
    version: current.version,
    narrative_kind: current.narrativeKind,
    asset_format: current.assetType,
    visual_family: current.visualFamily,
    previous_narrative_kind: previous?.narrativeKind ?? null,
    previous_asset_format: previous?.assetType ?? null,
    previous_visual_family: previous?.visualFamily ?? null,
    run_position: runPosition,
  };
}

function isSocialProofKind(value: unknown): value is SocialProofCandidate['kind'] {
  return value === 'before_after' ||
    value === 'aggregate' ||
    value === 'educational' ||
    value === 'industry_humor' ||
    value === 'timely' ||
    value === 'carousel' ||
    value === 'proof_demo';
}

function visualFamilyForKind(
  kind: SocialProofCandidate['kind'],
): SocialSequenceAnchor['visualFamily'] {
  if (kind === 'industry_humor') return 'humor';
  if (kind === 'carousel') return 'carousel';
  if (kind === 'before_after' || kind === 'aggregate' || kind === 'proof_demo') {
    return 'proof';
  }
  return kind === 'timely' ? 'timely' : 'educational';
}

export function latestSocialSequenceAnchor(
  assets: ReadonlyArray<DistributionAssetRow>,
): SocialSequenceAnchor | null {
  const latest = [...assets]
    .filter((asset) =>
      asset.metadata['created_by_agent'] === 'jordan' &&
      asset.status !== 'failed' &&
      asset.status !== 'archived' &&
      isSocialProofKind(asset.metadata['proof_kind'])
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest) return null;

  const narrativeKind = latest.metadata['proof_kind'] as SocialProofCandidate['kind'];
  const sequence = readRecord(latest.metadata['content_sequence']);
  const visualFamily = sequence['visual_family'];
  return {
    narrativeKind,
    assetType: latest.asset_type,
    visualFamily:
      visualFamily === 'timely' ||
      visualFamily === 'humor' ||
      visualFamily === 'carousel' ||
      visualFamily === 'proof' ||
      visualFamily === 'educational'
        ? visualFamily
        : visualFamilyForKind(narrativeKind),
  };
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
  if (args.candidate.assetType === 'short_video_post') return args.candidate;
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
  // The distribution dispatcher runs on the hourly Worker cron. Store slots on
  // the hour so the time shown in the UI/database is a time we can actually
  // honor, instead of advertising :30 and dispatching at the following hour.
  const targetMinute = 0;
  const minuteBoundary = new Date(now);
  minuteBoundary.setUTCSeconds(0, 0);
  for (let minutes = 1; minutes <= 48 * 60; minutes += 1) {
    const candidate = new Date(minuteBoundary.getTime() + minutes * 60_000);
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

export function reserveInstagramScheduleSlot(
  desiredSlot: string,
  occupiedSlots: Set<string>
): string {
  let candidate = new Date(desiredSlot);
  candidate.setUTCMinutes(0, 0, 0);
  for (let hours = 0; hours < 48; hours += 1) {
    const slot = candidate.toISOString();
    if (!occupiedSlots.has(slot)) {
      occupiedSlots.add(slot);
      return slot;
    }
    candidate = new Date(candidate.getTime() + 60 * 60_000);
  }
  const fallback = candidate.toISOString();
  occupiedSlots.add(fallback);
  return fallback;
}

export function reserveInstagramCadenceSlot(
  desiredSlot: string,
  occupiedSlots: Set<string>,
  minimumGapHours = 18,
): string {
  let candidate = new Date(desiredSlot);
  candidate.setUTCMinutes(0, 0, 0);
  const minimumGapMs = minimumGapHours * 60 * 60_000;
  for (let days = 0; days < 21; days += 1) {
    const candidateMs = candidate.getTime();
    const hasNearbyPost = [...occupiedSlots].some((slot) => {
      const occupiedMs = Date.parse(slot);
      return Number.isFinite(occupiedMs)
        && Math.abs(occupiedMs - candidateMs) < minimumGapMs;
    });
    if (!hasNearbyPost) {
      const slot = candidate.toISOString();
      occupiedSlots.add(slot);
      return slot;
    }
    candidate = new Date(candidateMs + 24 * 60 * 60_000);
  }
  const fallback = candidate.toISOString();
  occupiedSlots.add(fallback);
  return fallback;
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

export function preferredAccount(accounts: ReadonlyArray<DistributionAccountRow>): DistributionAccountRow | null {
  const priority = ['instagram', 'linkedin', 'x', 'facebook', 'threads'];
  const rank = (provider: string): number => {
    const index = priority.indexOf(provider);
    return index === -1 ? priority.length : index;
  };
  return (
    [...accounts].sort(
      (a, b) => rank(a.provider_name) - rank(b.provider_name)
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
  historicalPerformance: ReadonlyMap<SocialProofCandidate['kind'], number> = new Map(),
  previous: SocialSequenceAnchor | null = null,
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
  const diversified: SocialProofCandidate[] = [];
  const remaining = [...ordered];
  let anchor = previous;
  while (remaining.length > 0) {
    let selectedIndex = 0;
    if (anchor) {
      selectedIndex = remaining
        .map((candidate, index) => {
          const dimensions = socialSequenceDimensions(candidate);
          return {
            index,
            sameNarrative: dimensions.narrativeKind === anchor?.narrativeKind ? 1 : 0,
            sameFormat: dimensions.assetType === anchor?.assetType ? 1 : 0,
            sameVisual: dimensions.visualFamily === anchor?.visualFamily ? 1 : 0,
          };
        })
        .sort((a, b) =>
          a.sameNarrative - b.sameNarrative ||
          a.sameFormat - b.sameFormat ||
          a.sameVisual - b.sameVisual ||
          a.index - b.index
        )[0]!.index;
    }
    const [selected] = remaining.splice(selectedIndex, 1);
    if (!selected) break;
    diversified.push(selected);
    anchor = socialSequenceDimensions(selected);
  }
  return diversified;
}

export function prioritizeRequiredFormatCandidates(
  candidates: ReadonlyArray<SocialProofCandidate>,
  requiredFormats: readonly string[] = [],
): SocialProofCandidate[] {
  const requiredAssetTypes = [...new Set(requiredFormats
    .filter((format) => format.startsWith('instagram:'))
    .map((format) => format.slice('instagram:'.length))
    .filter((format) => format !== 'short_video_post'))];
  if (requiredAssetTypes.length === 0) return [...candidates];

  const prioritized: SocialProofCandidate[] = [];
  const selected = new Set<SocialProofCandidate>();
  for (const assetType of requiredAssetTypes) {
    const candidate = candidates.find((item) =>
      !selected.has(item) &&
      (item.assetType ?? (item.media || item.mediaUrl ? 'single_image_post' : 'link_post')) === assetType
    );
    if (!candidate) continue;
    prioritized.push(candidate);
    selected.add(candidate);
  }
  return [...prioritized, ...candidates.filter((candidate) => !selected.has(candidate))];
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
  readonly campaignOnly?: boolean;
  /** Scheduled production must never create an unscoped asset. */
  readonly campaignScopeRequired?: boolean;
  /** Missing connected-channel formats that this run should replenish. */
  readonly requiredFormats?: readonly string[];
  /** The pre-run inventory verdict makes a zero-output noop unambiguous in incident logs. */
  readonly inventoryHealthyBefore?: boolean;
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
      queuedContentItemIds: [],
      reason: setting.killSwitch ? 'kill_switch' : 'disabled',
    };
  }

  try {
    const repo = createDistributionEngineRepository(args.supabase as never);
    const now = args.now ?? new Date();
    const [scanResult, contentResult, assignedSocialResult, accounts, existingAssets, activeCampaigns] = await Promise.all([
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
      args.supabase
        .from('content_items')
        .select('id,content_id,title,brief_markdown,metadata,created_at,growth_campaign_id,growth_intervention_id')
        .eq('content_type', 'social_post')
        .in('status', ['idea', 'brief', 'draft', 'approved'])
        .eq('metadata->>proposed_by', 'seo_agent')
        .order('created_at', { ascending: true })
        .limit(10),
      repo.listAccounts({ status: 'connected' }),
      repo.listAssets({ providerFamily: 'instagram' }),
      args.campaignScopeRequired ? loadActiveGrowthCampaigns(args.supabase as any) : Promise.resolve([]),
    ]);
    if (scanResult.error) throw scanResult.error;
    if (contentResult.error) throw contentResult.error;
    if (assignedSocialResult.error) throw assignedSocialResult.error;

    let performanceLearning = { checked: 0, updated: 0, failed: 0 };
    if (config.learningEnabled && accountProviderIsInstagram(accounts)) {
      try {
        performanceLearning = await collectInstagramPerformance({
          supabase: args.supabase,
          graphBaseUrl: args.env?.INSTAGRAM_GRAPH_API_BASE_URL,
          tokenEncryptionKey: args.env?.DISTRIBUTION_TOKEN_ENCRYPTION_KEY,
          now,
        });
      } catch {
        performanceLearning = { checked: 0, updated: 0, failed: 1 };
      }
    }

    const scans = (scanResult.data ?? []) as ScanRow[];
    const content = (contentResult.data ?? []) as ContentRow[];
    const allAssignedSocial = (assignedSocialResult.data ?? []) as AssignedSocialRow[];
    const assignedSocial = args.campaignOnly
      ? filterCampaignAssignedSocial(allAssignedSocial) : allAssignedSocial;
    const candidates: SocialProofCandidate[] = [];
    const opportunityIds = assignedSocial
      .map((item) => item.metadata?.['seo_opportunity_id'])
      .filter((value): value is string => typeof value === 'string' && Boolean(value));
    const proofIntelligence = opportunityIds.length > 0
      ? await retrieveIntelligenceEvidence(args.supabase, {
          platformInternal: true,
          sourceKinds: ['seo_opportunity'],
          sourceIds: opportunityIds,
          limit: 50,
        }).catch(() => ({
          status: 'insufficient_evidence' as const,
          evidence: [] as const,
          limitations: ['Continuous intelligence is pending.'],
        }))
      : {
          status: 'insufficient_evidence' as const,
          evidence: [] as const,
          limitations: ['No assigned SEO evidence exists.'],
        };
    const proofEvidenceByOpportunity = new Map<string, string[]>();
    for (const evidence of proofIntelligence.evidence) {
      proofEvidenceByOpportunity.set(evidence.sourceId, [
        ...(proofEvidenceByOpportunity.get(evidence.sourceId) ?? []),
        evidence.evidenceId,
      ]);
    }

    for (const item of assignedSocial) {
      const opportunityId = typeof item.metadata?.['seo_opportunity_id'] === 'string'
        ? item.metadata['seo_opportunity_id']
        : '';
      candidates.push(...assignedSocialCandidates({
        ...item,
        metadata: {
          ...(item.metadata ?? {}),
          intelligence_evidence_ids: proofEvidenceByOpportunity.get(opportunityId) ?? [],
        },
      }, args.appUrl));
    }

    if (!args.campaignOnly && config.beforeAfterEnabled) {
      const beforeAfter = buildBeforeAfterCandidate(scans, args.appUrl);
      if (beforeAfter) candidates.push(beforeAfter);
    }
    if (!args.campaignOnly && config.aggregateDataEnabled) {
      const aggregate = buildAggregateCandidate(scans, args.appUrl, config.minAggregateSampleSize);
      if (aggregate) candidates.push(aggregate);
    }
    if (!args.campaignOnly && config.educationalEnabled) {
      for (const item of content) {
        const candidate = buildEducationalCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    if (!args.campaignOnly && config.industryHumorEnabled) {
      for (const item of content) {
        const candidate = buildIndustryHumorCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    if (!args.campaignOnly && config.carouselEnabled) {
      for (const item of content) {
        const candidate = buildEducationalCarouselCandidate(item, args.appUrl);
        if (candidate) candidates.push(candidate);
      }
    }
    if (!args.campaignOnly) candidates.push(buildProductDemoCandidate(args.appUrl));

    let trendProvider: string | null = null;
    let trendReason: string | null = null;
    const recentSofiaResearch = existingAssets.some((asset) =>
      (asset.source_key ?? '').startsWith('sofia-')
      && now.getTime() - Date.parse(asset.created_at) < 20 * 3_600_000
    );
    if (!args.campaignOnly && config.trendResearchEnabled && args.env && !recentSofiaResearch) {
      const discovery = await discoverSocialTrends(args.env, now, (provider, estimatedCostUsd) =>
        reserveProviderSpend({
          db: args.supabase,
          provider,
          idempotencyKey: `social-trend:${provider}:${now.toISOString().slice(0, 10)}`,
          operation: 'daily_social_trend_research',
          estimatedCostUsd,
          metadata: { owner: 'Sofia', cadence: 'daily' },
        })
      );
      if (discovery.ok) {
        trendProvider = discovery.provider;
        await upsertPriyaResearchIdeas(
          args.supabase,
          discovery.ideas.map(socialTrendToPriyaIdea),
          now,
        );
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
    const occupiedInstagramSlots = new Set<string>();
    if (account?.provider_name === 'instagram') {
      const { data: scheduledJobs, error: scheduledJobsError } = await args.supabase
        .from('distribution_jobs')
        .select('scheduled_for')
        .eq('distribution_account_id', account.id)
        .in('status', ['draft', 'scheduled', 'queued', 'processing'])
        .gte('scheduled_for', now.toISOString());
      if (scheduledJobsError) throw scheduledJobsError;
      for (const job of scheduledJobs ?? []) {
        if (typeof job.scheduled_for !== 'string') continue;
        const slot = new Date(job.scheduled_for);
        slot.setUTCMinutes(0, 0, 0);
        occupiedInstagramSlots.add(slot.toISOString());
      }
    }
    const cadenceRecoveryRequired = args.requiredFormats?.some((format) =>
      format.startsWith('instagram:'),
    ) === true;
    const reserveInstagramSlot = (hourLocal: number): string => {
      const desiredSlot = instagramScheduleSlot(now, config.timezone, hourLocal);
      return cadenceRecoveryRequired
        ? reserveInstagramCadenceSlot(desiredSlot, occupiedInstagramSlots)
        : reserveInstagramScheduleSlot(desiredSlot, occupiedInstagramSlots);
    };
    const previousSequenceAnchor = latestSocialSequenceAnchor(existingAssets);
    const historicalPerformance = historicalPerformanceByKind(existingAssets);
    const baseOrderedCandidates = prioritizeRequiredFormatCandidates(
      orderAutonomousCandidates(
        candidates,
        mode === 'autonomous' ? historicalPerformance : new Map(),
        previousSequenceAnchor,
      ),
      args.requiredFormats,
    );
    const reelConfig = {
      enabled: config.reelsEnabled,
      reelsPerWeek: config.reelsPerWeek,
      daysLocal: config.reelDaysLocal,
      categories: config.reelCategories,
      publishMode: config.reelPublishMode,
    };
    const reelPlanEligible = account?.provider_name === 'instagram'
      ? shouldPlanJordanReel({
        now,
        timezone: config.timezone,
        config: reelConfig,
        existingAssets,
        coverageRequired: args.requiredFormats?.includes('instagram:short_video_post'),
      })
      : false;
    const reelSource =
      reelPlanEligible
        ? chooseJordanReelSource(baseOrderedCandidates, config.reelCategories, existingAssets)
        : null;
    const reelSlotKey = jordanReelSlotKey(now, config.timezone);
    const reelAttemptIndex = existingAssets.filter(
      (asset) => asset.asset_type === 'short_video_post' && asset.metadata['reel_slot_key'] === reelSlotKey,
    ).length;
    const reelCandidate: SocialProofCandidate | null = reelSource
      ? {
          ...reelSource,
          key: jordanReelAttemptKey(reelSlotKey, reelAttemptIndex),
          assetType: 'short_video_post',
          mediaUrl: null,
          mediaMimeType: null,
          mediaAlt: null,
          evidence: {
            ...reelSource.evidence,
            research_agent:
              reelSource.evidence['research_agent'] === 'sofia' ? 'sofia' : null,
            reel_slot_key: reelSlotKey,
            reel_script: buildJordanReelScript(reelSource),
            reel_template: 'diagnostic-kinetic-v1',
          },
          // Rendering, mobile previews, audio, duplication, and Meta validation must
          // complete before this can be promoted to an autonomous publish job.
          safeForAutonomousPublish: false,
        }
      : null;
    const orderedCandidates = reelCandidate
      ? [
          reelCandidate,
          ...prioritizeRequiredFormatCandidates(
            orderAutonomousCandidates(
              baseOrderedCandidates.filter((candidate) => candidate !== reelSource),
              historicalPerformance,
              socialSequenceDimensions(reelCandidate),
            ),
            args.requiredFormats,
          ),
        ]
      : baseOrderedCandidates;
    let assetsCreated = 0;
    let jobsCreated = 0;
    const queuedContentItemIds: string[] = [];
    const dailyCapacity = remainingDailyAssetCapacity(
      existingAssets,
      now,
      config.dailyCap,
      config.timezone,
    );
    let sequenceAnchor = previousSequenceAnchor;

    for (const rawCandidate of orderedCandidates) {
      if (assetsCreated >= dailyCapacity) break;
      const assetId = makeAssetId(rawCandidate, family);
      // A deterministic asset is immutable from the agent's perspective. Check before
      // rendering so retries never spend Browser Run time on an existing post.
      if (await repo.getAssetByAssetId(assetId)) continue;
      let candidate = rawCandidate;
      const explicitCampaignId = readString(candidate.evidence['growth_campaign_id']);
      const campaign = args.campaignScopeRequired
        ? growthCampaignForSocialCandidate(candidate, activeCampaigns)
        : activeCampaigns.find((item) => item.id === explicitCampaignId) ?? null;
      if (args.campaignScopeRequired && !campaign) continue;
      const growthCampaignId = explicitCampaignId || campaign?.id || null;
      const growthInterventionId = readString(candidate.evidence['growth_intervention_id']) || null;
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
      const sequenceDimensions = socialSequenceDimensions(candidate);
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
        status: candidate.assetType === 'short_video_post'
          ? 'draft'
          : mode === 'autonomous' && !candidate.safeForAutonomousPublish
            ? 'review'
            : assetStatusForMode(mode),
        ctaUrl: trackedProviderCta(candidate.ctaUrl, account?.provider_name ?? 'social', candidate.key),
        growthCampaignId,
        growthInterventionId,
        metadata: {
          created_by_agent: 'jordan',
          researched_by_agent:
            candidate.evidence['research_agent'] === 'sofia' ? 'sofia' : null,
          proof_kind: candidate.kind,
          content_sequence: socialSequenceMetadata(
            candidate,
            sequenceAnchor,
            assetsCreated + 1,
          ),
          evidence: candidate.evidence,
          claim_boundary: 'observed_or_directional_no_ranking_guarantee',
          growth_campaign_id: growthCampaignId,
          growth_intervention_id: growthInterventionId,
          campaign_key: candidate.evidence['campaign_key'] ?? campaign?.campaign_key ?? null,
          campaign_role: candidate.evidence['campaign_role'] ?? campaign?.role ?? null,
          campaign_vertical:
            candidate.evidence['campaign_vertical'] ?? campaign?.vertical ?? null,
          client_safe: true,
          client_proof_enabled: config.clientProofEnabled,
          audit_screenshots_enabled: config.auditScreenshotsEnabled,
          carousel_enabled: config.carouselEnabled,
          reels_enabled: config.reelsEnabled,
          reels_per_week: config.reelsPerWeek,
          reel_days_local: config.reelDaysLocal,
          reel_categories: config.reelCategories,
          reel_publish_mode: config.reelPublishMode,
          reel_slot_key: candidate.evidence['reel_slot_key'] ?? null,
          reel_script: candidate.evidence['reel_script'] ?? null,
          reel_template: candidate.evidence['reel_template'] ?? null,
          reel_render_status:
            candidate.assetType === 'short_video_post' ? 'pending' : null,
          reel_validation_version:
            candidate.assetType === 'short_video_post' ? JORDAN_REEL_VALIDATION_VERSION : null,
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
      sequenceAnchor = sequenceDimensions;

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

      if (
        candidate.assetType === 'short_video_post' &&
        account?.provider_name === 'instagram'
      ) {
        const jobId = `proof_job_${account.account_id}_${candidate.key}`
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .slice(0, 150);
        const existingJob = await repo.getJobByJobId(jobId);
        if (!existingJob) {
          const autonomousReel =
            mode === 'autonomous' && config.reelPublishMode === 'autonomous';
          await repo.createJob({
            jobId,
            distributionAssetId: asset.id,
            distributionAccountId: account.id,
            publishMode: autonomousReel ? 'scheduled' : 'draft',
            scheduledFor: autonomousReel
              ? reserveInstagramSlot(
                  config.postingHoursLocal[
                    Math.min(jobsCreated, config.postingHoursLocal.length - 1)
                  ] ?? 19
                )
              : null,
            // The renderer callback promotes this reservation only after every
            // fail-closed Reel validation passes.
            status: 'draft',
          });
          if (autonomousReel) jobsCreated += 1;
          if (autonomousReel && candidate.contentItemId) {
            queuedContentItemIds.push(candidate.contentItemId);
          }
        }
        continue;
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
                ? reserveInstagramSlot(
                    config.postingHoursLocal[
                      Math.min(jobsCreated, config.postingHoursLocal.length - 1)
                    ] ?? 19
                  )
                : null,
            status: account.provider_name === 'instagram' ? 'scheduled' : 'queued',
          });
          jobsCreated += 1;
          if (candidate.contentItemId) queuedContentItemIds.push(candidate.contentItemId);
        }
      }
    }

    const result: SocialProofAgentResult = {
      status: assetsCreated > 0 ? 'created' : 'noop',
      mode,
      candidates: candidates.length,
      assetsCreated,
      jobsCreated,
      queuedContentItemIds,
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
        inventory_healthy: args.inventoryHealthyBefore === true,
        account_provider: account?.provider_name ?? null,
        trend_provider: trendProvider,
        trend_reason: trendReason,
        performance_checked: performanceLearning.checked,
        performance_updated: performanceLearning.updated,
        performance_failed: performanceLearning.failed,
        reel_plan_eligible: reelPlanEligible,
        reel_plan_decision:
          account?.provider_name !== 'instagram'
            ? 'instagram_account_unavailable'
            : !reelPlanEligible
              ? 'schedule_or_inventory_gate'
              : reelSource
                ? 'planned'
                : 'no_grounded_source',
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
      queuedContentItemIds: [],
      reason,
    };
  }
}
