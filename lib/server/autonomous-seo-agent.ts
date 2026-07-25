import { configInt, loadAutomationSetting } from './automation-settings';
import { decryptSeoToken, encryptSeoToken } from './seo-token-crypto';
import {
  fetchDataForSeoRankResult,
  fetchReadyDataForSeoTaskIds,
  fetchSearchConsoleRows,
  queueDataForSeoRanks,
  refreshGoogleSearchConsoleToken,
  type SearchConsoleRow,
} from './seo-providers';

type Db = { from(table: string): any };

export type SeoAgentEnv = {
  DATAFORSEO_LOGIN?: string;
  DATAFORSEO_PASSWORD?: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_ID?: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET?: string;
  SEO_TOKEN_ENCRYPTION_KEY?: string;
};

export type SeoAgentResult = {
  status: 'completed' | 'skipped' | 'failed';
  reason?: string;
  searchConsoleRows: number;
  rankTasksQueued: number;
  rankTasksCompleted: number;
  opportunitiesCreated: number;
  monthSpendUsd: number;
};

export type SeoOpportunityDraft = {
  key: string;
  kind: 'striking_distance' | 'high_impression_low_ctr' | 'content_gap';
  priority: 1 | 2 | 3;
  title: string;
  evidence: string;
  recommendation: string;
  owner: 'Jordan' | 'Marcus';
};

const ESTIMATED_STANDARD_SERP_COST_USD = 0.0006;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function hoursSince(value: string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(value).getTime()) / 3_600_000;
}

