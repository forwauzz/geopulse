/**
 * Autonomous marketing autopilot (OSS-REFACTOR-PLAN.md Loop 5b).
 *
 * The measure → generate → schedule loop, built on the EXISTING content machine + distribution
 * engine + topic registry (no new tables):
 *   - MEASURE: coverage gaps in the 100-topic registry = topics where we have no content yet
 *     (a real "where are we invisible" proxy; a GPM visibility signal can be layered in later).
 *   - PROPOSE: create review-gated `content_items` BRIEFS for the next weak topics, capped per run.
 *     Briefs are `status:'brief'` — they surface in /dashboard/content for a human to draft, never
 *     auto-published. This is the "review the first batch before it runs unattended" guardrail.
 *   - SCHEDULE/POST: creating social distribution jobs needs a CONNECTED distribution account +
 *     write flags. With none connected, the autopilot reports `channelAccess: 'required'` — that is
 *     the one remaining external blocker (channel/tool access). Everything up to it runs.
 *
 * SAFETY: OFF by default (needs MARKETING_AUTOPILOT_ENABLED). Kill switch (MARKETING_AUTOPILOT_KILL)
 * overrides everything. Bounded by a per-run cap. Only creates review-gated drafts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildTopicRegistrySeedItems,
  loadTopicRegistryFromDisk,
  type TopicRegistrySeedItem,
} from './content-topic-registry-seed';
import { getTopicRegistryProgressSummary } from './content-topic-registry-progress';
import { configInt, loadAutomationSetting } from './automation-settings';

type SupabaseLike = { from(table: string): any };

export type MarketingAutopilotEnvLike = {
  MARKETING_AUTOPILOT_ENABLED?: string;
  MARKETING_AUTOPILOT_DAILY_CAP?: string;
  MARKETING_AUTOPILOT_HOUR_UTC?: string;
  MARKETING_AUTOPILOT_KILL?: string;
};

export const DEFAULT_AUTOPILOT_DAILY_CAP = 2;
export const DEFAULT_AUTOPILOT_HOUR_UTC = 13;
const BATCH_ORDER = ['batch_1', 'batch_2', 'batch_3'] as const;

export type MarketingAutopilotConfig = {
  enabled: boolean;
  killed: boolean;
  dailyCap: number;
  hourUtc: number;
};

function isTruthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

export function resolveMarketingAutopilotConfig(env: MarketingAutopilotEnvLike | undefined): MarketingAutopilotConfig {
  const capRaw = Number.parseInt(env?.MARKETING_AUTOPILOT_DAILY_CAP ?? '', 10);
  const dailyCap = Number.isFinite(capRaw) && capRaw > 0 ? Math.min(capRaw, 10) : DEFAULT_AUTOPILOT_DAILY_CAP;
  const hourRaw = Number.parseInt(env?.MARKETING_AUTOPILOT_HOUR_UTC ?? '', 10);
  const hourUtc = Number.isFinite(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : DEFAULT_AUTOPILOT_HOUR_UTC;
  return {
    enabled: isTruthy(env?.MARKETING_AUTOPILOT_ENABLED),
    killed: isTruthy(env?.MARKETING_AUTOPILOT_KILL),
    dailyCap,
    hourUtc,
  };
}

// ── Selection (pure) ─────────────────────────────────────────────────────────────
/** First batch (in registry order) that still has uncovered topics — where to focus next. */
export function selectNextBatch(
  batches: { readonly batch: string; readonly remaining_count: number }[]
): string | null {
  for (const b of BATCH_ORDER) {
    const row = batches.find((x) => x.batch === b);
    if (row && row.remaining_count > 0) return b;
  }
  return null;
}

/** From a batch's candidate briefs, drop ones already in the content machine and take top `cap`. */
export function selectProposalCandidates(
  candidates: TopicRegistrySeedItem[],
  existingSlugs: Set<string>,
  existingContentIds: Set<string>,
  cap: number
): TopicRegistrySeedItem[] {
  return candidates
    .filter((c) => !existingSlugs.has(c.slug) && !existingContentIds.has(c.content_id))
    .slice(0, Math.max(0, cap));
}

