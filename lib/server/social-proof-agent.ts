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
  type DistributionProviderFamily,
} from './distribution-engine-repository';
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
  readonly minAggregateSampleSize: number;
  readonly timezone: string;
  readonly morningHourLocal: number;
  readonly eveningHourLocal: number;
};

export type SocialProofCandidate = {
  readonly key: string;
  readonly kind: 'before_after' | 'aggregate' | 'educational' | 'industry_humor';
  readonly title: string;
  readonly caption: string;
  readonly ctaUrl: string;
  readonly contentItemId: string | null;
  readonly mediaUrl: string | null;
  readonly mediaMimeType: string | null;
  readonly mediaAlt: string | null;
  readonly evidence: Record<string, string | number | boolean | null>;
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
    dailyCap: readPositiveInt(config, 'daily_cap', 2, 5),
    beforeAfterEnabled: readBoolean(config, 'before_after_enabled', true),
    auditScreenshotsEnabled: readBoolean(config, 'audit_screenshots_enabled', false),
    aggregateDataEnabled: readBoolean(config, 'aggregate_data_enabled', true),
    educationalEnabled: readBoolean(config, 'educational_enabled', true),
    industryHumorEnabled: readBoolean(config, 'industry_humor_enabled', true),
    clientProofEnabled: readBoolean(config, 'client_proof_enabled', false),
    carouselEnabled: readBoolean(config, 'carousel_enabled', true),
    reelsEnabled: readBoolean(config, 'reels_enabled', false),
    minAggregateSampleSize: readPositiveInt(config, 'min_aggregate_sample_size', 20, 500),
    timezone:
      typeof config['timezone'] === 'string' && config['timezone'].trim()
        ? config['timezone'].trim()
        : 'America/Toronto',
    morningHourLocal: readHour(config, 'morning_hour_local', 9),
    eveningHourLocal: readHour(config, 'evening_hour_local', 17),
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
    // Safe claim, but media must still be supplied/reviewed before a visual post can ship.
    safeForAutonomousPublish: false,
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
    safeForAutonomousPublish: false,
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
  const current = localParts(now, timezone);
  const targetMinute = 30;
  const targetPassed =
    current.hour > hourLocal || (current.hour === hourLocal && current.minute >= targetMinute);
  if (targetPassed) return new Date(now.getTime() + 2 * 60_000).toISOString();
  for (let minutes = 0; minutes <= 24 * 60; minutes += 5) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const local = localParts(candidate, timezone);
    if (
      local.year === current.year &&
      local.month === current.month &&
      local.day === current.day &&
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
    return Boolean(candidate.mediaUrl && candidate.mediaMimeType === 'image/jpeg');
  }
  return true;
}

export async function runSocialProofAgent(args: {
  readonly supabase: SupabaseClient;
  readonly appUrl: string;
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
    const [scanResult, contentResult, accounts] = await Promise.all([
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
    ]);
    if (scanResult.error) throw scanResult.error;
    if (contentResult.error) throw contentResult.error;

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

    const account = preferredAccount(accounts);
    const family = providerFamily(account);
    const safeEducational = candidates.filter(
      (candidate) => candidate.safeForAutonomousPublish && candidate.kind === 'educational'
    );
    const safeHumor = candidates.filter(
      (candidate) => candidate.safeForAutonomousPublish && candidate.kind === 'industry_humor'
    );
    const interleavedSafe = safeEducational.flatMap((candidate, index) => [
      candidate,
      ...(safeHumor[index] ? [safeHumor[index]!] : []),
    ]);
    const orderedCandidates =
      mode === 'autonomous'
        ? [
            ...interleavedSafe,
            ...candidates.filter((candidate) => !interleavedSafe.includes(candidate)),
          ]
        : candidates;
    let assetsCreated = 0;
    let jobsCreated = 0;

    for (const candidate of orderedCandidates) {
      if (assetsCreated >= config.dailyCap) break;
      const assetId = makeAssetId(candidate, family);
      // A deterministic asset is immutable from the agent's perspective. This both rotates
      // through the candidate pool on later runs and prevents a mode change from silently
      // promoting a previously reviewed/rejected draft.
      if (await repo.getAssetByAssetId(assetId)) continue;
      const asset = await repo.upsertAsset({
        assetId,
        contentItemId: candidate.contentItemId,
        sourceType: candidate.contentItemId ? 'content_item' : 'manual',
        sourceKey: candidate.key,
        assetType: candidate.mediaUrl ? 'single_image_post' : 'link_post',
        providerFamily: family,
        title: candidate.title,
        bodyPlaintext: candidate.caption,
        captionText: candidate.caption,
        status: assetStatusForMode(mode),
        ctaUrl: trackedProviderCta(candidate.ctaUrl, account?.provider_name ?? 'social', candidate.key),
        metadata: {
          created_by_agent: 'social_proof_agent',
          proof_kind: candidate.kind,
          evidence: candidate.evidence,
          claim_boundary: 'observed_or_directional_no_ranking_guarantee',
          client_safe: true,
          client_proof_enabled: config.clientProofEnabled,
          audit_screenshots_enabled: config.auditScreenshotsEnabled,
          carousel_enabled: config.carouselEnabled,
          reels_enabled: config.reelsEnabled,
          industry_humor_enabled: config.industryHumorEnabled,
        },
      });
      assetsCreated += 1;

      if (candidate.mediaUrl) {
        await repo.replaceAssetMedia(asset.id, [
          {
            mediaKind: 'image',
            storageUrl: candidate.mediaUrl,
            mimeType: candidate.mediaMimeType,
            altText: candidate.mediaAlt,
            providerReadyStatus: 'ready',
            metadata: { proof_kind: candidate.kind, source: 'verified_editorial_hero' },
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
                    args.now ?? new Date(),
                    config.timezone,
                    jobsCreated === 0 ? config.morningHourLocal : config.eveningHourLocal
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
