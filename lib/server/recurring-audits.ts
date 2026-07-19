/**
 * Recurring per-user site audits (Phase 3, migration 051).
 *
 * A granted user schedules their site to be re-audited on a cadence. A daily worker cron runs due
 * schedules via the same `runFreeScan` the product uses, persists a normal scan (run_source
 * 'recurring'), and advances the schedule. Pure schedule math is unit-tested.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import { GeminiProvider } from '../../workers/providers/gemini';
import type { LLMProvider } from '../../workers/lib/interfaces/providers';

export type Cadence = 'daily' | 'weekly';
export const CADENCE_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7 };

export type RecurringSchedule = {
  id: string;
  userId: string;
  startupWorkspaceId: string | null;
  url: string;
  cadence: Cadence;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
};

/** Next run = `from` + cadence days (pure; caller passes the clock). */
export function computeNextRun(cadence: Cadence, fromMs: number): string {
  const days = CADENCE_DAYS[cadence] ?? 7;
  return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();
}

type ScheduleRow = {
  id: string;
  user_id: string;
  startup_workspace_id: string | null;
  url: string;
  cadence: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
};

function toSchedule(r: ScheduleRow): RecurringSchedule {
  return {
    id: r.id,
    userId: r.user_id,
    startupWorkspaceId: r.startup_workspace_id,
    url: r.url,
    cadence: r.cadence === 'daily' ? 'daily' : 'weekly',
    enabled: Boolean(r.enabled),
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
  };
}

export async function loadUserSchedule(supabase: SupabaseClient, userId: string): Promise<RecurringSchedule | null> {
  const { data } = await supabase.from('recurring_audit_schedules').select('*').eq('user_id', userId).maybeSingle();
  return data ? toSchedule(data as ScheduleRow) : null;
}

/** Create/update the user's schedule. Sets next_run_at immediately when first enabled. */
export async function upsertUserSchedule(
  supabase: SupabaseClient,
  args: { userId: string; startupWorkspaceId: string | null; url: string; cadence: Cadence; enabled: boolean; nowMs: number }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('recurring_audit_schedules').upsert(
    {
      user_id: args.userId,
      startup_workspace_id: args.startupWorkspaceId,
      url: args.url,
      cadence: args.cadence,
      enabled: args.enabled,
      // Enabled → due now (first run on the next cron tick). Disabled → park far out.
      next_run_at: args.enabled ? new Date(args.nowMs).toISOString() : computeNextRun(args.cadence, args.nowMs),
      created_by: args.userId,
      updated_at: new Date(args.nowMs).toISOString(),
    },
    { onConflict: 'user_id' }
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type RecurringEnvLike = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
};

function buildLlm(env: RecurringEnvLike): LLMProvider {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    return { async analyze() { return { passed: false, reasoning: 'llm_not_configured', confidence: 'low' as const }; } };
  }
  return new GeminiProvider({
    GEMINI_API_KEY: key,
    GEMINI_MODEL: env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    GEMINI_ENDPOINT: env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models',
  });
}

export type RecurringSweepResult = { scanned: number; ran: number; failed: number };

/**
 * Run all due schedules (enabled + next_run_at <= now). Bounded per tick. Persists a scan and
 * advances the schedule. Safe no-op when nothing is due.
 */
export async function runDueRecurringAudits(args: {
  supabase: SupabaseClient;
  env: RecurringEnvLike;
  nowMs: number;
  limit?: number;
}): Promise<RecurringSweepResult> {
  const { supabase, env, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();
  const { data } = await supabase
    .from('recurring_audit_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', nowIso)
    .limit(args.limit ?? 25);

  const due = ((data ?? []) as ScheduleRow[]).map(toSchedule);
  const llm = buildLlm(env);
  let ran = 0;
  let failed = 0;

  for (const s of due) {
    try {
      const scan = await runFreeScan(s.url, llm);
      if (scan.ok) {
        await supabase.from('scans').insert({
          url: scan.finalUrl,
          domain: scan.domain,
          status: 'complete',
          score: scan.output.score,
          letter_grade: scan.output.letterGrade,
          issues_json: scan.output.issues,
          full_results_json: { issues: scan.output.issues, categoryScores: scan.output.categoryScores },
          user_id: s.userId,
          startup_workspace_id: s.startupWorkspaceId,
          run_source: 'recurring',
        });
        await supabase
          .from('recurring_audit_schedules')
          .update({ last_run_at: nowIso, next_run_at: computeNextRun(s.cadence, nowMs), last_error: null, updated_at: nowIso })
          .eq('id', s.id);
        ran += 1;
      } else {
        await supabase
          .from('recurring_audit_schedules')
          .update({ last_run_at: nowIso, next_run_at: computeNextRun(s.cadence, nowMs), last_error: scan.reason, updated_at: nowIso })
          .eq('id', s.id);
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      await supabase
        .from('recurring_audit_schedules')
        .update({ next_run_at: computeNextRun(s.cadence, nowMs), last_error: err instanceof Error ? err.message : 'error', updated_at: nowIso })
        .eq('id', s.id);
    }
  }

  return { scanned: due.length, ran, failed };
}