function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(config[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function affordableTaskCount(input: {
  spentUsd: number;
  hardBudgetUsd: number;
  requested: number;
  estimatedUnitCostUsd?: number;
}): number {
  const unit = input.estimatedUnitCostUsd ?? ESTIMATED_STANDARD_SERP_COST_USD;
  if (unit <= 0) return 0;
  const remaining = Math.max(0, input.hardBudgetUsd - input.spentUsd);
  return Math.max(0, Math.min(input.requested, Math.floor(remaining / unit)));
}

export function classifySearchConsoleOpportunity(row: SearchConsoleRow): SeoOpportunityDraft | null {
  if (row.position >= 4 && row.position <= 20 && row.impressions >= 10) {
    return {
      key: `striking-distance:${row.query.toLowerCase()}`,
      kind: 'striking_distance',
      priority: row.impressions >= 100 ? 1 : 2,
      title: `Move “${row.query}” onto page one`,
      evidence: `${row.impressions} impressions at average position ${row.position.toFixed(1)} with ${row.clicks} clicks.`,
      recommendation: `Improve the best matching page for “${row.query}”, strengthen its evidence and internal links, then measure the change.`,
      owner: 'Jordan',
    };
  }
  if (row.position > 0 && row.position <= 10 && row.impressions >= 20 && row.ctr < 0.03) {
    return {
      key: `low-ctr:${row.query.toLowerCase()}`,
      kind: 'high_impression_low_ctr',
      priority: row.impressions >= 100 ? 1 : 2,
      title: `Win more clicks for “${row.query}”`,
      evidence: `${row.impressions} impressions at position ${row.position.toFixed(1)}, but only ${(row.ctr * 100).toFixed(1)}% CTR.`,
      recommendation: `Rewrite the title and description around the searcher’s outcome, while keeping the page aligned with “${row.query}”.`,
      owner: 'Jordan',
    };
  }
  return null;
}

export function aggregateSearchConsoleRows(rows: readonly SearchConsoleRow[]): SearchConsoleRow[] {
  const grouped = new Map<string, {
    query: string;
    clicks: number;
    impressions: number;
    weightedPosition: number;
    fallbackPosition: number;
    rowCount: number;
    primaryPage: string | null;
    primaryPageImpressions: number;
  }>();
  for (const row of rows) {
    const key = row.query.trim().toLowerCase();
    if (!key) continue;
    const current = grouped.get(key) ?? {
      query: row.query.trim(),
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      fallbackPosition: 0,
      rowCount: 0,
      primaryPage: null,
      primaryPageImpressions: -1,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.position * row.impressions;
    current.fallbackPosition += row.position;
    current.rowCount += 1;
    if (row.impressions > current.primaryPageImpressions) {
      current.primaryPage = row.page;
      current.primaryPageImpressions = row.impressions;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()].map((row) => ({
    query: row.query,
    page: row.primaryPage,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.impressions > 0
      ? row.weightedPosition / row.impressions
      : row.fallbackPosition / Math.max(row.rowCount, 1),
  }));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

async function createOpportunity(
  db: Db,
  draft: SeoOpportunityDraft,
  keywordId: string | null,
  now: Date,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const { data: existing } = await db.from('seo_opportunities').select('id').eq('opportunity_key', draft.key).maybeSingle();
  const payload = {
    opportunity_key: draft.key,
    kind: draft.kind,
    priority: draft.priority,
    title: draft.title,
    evidence: draft.evidence,
    recommendation: draft.recommendation,
    keyword_id: keywordId,
    metadata: { ...metadata, owner: draft.owner },
    last_seen_at: now.toISOString(),
  };
  if (existing?.id) {
    await db.from('seo_opportunities').update(payload).eq('id', existing.id);
    return false;
  }
  const { error } = await db.from('seo_opportunities').insert({
    ...payload,
    status: 'queued',
    first_seen_at: now.toISOString(),
  });
  return !error;
}

async function proposeOneContentBrief(db: Db, now: Date): Promise<void> {
  const today = isoDate(now);
  const { data: already } = await db
    .from('content_items')
    .select('id')
    .eq('metadata->>proposed_by', 'seo_agent')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .limit(1);
  if (already?.length) return;

  const { data: opportunities } = await db
    .from('seo_opportunities')
    .select('id,title,evidence,recommendation,metadata,seo_keywords(keyword)')
    .eq('status', 'queued')
    // New articles are appropriate for a proven content gap. Striking-distance
    // and CTR opportunities belong on the existing ranking page, not in a
    // duplicate SEO blog post.
    .eq('kind', 'content_gap')
    .order('priority', { ascending: true })
    .order('last_seen_at', { ascending: false })
    .limit(1);
  const opportunity = opportunities?.[0];
  if (!opportunity?.id) return;
  const keyword = String(opportunity.seo_keywords?.keyword ?? opportunity.title);
  const slug = `seo-${slugify(keyword)}`;
  const contentId = `seo-agent:${slug}`;
  const { error } = await db.from('content_items').upsert({
    content_id: contentId,
    slug,
    title: opportunity.title,
    status: 'brief',
    content_type: 'article',
    target_persona: 'small_business_and_agency',
    primary_problem: opportunity.evidence,
    topic_cluster: keyword,
    keyword_cluster: keyword,
    cta_goal: 'free_scan',
    source_type: 'internal_plus_research',
    brief_markdown: `## Opportunity\n\n${opportunity.evidence}\n\n## Recommended angle\n\n${opportunity.recommendation}`,
    metadata: {
      proposed_by: 'seo_agent',
      seo_opportunity_id: opportunity.id,
      owner: opportunity.metadata?.owner ?? 'Jordan',
      requires_source_backed_editorial_review: true,
    },
  }, { onConflict: 'content_id' });
  if (!error) {
    await db.from('seo_opportunities').update({ status: 'in_progress' }).eq('id', opportunity.id);
  }
}

async function syncSearchConsole(input: {
  db: Db;
  env: SeoAgentEnv;
  connection: any;
  now: Date;
  siteUrl: string;
}): Promise<{ rows: number; opportunities: number }> {
  const key = input.env.SEO_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key || !input.connection?.access_token_encrypted) return { rows: 0, opportunities: 0 };
  let accessToken = await decryptSeoToken(input.connection.access_token_encrypted, key);
  if (hoursSince(input.connection.expires_at, input.now) > -0.08) {
    const refreshEncrypted = input.connection.refresh_token_encrypted;
    if (!refreshEncrypted || !input.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID || !input.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET) {
      throw new Error('search_console_refresh_credentials_missing');
    }
    const refreshed = await refreshGoogleSearchConsoleToken({
      clientId: input.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID,
      clientSecret: input.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET,
      refreshToken: await decryptSeoToken(refreshEncrypted, key),
    });
    accessToken = refreshed.accessToken;
    await input.db.from('seo_provider_connections').update({
      access_token_encrypted: await encryptSeoToken(accessToken, key),
      expires_at: new Date(input.now.getTime() + refreshed.expiresIn * 1000).toISOString(),
      status: 'connected',
      last_error: null,
      updated_at: input.now.toISOString(),
    }).eq('provider', 'google_search_console');
  }
  const end = new Date(input.now);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const rawRows = await fetchSearchConsoleRows({
    accessToken,
    siteUrl: input.siteUrl,
    startDate: isoDate(start),
    endDate: isoDate(end),
    rowLimit: 2_500,
  });
  const rows = aggregateSearchConsoleRows(rawRows);
  let opportunities = 0;
  for (const row of rows) {
    const { data: keyword } = await input.db.from('seo_keywords').upsert({
      keyword: row.query,
      source: 'search_console',
      priority: row.impressions >= 100 ? 1 : 2,
      cadence: row.impressions >= 20 ? 'daily' : 'weekly',
      metadata: { discovered_from: 'google_search_console' },
    }, { onConflict: 'normalized_keyword' }).select('id').single();
    if (!keyword?.id) continue;
    await input.db.from('seo_measurements').upsert({
      source: 'google_search_console',
      keyword_id: keyword.id,
      measured_on: isoDate(end),
      position: row.position,
      clicks: Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr: row.ctr,
      page_url: row.page,
      raw_summary: { window_start: isoDate(start), window_end: isoDate(end) },
    }, { onConflict: 'source,keyword_id,measured_on' });
    const draft = classifySearchConsoleOpportunity(row);
    if (draft && await createOpportunity(input.db, draft, keyword.id, input.now, { page_url: row.page })) opportunities += 1;
  }
  await input.db.from('seo_provider_connections').update({
    status: 'connected',
    last_synced_at: input.now.toISOString(),
    last_error: null,
    updated_at: input.now.toISOString(),
  }).eq('provider', 'google_search_console');
  return { rows: rawRows.length, opportunities };
}

async function completeReadyRankTasks(input: {
  db: Db;
  env: SeoAgentEnv;
  domain: string;
  now: Date;
}): Promise<{ completed: number; opportunities: number }> {
  const login = input.env.DATAFORSEO_LOGIN?.trim();
  const password = input.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) return { completed: 0, opportunities: 0 };
  const ids = (await fetchReadyDataForSeoTaskIds({ login, password })).slice(0, 25);
  if (!ids.length) return { completed: 0, opportunities: 0 };
  const { data: tasks } = await input.db
    .from('seo_rank_tasks')
    .select('id,provider_task_id,keyword_id,seo_keywords(keyword)')
    .eq('status', 'queued')
    .in('provider_task_id', ids)
    .limit(25);
  let completed = 0;
  let opportunities = 0;
  for (const task of tasks ?? []) {
    try {
      const result = await fetchDataForSeoRankResult({
        login,
        password,
        taskId: task.provider_task_id,
        domain: input.domain,
      });
      await input.db.from('seo_measurements').upsert({
        source: 'dataforseo_serp',
        keyword_id: task.keyword_id,
        measured_on: isoDate(input.now),
        position: result.position,
        page_url: result.pageUrl,
        competitors: result.competitors,
        raw_summary: { task_id: task.provider_task_id },
      }, { onConflict: 'source,keyword_id,measured_on' });
      await input.db.from('seo_rank_tasks').update({
        status: 'complete',
        completed_at: input.now.toISOString(),
        metadata: { competitors: result.competitors },
      }).eq('id', task.id);
      completed += 1;
      if (result.position === null && result.competitors.length > 0) {
        const keyword = String(task.seo_keywords?.keyword ?? '');
        const leadingCompetitor = result.competitors[0]!;
        const draft: SeoOpportunityDraft = {
          key: `content-gap:${keyword.toLowerCase()}`,
          kind: 'content_gap',
          priority: 1,
          title: `Close the competitor gap for “${keyword}”`,
          evidence: `${leadingCompetitor.domain} ranks #${leadingCompetitor.position}; getgeopulse.com is outside the measured top 10.`,
          recommendation: `Create or strengthen a source-backed page targeting “${keyword}” and differentiate it from the ranking competitors.`,
          owner: 'Jordan',
        };
        if (await createOpportunity(input.db, draft, task.keyword_id, input.now, { competitors: result.competitors })) opportunities += 1;
      }
    } catch (error) {
      await input.db.from('seo_rank_tasks').update({
        status: 'failed',
        completed_at: input.now.toISOString(),
        error: error instanceof Error ? error.message.slice(0, 500) : 'rank_result_failed',
      }).eq('id', task.id);
    }
  }
  return { completed, opportunities };
}

export async function runAutonomousSeoAgent(args: {
  supabase: Db;
  env: SeoAgentEnv;
  now?: Date;
  force?: boolean;
  runType?: 'hourly' | 'manual';
}): Promise<SeoAgentResult> {
  const now = args.now ?? new Date();
  const empty: SeoAgentResult = {
    status: 'skipped',
    searchConsoleRows: 0,
    rankTasksQueued: 0,
    rankTasksCompleted: 0,
    opportunitiesCreated: 0,
    monthSpendUsd: 0,
  };
  let setting;
  try {
    setting = await loadAutomationSetting(args.supabase as any, 'seo_agent');
  } catch {
    return { ...empty, reason: 'migration_required' };
  }
  if (setting.killSwitch) return { ...empty, reason: 'kill_switch' };
  if (!setting.enabled && !args.force) return { ...empty, reason: 'disabled' };

  const config = setting.config;
  const hardBudgetUsd = Math.min(configNumber(config, 'monthly_budget_usd', 10), 10);
  const dailyCap = Math.min(configInt(config, 'daily_keyword_cap', 100), 100);
  const gscHour = configInt(config, 'search_console_hour_utc', 10);
  const dfsHour = configInt(config, 'dataforseo_hour_utc', 11);
  const domain = String(config['domain'] ?? 'getgeopulse.com');
  const siteUrl = String(config['site_url'] ?? 'sc-domain:getgeopulse.com');
  const startedAt = now.toISOString();
  const { data: run } = await args.supabase.from('seo_agent_runs').insert({
    run_type: args.runType ?? (args.force ? 'manual' : 'hourly'),
    status: 'running',
    started_at: startedAt,
  }).select('id').single();

  try {
    const { data: usage } = await args.supabase
      .from('seo_api_usage')
      .select('cost_usd')
      .eq('provider', 'dataforseo')
      .gte('occurred_at', monthStart(now));
    let monthSpendUsd = (usage ?? []).reduce((sum: number, row: any) => sum + Number(row.cost_usd ?? 0), 0);
    let searchConsoleRows = 0;
    let opportunitiesCreated = 0;

    const { data: connection } = await args.supabase
      .from('seo_provider_connections')
      .select('*')
      .eq('provider', 'google_search_console')
      .maybeSingle();
    const shouldSyncGsc =
      Boolean(connection) &&
      (args.force || (now.getUTCHours() === gscHour && hoursSince(connection.last_synced_at, now) >= 20));
    if (shouldSyncGsc) {
      const synced = await syncSearchConsole({ db: args.supabase, env: args.env, connection, now, siteUrl });
      searchConsoleRows = synced.rows;
      opportunitiesCreated += synced.opportunities;
    }

    const ready = await completeReadyRankTasks({ db: args.supabase, env: args.env, domain, now });
    opportunitiesCreated += ready.opportunities;

    let rankTasksQueued = 0;
    const hasDfs = Boolean(args.env.DATAFORSEO_LOGIN?.trim() && args.env.DATAFORSEO_PASSWORD?.trim());
    const shouldQueue = hasDfs && (args.force || now.getUTCHours() === dfsHour);
    if (shouldQueue && monthSpendUsd < hardBudgetUsd) {
      const { data: keywords } = await args.supabase
        .from('seo_keywords')
        .select('id,keyword,cadence,last_checked_at,priority')
        .eq('active', true)
        .order('priority', { ascending: true })
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(dailyCap * 2);
      const due = (keywords ?? []).filter((keyword: any) =>
        hoursSince(keyword.last_checked_at, now) >= (keyword.cadence === 'daily' ? 20 : 144)
      );
      const count = affordableTaskCount({
        spentUsd: monthSpendUsd,
        hardBudgetUsd,
        requested: Math.min(due.length, dailyCap, 100),
      });
      const selected = due.slice(0, count);
      if (selected.length) {
        const queued = await queueDataForSeoRanks({
          login: args.env.DATAFORSEO_LOGIN!,
          password: args.env.DATAFORSEO_PASSWORD!,
          domain,
          keywords: selected.map((keyword: any) => ({ keywordId: keyword.id, keyword: keyword.keyword })),
        });
        const accepted = queued.filter((task) => task.id && task.statusCode >= 20_000 && task.statusCode < 30_000);
        if (queued.length > 0 && accepted.length === 0) {
          const providerSummary = queued
            .slice(0, 3)
            .map((task) => `${task.statusCode}:${task.statusMessage}`)
            .join('|');
          throw new Error(`dataforseo_tasks_rejected:${providerSummary || 'unknown_provider_response'}`);
        }
        if (accepted.length) {
          await args.supabase.from('seo_rank_tasks').insert(accepted.map((task) => ({
            provider_task_id: task.id,
            keyword_id: task.keywordId,
            status: 'queued',
            cost_usd: task.cost,
          })));
          await args.supabase.from('seo_api_usage').insert({
            provider: 'dataforseo',
            operation: 'serp_google_organic_standard',
            request_count: accepted.length,
            cost_usd: accepted.reduce((sum, task) => sum + task.cost, 0),
            metadata: { hard_budget_usd: hardBudgetUsd, estimated_unit_cost_usd: ESTIMATED_STANDARD_SERP_COST_USD },
          });
          for (const task of accepted) {
            await args.supabase.from('seo_keywords').update({ last_checked_at: now.toISOString() }).eq('id', task.keywordId);
          }
          rankTasksQueued = accepted.length;
          monthSpendUsd += accepted.reduce((sum, task) => sum + task.cost, 0);
        }
      }
    }

    await proposeOneContentBrief(args.supabase, now);
    const result: SeoAgentResult = {
      status: 'completed',
      searchConsoleRows,
      rankTasksQueued,
      rankTasksCompleted: ready.completed,
      opportunitiesCreated,
      monthSpendUsd,
    };
    if (run?.id) {
      await args.supabase.from('seo_agent_runs').update({
        status: 'completed',
        search_console_rows: searchConsoleRows,
        rank_tasks_queued: rankTasksQueued,
        rank_tasks_completed: ready.completed,
        opportunities_created: opportunitiesCreated,
        month_spend_usd: monthSpendUsd,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    }
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'seo_agent_failed';
    if (run?.id) {
      await args.supabase.from('seo_agent_runs').update({
        status: 'failed',
        reason: reason.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    }
    return { ...empty, status: 'failed', reason };
  }
}
