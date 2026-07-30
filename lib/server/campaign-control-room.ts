import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentStatus } from './agent-console';

export type CampaignLane = 'social' | 'email' | 'prospecting' | 'competitors' | 'benchmarks';
export type CampaignHealth = 'healthy' | 'attention' | 'blocked';

export type CampaignItem = {
  readonly id: string;
  readonly lane: CampaignLane;
  readonly name: string;
  readonly channel: string;
  readonly status: string;
  readonly health: CampaignHealth;
  readonly owner: string;
  readonly lastActivityAt: string | null;
  readonly nextActivityAt: string | null;
  readonly detail: string;
  readonly href: string;
};

export type ChiefOfStaffAction = {
  readonly key: string;
  readonly severity: 'now' | 'today' | 'watch';
  readonly owner: string;
  readonly resolution: 'agent' | 'approval' | 'external';
  readonly title: string;
  readonly detail: string;
  readonly playbook: string;
  readonly href: string;
};

export type CampaignControlRoom = {
  readonly generatedAt: string;
  readonly health: CampaignHealth;
  readonly summary: string;
  readonly actions: ChiefOfStaffAction[];
  readonly campaigns: CampaignItem[];
  readonly laneCounts: Record<CampaignLane, { total: number; attention: number; blocked: number }>;
  readonly cron: {
    readonly lastHeartbeatAt: string | null;
    readonly healthy: boolean;
    readonly expectedEvery: string;
  };
};

type Row = Record<string, unknown>;
type SupabaseLike = SupabaseClient<any, 'public', any>;

async function safeRows(query: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  try {
    const result = await query;
    return result.error ? [] : (result.data ?? []) as Row[];
  } catch {
    return [];
  }
}