// ── Orchestration ────────────────────────────────────────────────────────────────
export type MarketingProposal = { slug: string; contentId: string; topicCluster: string; title: string };

export type MarketingAutopilotResult = {
  ok: boolean;
  status: 'proposed' | 'skipped' | 'noop' | 'failed';
  batch?: string;
  proposedCount?: number;
  proposals?: MarketingProposal[];
  /** 'required' = no connected distribution channel → cannot post (the external blocker). */
  channelAccess?: 'available' | 'required';
  reason?: string;
};

async function hasConnectedChannel(supabase: SupabaseLike): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('distribution_accounts')
      .select('id')
      .eq('status', 'connected')
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function runMarketingAutopilot(args: {
  supabase: SupabaseLike;
  env: MarketingAutopilotEnvLike;
  triggerSource: 'worker_cron' | 'admin_manual' | 'ci';
  force?: boolean;
}): Promise<MarketingAutopilotResult> {
  const { supabase, env } = args;
  const cfg = resolveMarketingAutopilotConfig(env);

  // DB toggle (Automation console) OR the env flag can enable/kill; the DB cap overrides the env cap.
  const setting = await loadAutomationSetting(supabase as unknown as SupabaseClient, 'marketing_autopilot');
  const killed = cfg.killed || setting.killSwitch;
  const enabled = cfg.enabled || setting.enabled;
  const dailyCap = configInt(setting.config, 'daily_cap', cfg.dailyCap);

  if (killed) return { ok: false, status: 'skipped', reason: 'kill_switch' };
  if (!args.force && !enabled) return { ok: false, status: 'skipped', reason: 'disabled' };

  // Whether we could post is orthogonal to whether we can PROPOSE content — report it either way.
  const channelAccess: 'available' | 'required' = (await hasConnectedChannel(supabase)) ? 'available' : 'required';

  let progress: Awaited<ReturnType<typeof getTopicRegistryProgressSummary>>;
  try {
    progress = await getTopicRegistryProgressSummary(supabase);
  } catch (err) {
    return { ok: false, status: 'failed', channelAccess, reason: err instanceof Error ? err.message : 'progress_read_failed' };
  }

  const batch = selectNextBatch(progress.batches);
  if (!batch) return { ok: true, status: 'noop', channelAccess, reason: 'all_topics_covered' };

  const registry = await loadTopicRegistryFromDisk();
  const candidates = buildTopicRegistrySeedItems(registry, batch as 'batch_1' | 'batch_2' | 'batch_3');

  const slugs = candidates.map((c) => c.slug);
  const contentIds = candidates.map((c) => c.content_id);
  const [bySlug, byId] = await Promise.all([
    supabase.from('content_items').select('slug').in('slug', slugs),
    supabase.from('content_items').select('content_id').in('content_id', contentIds),
  ]);
  const existingSlugs = new Set<string>(((bySlug.data ?? []) as { slug?: string }[]).map((r) => r.slug ?? '').filter(Boolean));
  const existingIds = new Set<string>(((byId.data ?? []) as { content_id?: string }[]).map((r) => r.content_id ?? '').filter(Boolean));

  const picks = selectProposalCandidates(candidates, existingSlugs, existingIds, dailyCap);
  if (picks.length === 0) return { ok: true, status: 'noop', batch, channelAccess, reason: 'no_new_topics_in_batch' };

  const rows = picks.map((p) => ({
    ...p,
    metadata: { ...p.metadata, proposed_by: 'marketing_autopilot', trigger_source: args.triggerSource },
    created_by_user_id: null,
  }));
  const { error } = await supabase.from('content_items').insert(rows);
  if (error) {
    return { ok: false, status: 'failed', batch, channelAccess, reason: error.message };
  }

  return {
    ok: true,
    status: 'proposed',
    batch,
    proposedCount: picks.length,
    proposals: picks.map((p) => ({ slug: p.slug, contentId: p.content_id, topicCluster: p.topic_cluster, title: p.title })),
    channelAccess,
  };
}