function text(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function object(row: Row, key: string): Record<string, unknown> {
  const value = row[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isOperationsExcludedBenchmarkConfig(
  metadata: Record<string, unknown>,
): boolean {
  return metadata['operations_excluded'] === true;
}

export function completedBenchmarkSibling(
  failedRun: Record<string, unknown>,
  runs: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  if (text(failedRun, 'status') !== 'failed') return null;
  const querySetId = text(failedRun, 'query_set_id');
  const failedMetadata = object(failedRun, 'metadata');
  const identityKeys = [
    'domain_id',
    'run_mode',
    'schedule_window_utc',
    'schedule_query_set_name',
    'schedule_query_set_version',
  ] as const;
  if (!querySetId || identityKeys.some((key) => !text(failedMetadata, key))) return null;

  return runs.find((run) => {
    if (text(run, 'status') !== 'completed' || text(run, 'query_set_id') !== querySetId) return false;
    const metadata = object(run, 'metadata');
    if (!identityKeys.every((key) => text(metadata, key) === text(failedMetadata, key))) return false;
    const queryCount = metric(metadata['query_run_count']);
    return queryCount > 0 && metric(metadata['completed_query_count']) >= queryCount;
  }) ?? null;
}

function metric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function socialExperimentDetail(
  metadata: Record<string, unknown>,
  fallback: string,
): string {
  const stream = typeof metadata['creative_stream'] === 'string'
    ? metadata['creative_stream'].trim().replaceAll('-', ' ')
    : '';
  if (!stream) return fallback;

  const performance = metadata['instagram_performance'];
  if (!performance || typeof performance !== 'object' || Array.isArray(performance)) {
    return `${stream} stream · Performance tracking starts after publication.`;
  }
  const snapshot = performance as Record<string, unknown>;
  return [
    `${stream} stream`,
    `${metric(snapshot['views']).toLocaleString('en-US')} views`,
    `${metric(snapshot['reach']).toLocaleString('en-US')} reach`,
    `${metric(snapshot['saves']).toLocaleString('en-US')} saves`,
    `${metric(snapshot['shares']).toLocaleString('en-US')} shares`,
  ].join(' · ');
}

function isOlderThan(iso: string | null, nowMs: number, hours: number): boolean {
  if (!iso) return true;
  const value = Date.parse(iso);
  return !Number.isFinite(value) || nowMs - value > hours * 3_600_000;
}

function isPast(iso: string | null, nowMs: number, graceHours = 0): boolean {
  if (!iso) return false;
  const value = Date.parse(iso);
  return Number.isFinite(value) && value < nowMs - graceHours * 3_600_000;
}

function laneCounts(items: CampaignItem[]): CampaignControlRoom['laneCounts'] {
  const lanes: CampaignLane[] = ['social', 'email', 'prospecting', 'competitors', 'benchmarks'];
  return Object.fromEntries(lanes.map((lane) => {
    const rows = items.filter((item) => item.lane === lane);
    return [lane, {
      total: rows.length,
      attention: rows.filter((item) => item.health === 'attention').length,
      blocked: rows.filter((item) => item.health === 'blocked').length,
    }];
  })) as CampaignControlRoom['laneCounts'];
}

function remediationFor(campaign: CampaignItem): Pick<ChiefOfStaffAction, 'resolution' | 'playbook'> {
  const needsFounderAuthority =
    /connect|credential|api key|oauth|permission|billing|budget|legal|consent/i.test(campaign.detail);
  if (campaign.lane === 'email') {
    return {
      resolution: needsFounderAuthority ? 'approval' : 'agent',
      playbook: needsFounderAuthority
        ? 'Maya asks only for the missing provider authority. Jordan resumes and verifies delivery immediately after it is supplied.'
        : 'Jordan refreshes or retries the delivery automatically. Maya closes it only after the provider records publication.',
    };
  }
  if (campaign.lane === 'social') {
    return {
      resolution: needsFounderAuthority ? 'approval' : 'agent',
      playbook: needsFounderAuthority
        ? 'Maya asks only for the missing provider authority. Jordan resumes the schedule as soon as it is supplied.'
        : 'Jordan regenerates unsafe creative or retries a retryable delivery. Maya verifies the provider publication before the schedule is restored.',
    };
  }
  if (campaign.lane === 'prospecting') {
    return {
      resolution: campaign.detail.includes('HTTP 403') ? 'external' : 'agent',
      playbook: campaign.detail.includes('HTTP 403')
        ? 'Elena replaces or skips the blocked target rather than repeatedly hitting a site that refuses access.'
        : 'Elena retries transient fetch or delivery failures on the next outreach pass; Maya escalates repeated failures.',
    };
  }
  if (campaign.lane === 'competitors') {
    return {
      resolution: 'agent',
      playbook: 'Priya reruns the cohort measurement; Marcus takes over if the failure is infrastructure-related.',
    };
  }
  return {
    resolution: 'agent',
    playbook: campaign.owner === 'Priya'
      ? 'Priya launches the missing client measurement and confirms the first report was delivered.'
      : 'Marcus diagnoses the failed model run, retries safely, and records the replacement run before Maya closes the exception.',
  };
}

export function summarizeCampaignHealth(
  campaigns: readonly CampaignItem[],
  cronHealthy: boolean,
): Pick<CampaignControlRoom, 'health' | 'summary'> {
  const blocked = campaigns.filter((item) => item.health === 'blocked').length;
  const attention = campaigns.filter((item) => item.health === 'attention').length;
  const health: CampaignHealth = blocked > 0 || !cronHealthy
    ? 'blocked'
    : attention > 0
      ? 'attention'
      : 'healthy';

  if (health === 'healthy') {
    return {
      health,
      summary: `All ${campaigns.length} tracked campaign workflows are on schedule.`,
    };
  }

  const campaignSummary = `${blocked} blocked and ${attention} overdue or stale campaign workflow${blocked + attention === 1 ? '' : 's'}`;
  return {
    health,
    summary: cronHealthy
      ? `${campaignSummary} need an owner.`
      : `${campaignSummary}; the hourly scheduler heartbeat also needs immediate attention.`,
  };
}

export type RuntimeHealthSignal = {
  readonly consecutiveFailures: number;
  readonly lastRunAt: string | null;
  readonly lastStatus: 'success' | 'failed' | 'missing';
};

export function summarizeRuntimeHealth(
  logs: readonly Row[],
  event: string,
): RuntimeHealthSignal {
  const matches = logs.filter((row) => text(row, 'event') === event);
  if (matches.length === 0) {
    return { consecutiveFailures: 0, lastRunAt: null, lastStatus: 'missing' };
  }
  let consecutiveFailures = 0;
  for (const row of matches) {
    const failed = text(row, 'level') === 'error' || text(object(row, 'data'), 'status') === 'failed';
    if (!failed) break;
    consecutiveFailures += 1;
  }
  return {
    consecutiveFailures,
    lastRunAt: text(matches[0]!, 'created_at'),
    lastStatus: consecutiveFailures > 0 ? 'failed' : 'success',
  };
}

export async function loadCampaignControlRoom(args: {
  readonly supabase: SupabaseLike;
  readonly agents: readonly AgentStatus[];
  readonly now?: Date;
}): Promise<CampaignControlRoom> {
  const now = args.now ?? new Date();
  const nowMs = now.getTime();
  const since = new Date(nowMs - 45 * 86_400_000).toISOString();

  const [
    accounts,
    assets,
    jobs,
    content,
    deliveries,
    prospects,
    sends,
    benchmarkRuns,
    benchmarkDomains,
    gpmConfigs,
    gpmReports,
    logs,
    seoRuns,
    seoOpportunities,
    seoUsage,
    openWorkLoops,
  ] = await Promise.all([
    safeRows(args.supabase.from('distribution_accounts').select('id,provider_name,account_label,status,last_verified_at').order('updated_at', { ascending: false }).limit(50)),
    safeRows(args.supabase.from('distribution_assets').select('id,title,provider_family,asset_type,status,created_at,metadata').order('created_at', { ascending: false }).limit(100)),
    safeRows(args.supabase.from('distribution_jobs').select('id,distribution_asset_id,distribution_account_id,publish_mode,scheduled_for,status,destination_url,last_error,completed_at,created_at,updated_at').gte('created_at', since).order('created_at', { ascending: false }).limit(200)),
    safeRows(args.supabase.from('content_items').select('id,title,content_type,status,published_at,updated_at').eq('content_type', 'newsletter').order('updated_at', { ascending: false }).limit(100)),
    safeRows(args.supabase.from('content_distribution_deliveries').select('id,content_item_id,destination_type,destination_name,status,published_at,updated_at').order('updated_at', { ascending: false }).limit(300)),
    safeRows(args.supabase.from('outreach_prospects').select('id,email,name,company,url,cadence,enabled,last_run_at,next_run_at,last_error').order('next_run_at', { ascending: true }).limit(200)),
    safeRows(args.supabase.from('outreach_sends').select('id,prospect_id,sent_at,opened_at').gte('sent_at', since).order('sent_at', { ascending: false }).limit(400)),
    safeRows(args.supabase.from('benchmark_run_groups').select('id,query_set_id,label,status,started_at,completed_at,created_at,metadata').gte('created_at', since).order('created_at', { ascending: false }).limit(100)),
    safeRows(args.supabase.from('benchmark_domains').select('id,domain,metadata').order('updated_at', { ascending: false }).limit(500)),
    safeRows(args.supabase.from('client_benchmark_configs').select('id,topic,location,cadence,report_email,updated_at,metadata').order('updated_at', { ascending: false }).limit(200)),
    safeRows(args.supabase.from('gpm_reports').select('id,config_id,platform,generated_at').gte('generated_at', since).order('generated_at', { ascending: false }).limit(300)),
    safeRows(args.supabase.from('app_logs').select('event,level,created_at,data').gte('created_at', new Date(nowMs - 7 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(800)),
    safeRows(args.supabase.from('seo_agent_runs').select('id,status,reason,started_at,completed_at,month_spend_usd').order('started_at', { ascending: false }).limit(10)),
    safeRows(args.supabase.from('seo_opportunities').select('id,kind,status,priority,title,evidence,recommendation,metadata,last_seen_at').in('status', ['queued', 'in_progress']).order('priority', { ascending: true }).order('last_seen_at', { ascending: false }).limit(25)),
    safeRows(args.supabase.from('seo_api_usage').select('cost_usd,occurred_at').gte('occurred_at', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString())),
    safeRows(args.supabase.from('agent_work_loops').select('id,source_type,source_key,lane,owner,state,severity,title,detail,due_at,founder_required,blocker,metadata,updated_at').in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked']).limit(500)),
  ]);

  const accountById = new Map(accounts.map((row) => [text(row, 'id') ?? '', row]));
  const assetById = new Map(assets.map((row) => [text(row, 'id') ?? '', row]));
  const sendsByProspect = new Map<string, Row[]>();
  for (const send of sends) {
    const key = text(send, 'prospect_id') ?? '';
    sendsByProspect.set(key, [...(sendsByProspect.get(key) ?? []), send]);
  }
  const deliveriesByContent = new Map<string, Row[]>();
  for (const delivery of deliveries) {
    const key = text(delivery, 'content_item_id') ?? '';
    deliveriesByContent.set(key, [...(deliveriesByContent.get(key) ?? []), delivery]);
  }
  const reportsByConfig = new Map<string, Row[]>();
  for (const report of gpmReports) {
    const key = text(report, 'config_id') ?? '';
    reportsByConfig.set(key, [...(reportsByConfig.get(key) ?? []), report]);
  }

  const campaigns: CampaignItem[] = [];

  for (const loop of openWorkLoops.filter((row) => text(row, 'source_type') === 'runtime_incident')) {
    const metadata = object(loop, 'metadata');
    const configuredLane = text(metadata, 'campaign_lane');
    const lane: CampaignLane = (
      configuredLane === 'social'
      || configuredLane === 'email'
      || configuredLane === 'prospecting'
      || configuredLane === 'competitors'
      || configuredLane === 'benchmarks'
    ) ? configuredLane : 'benchmarks';
    const blocked = text(loop, 'state') === 'blocked' || loop['founder_required'] === true;
    campaigns.push({
      id: `runtime-incident:${text(loop, 'source_key') ?? text(loop, 'id') ?? crypto.randomUUID()}`,
      lane,
      name: text(loop, 'title') ?? 'Production runtime incident',
      channel: 'Engineering reliability',
      status: blocked ? 'engineering repair required' : 'automatic retry running',
      health: blocked ? 'blocked' : 'attention',
      owner: text(loop, 'owner') ?? 'Marcus',
      lastActivityAt: text(loop, 'updated_at'),
      nextActivityAt: text(loop, 'due_at'),
      detail: text(loop, 'blocker') ?? text(loop, 'detail') ?? 'Replacement success is pending.',
      href: '/admin/campaigns#loop-control',
    });
  }

  const socialAgent = args.agents.find((agent) => agent.key === 'social_proof');
  if (socialAgent?.enabled) {
    const runtime = summarizeRuntimeHealth(logs, 'social_proof_agent_run');
    const stale = isOlderThan(runtime.lastRunAt, nowMs, 3);
    const blocked = runtime.consecutiveFailures >= 2;
    campaigns.push({
      id: 'runtime:social-proof',
      lane: 'social',
      name: 'Sofia and Jordan production pipeline',
      channel: 'Research → creative → Instagram',
      status: blocked
        ? `${runtime.consecutiveFailures} consecutive failures`
        : runtime.lastStatus === 'failed'
          ? 'latest run failed'
          : stale
            ? 'runtime heartbeat stale'
            : 'running',
      health: blocked ? 'blocked' : runtime.lastStatus === 'failed' || stale ? 'attention' : 'healthy',
      owner: 'Jordan',
      lastActivityAt: runtime.lastRunAt,
      nextActivityAt: null,
      detail: blocked
        ? `The production agent failed ${runtime.consecutiveFailures} consecutive runs. Scheduled inventory may still publish, but new research and creative production are not healthy.`
        : runtime.lastStatus === 'failed'
          ? 'The latest production run failed. The next bounded retry must succeed before Maya closes this incident.'
          : stale
            ? 'No social production heartbeat was recorded in the expected window.'
            : 'The latest research and production run completed successfully.',
      href: '/admin/agents',
    });
  }

  for (const job of jobs) {
    const status = text(job, 'status') ?? 'unknown';
    const scheduledFor = text(job, 'scheduled_for');
    const updatedAt = text(job, 'updated_at') ?? text(job, 'created_at');
    const overdue = ['scheduled', 'queued'].includes(status) && isPast(scheduledFor, nowMs, 2);
    const stalled = status === 'processing' && isOlderThan(updatedAt, nowMs, 2);
    const failed = status === 'failed';
    const asset = assetById.get(text(job, 'distribution_asset_id') ?? '');
    const account = accountById.get(text(job, 'distribution_account_id') ?? '');
    const family = text(asset ?? {}, 'provider_family') ?? text(account ?? {}, 'provider_name') ?? 'distribution';
    const isEmail = family === 'newsletter' || family === 'email';
    const defaultDetail = overdue
      ? 'Scheduled delivery is overdue.'
      : stalled
        ? 'Publishing job is still processing.'
        : `${family} delivery job`;
    campaigns.push({
      id: `distribution:${text(job, 'id') ?? crypto.randomUUID()}`,
      lane: isEmail ? 'email' : 'social',
      name: text(asset ?? {}, 'title') ?? `${family} campaign`,
      channel: `${text(account ?? {}, 'account_label') ?? family}`,
      status,
      health: failed ? 'blocked' : overdue || stalled ? 'attention' : 'healthy',
      owner: 'Jordan',
      lastActivityAt: text(job, 'completed_at') ?? updatedAt,
      nextActivityAt: scheduledFor,
      detail: text(job, 'last_error') ?? (
        isEmail
          ? defaultDetail
          : socialExperimentDetail(object(asset ?? {}, 'metadata'), defaultDetail)
      ),
      href: '/dashboard/distribution',
    });
  }

  for (const item of content) {
    const type = text(item, 'content_type') ?? '';
    if (type !== 'newsletter') continue;
    const itemDeliveries = deliveriesByContent.get(text(item, 'id') ?? '') ?? [];
    const published = itemDeliveries.some((row) => text(row, 'status') === 'published');
    const latestDelivery = itemDeliveries[0];
    const deliveryStatus = text(latestDelivery ?? {}, 'status');
    const deliveryStale = Boolean(
      deliveryStatus &&
      !['published', 'archived'].includes(deliveryStatus) &&
      isOlderThan(text(latestDelivery ?? {}, 'updated_at'), nowMs, 48)
    );
    const ready = ['approved', 'published'].includes(text(item, 'status') ?? '');
    campaigns.push({
      id: `newsletter:${text(item, 'id') ?? crypto.randomUUID()}`,
      lane: 'email',
      name: text(item, 'title') ?? 'Newsletter',
      channel: itemDeliveries.map((row) => text(row, 'destination_name')).filter(Boolean).join(', ') || 'Newsletter',
      status: published ? 'published' : deliveryStatus ?? text(item, 'status') ?? 'draft',
      health: deliveryStale || ready && !published && isOlderThan(text(item, 'updated_at'), nowMs, 48) ? 'attention' : 'healthy',
      owner: 'Jordan',
      lastActivityAt: text(latestDelivery ?? {}, 'published_at') ?? text(latestDelivery ?? {}, 'updated_at') ?? text(item, 'published_at') ?? text(item, 'updated_at'),
      nextActivityAt: null,
      detail: published
        ? 'Newsletter delivery recorded.'
        : deliveryStale
          ? 'A newsletter draft was created at the provider but has not been sent.'
          : ready
            ? 'Ready content is waiting for a newsletter delivery.'
            : 'Editorial work in progress.',
      href: '/dashboard/content',
    });
  }

  for (const prospect of prospects) {
    if (prospect['enabled'] !== true) continue;
    const id = text(prospect, 'id') ?? '';
    const due = isPast(text(prospect, 'next_run_at'), nowMs, 2);
    const failed = Boolean(text(prospect, 'last_error'));
    const latestSend = sendsByProspect.get(id)?.[0];
    campaigns.push({
      id: `prospect:${id}`,
      lane: 'prospecting',
      name: text(prospect, 'company') ?? text(prospect, 'name') ?? text(prospect, 'email') ?? 'Prospect',
      channel: 'Email outreach',
      status: failed ? 'failed' : due ? 'overdue' : 'scheduled',
      health: failed ? 'blocked' : due ? 'attention' : 'healthy',
      owner: 'Elena',
      lastActivityAt: text(latestSend ?? {}, 'sent_at') ?? text(prospect, 'last_run_at'),
      nextActivityAt: text(prospect, 'next_run_at'),
      detail: text(prospect, 'last_error') ?? `${text(prospect, 'cadence') ?? 'monthly'} scorecard outreach`,
      href: '/admin/outreach',
    });
  }

  const cohortDomains = benchmarkDomains.filter((row) => {
    const value = object(row, 'metadata')['local_cohort'];
    return value === true || value === 'true';
  });
  const latestCohortLog = logs.find((row) => (text(row, 'event') ?? '').includes('competitor_cohort'));
  if (cohortDomains.length > 0) {
    campaigns.push({
      id: 'competitor:cohort',
      lane: 'competitors',
      name: 'Local competitor cohort',
      channel: `${cohortDomains.length} domains`,
      status: latestCohortLog && text(latestCohortLog, 'level') === 'error' ? 'failed' : 'scheduled',
      health: latestCohortLog && text(latestCohortLog, 'level') === 'error' ? 'blocked' : isOlderThan(text(latestCohortLog ?? {}, 'created_at'), nowMs, 8 * 24) ? 'attention' : 'healthy',
      owner: 'Priya',
      lastActivityAt: text(latestCohortLog ?? {}, 'created_at'),
      nextActivityAt: null,
      detail: 'Weekly observable-signal comparison across customer and competitor sites.',
      href: '/admin/competitors',
    });
  }

  const latestBenchmark = benchmarkRuns[0];
  if (latestBenchmark) {
    const fallback = completedBenchmarkSibling(latestBenchmark, benchmarkRuns);
    const status = fallback ? 'completed_with_provider_fallback' : text(latestBenchmark, 'status') ?? 'unknown';
    const lastAt = text(latestBenchmark, 'completed_at') ?? text(latestBenchmark, 'created_at');
    const fallbackModel = fallback ? text(object(fallback, 'metadata'), 'model_id') : null;
    const failedModel = fallback ? text(object(latestBenchmark, 'metadata'), 'model_id') : null;
    campaigns.push({
      id: `benchmark:${text(latestBenchmark, 'id') ?? 'latest'}`,
      lane: 'benchmarks',
      name: text(latestBenchmark, 'label') ?? 'AI visibility benchmark',
      channel: 'AI engines',
      status,
      health: fallback ? 'healthy' : status === 'failed' ? 'blocked' : ['running', 'queued'].includes(status) && isOlderThan(lastAt, nowMs, 8) ? 'attention' : isOlderThan(lastAt, nowMs, 36) ? 'attention' : 'healthy',
      owner: 'Marcus',
      lastActivityAt: lastAt,
      nextActivityAt: null,
      detail: fallback
        ? `Equivalent ${fallbackModel ?? 'supported provider'} sibling completed the full query set; ${failedModel ?? 'provider'} failure is non-blocking.`
        : 'Scheduled benchmark run across configured domains and query sets.',
      href: '/dashboard/benchmarks',
    });
  }

  const latestSeo = seoRuns[0];
  const seoSpend = seoUsage.reduce((sum, row) => sum + Number(row['cost_usd'] ?? 0), 0);
  campaigns.push({
    id: 'seo:autonomous-owner',
    lane: 'competitors',
    name: 'Autonomous SEO owner',
    channel: 'Google Search Console + DataForSEO',
    status: text(latestSeo ?? {}, 'status') ?? 'awaiting first run',
    health: text(latestSeo ?? {}, 'status') === 'failed'
      ? 'blocked'
      : isOlderThan(text(latestSeo ?? {}, 'started_at'), nowMs, 26)
        ? 'attention'
        : 'healthy',
    owner: 'Priya',
    lastActivityAt: text(latestSeo ?? {}, 'completed_at') ?? text(latestSeo ?? {}, 'started_at'),
    nextActivityAt: null,
    detail: `${seoOpportunities.length} owned opportunities; $${seoSpend.toFixed(4)} of the $10 monthly hard cap used.${text(latestSeo ?? {}, 'reason') ? ` ${text(latestSeo ?? {}, 'reason')}` : ''}`,
    href: '/admin/automation',
  });

  const workInProgressCaps: Record<string, number> = {
    seo: 25,
    social: 15,
    intelligence: 20,
    revenue: 20,
    campaign: 25,
  };
  for (const [lane, cap] of Object.entries(workInProgressCaps)) {
    const laneWork = openWorkLoops.filter((row) =>
      text(row, 'lane') === lane
      && text(row, 'source_type') !== 'seo_opportunity'
      && text(row, 'state') !== 'discovered'
    );
    if (laneWork.length <= cap) continue;
    const owners = new Map<string, number>();
    for (const row of laneWork) {
      const owner = text(row, 'owner') ?? 'Maya';
      owners.set(owner, (owners.get(owner) ?? 0) + 1);
    }
    const owner = [...owners.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Maya';
    const overBy = laneWork.length - cap;
    campaigns.push({
      id: `backlog:${lane}`,
      lane: lane === 'social' ? 'social' : lane === 'revenue' ? 'prospecting' : 'competitors',
      name: `${lane} work-in-progress limit`,
      channel: 'Closed-loop operations',
      status: `${laneWork.length} open; cap ${cap}`,
      health: laneWork.length >= cap * 2 ? 'blocked' : 'attention',
      owner,
      lastActivityAt: null,
      nextActivityAt: null,
      detail: `${overBy} items exceed the lane cap. Finish, merge, or explicitly dismiss existing work before admitting more.`,
      href: '/admin/campaigns#loop-control',
    });
  }

  for (const config of gpmConfigs) {
    if (isOperationsExcludedBenchmarkConfig(object(config, 'metadata'))) continue;

    const configReports = reportsByConfig.get(text(config, 'id') ?? '') ?? [];
    const latest = configReports[0];
    const cadence = text(config, 'cadence') ?? 'monthly';
    const staleHours = cadence === 'weekly' ? 8 * 24 : cadence === 'biweekly' ? 16 * 24 : 35 * 24;
    const lastAt = text(latest ?? {}, 'generated_at');
    campaigns.push({
      id: `gpm:${text(config, 'id') ?? crypto.randomUUID()}`,
      lane: 'benchmarks',
      name: `${text(config, 'topic') ?? 'Client'} · ${text(config, 'location') ?? 'market'}`,
      channel: 'Recurring AI visibility',
      status: lastAt ? 'measured' : 'awaiting first report',
      health: isOlderThan(lastAt, nowMs, staleHours) ? 'attention' : 'healthy',
      owner: 'Priya',
      lastActivityAt: lastAt ?? text(config, 'updated_at'),
      nextActivityAt: null,
      detail: `${cadence} client visibility report${text(config, 'report_email') ? ' with email delivery' : ' without a recipient'}.`,
      href: '/admin/geo-performance',
    });
  }

  const actions: ChiefOfStaffAction[] = campaigns
    .filter((campaign) => campaign.health !== 'healthy')
    .map((campaign) => {
      const remediation = remediationFor(campaign);
      return {
        key: campaign.id,
        severity: campaign.health === 'blocked' ? 'now' as const : 'today' as const,
        owner: campaign.owner,
        resolution: remediation.resolution,
        title: `${campaign.name}: ${campaign.status}`,
        detail: campaign.detail,
        playbook: remediation.playbook,
        href: campaign.href,
      };
    });

  for (const agent of args.agents) {
    if (agent.enabled && agent.blockers.length === 0) continue;
    actions.push({
      key: `agent:${agent.key}`,
      severity: agent.blockers.length > 0 ? 'now' : 'watch',
      owner: agent.key === 'social_proof' || agent.key === 'marketing_autopilot' ? 'Jordan' : 'Maya',
      resolution: 'agent',
      title: `${agent.name} ${agent.enabled ? 'is blocked' : 'is paused'}`,
      detail: agent.blockers.join(' ') || 'This capability is switched off.',
      playbook: agent.blockers.length > 0
        ? 'Maya routes the missing dependency or configuration to the named capability owner and verifies the next successful run.'
        : 'Maya confirms whether this pause is intentional before changing the switch.',
      href: '/admin/agents',
    });
  }

  for (const opportunity of seoOpportunities.slice(0, 5)) {
    const metadata = object(opportunity, 'metadata');
    const owner = text(metadata, 'owner') ?? (text(opportunity, 'kind') === 'technical' ? 'Marcus' : 'Jordan');
    actions.push({
      key: `seo-opportunity:${text(opportunity, 'id') ?? crypto.randomUUID()}`,
      severity: Number(opportunity['priority'] ?? 2) === 1 ? 'today' : 'watch',
      owner,
      resolution: 'agent',
      title: text(opportunity, 'title') ?? 'SEO opportunity',
      detail: text(opportunity, 'evidence') ?? 'Search evidence is available in the SEO queue.',
      playbook: `${text(opportunity, 'recommendation') ?? 'Review and execute the recommended SEO change.'} Maya verifies a new measurement before marking it complete.`,
      href: '/admin/automation',
    });
  }

  const heartbeat = logs.find((row) => text(row, 'event') === 'cron_stage');
  const heartbeatAt = text(heartbeat ?? {}, 'created_at');
  const cronHealthy = !isOlderThan(heartbeatAt, nowMs, 2);
  if (!cronHealthy) {
    actions.unshift({
      key: 'cron:heartbeat',
      severity: 'now',
      owner: 'Marcus',
      resolution: 'agent',
      title: 'Hourly campaign scheduler heartbeat is stale',
      detail: 'No cron-stage heartbeat was recorded in the last two hours. Check the deployed Worker trigger and logs.',
      playbook: 'Marcus checks the Cloudflare trigger and last completed stage, restores the scheduler, and waits for a fresh heartbeat before Maya closes the incident.',
      href: '/admin/logs',
    });
  }

  actions.sort((a, b) => ({ now: 0, today: 1, watch: 2 })[a.severity] - ({ now: 0, today: 1, watch: 2 })[b.severity]);
  const counts = laneCounts(campaigns);
  const campaignHealth = summarizeCampaignHealth(campaigns, cronHealthy);

  return {
    generatedAt: now.toISOString(),
    health: campaignHealth.health,
    summary: campaignHealth.summary,
    actions,
    campaigns,
    laneCounts: counts,
    cron: {
      lastHeartbeatAt: heartbeatAt,
      healthy: cronHealthy,
      expectedEvery: 'Hourly',
    },
  };
}
