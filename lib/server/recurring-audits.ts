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
import {
  deliverSelfImprovementFromScan,
  isAutonomyOperator,
  loadSelfImprovementSettings,
  resolveSelfImprovementEnvConfig,
  type SelfImprovementEnvLike,
} from './self-improvement';

export type Cadence = 'daily' | 'weekly';

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./i, '').toLowerCase() === new URL(b).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return false;
  }
}
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
  /** Where the report is emailed; null → the account email. */
  reportEmail: string | null;
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
  report_email: string | null;
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
    reportEmail: r.report_email ?? null,
  };
}

export async function loadUserSchedule(supabase: SupabaseClient, userId: string): Promise<RecurringSchedule | null> {
  const { data } = await supabase.from('recurring_audit_schedules').select('*').eq('user_id', userId).maybeSingle();
  return data ? toSchedule(data as ScheduleRow) : null;
}

/** Create/update the user's schedule. Sets next_run_at immediately when first enabled. */
export async function upsertUserSchedule(
  supabase: SupabaseClient,
  args: { userId: string; startupWorkspaceId: string | null; url: string; cadence: Cadence; enabled: boolean; reportEmail?: string | null; nowMs: number }
): Promise<{ ok: boolean; error?: string }> {
  const reportEmail = args.reportEmail?.trim();
  const base = {
    user_id: args.userId,
    startup_workspace_id: args.startupWorkspaceId,
    url: args.url,
    cadence: args.cadence,
    enabled: args.enabled,
    // Enabled → due now (first run on the next cron tick). Disabled → park far out.
    next_run_at: args.enabled ? new Date(args.nowMs).toISOString() : computeNextRun(args.cadence, args.nowMs),
    created_by: args.userId,
    updated_at: new Date(args.nowMs).toISOString(),
  };
  const withEmail = { ...base, report_email: reportEmail && reportEmail.includes('@') ? reportEmail : null };
  let { error } = await supabase.from('recurring_audit_schedules').upsert(withEmail, { onConflict: 'user_id' });
  // Resilient to running before migration 052 (report_email column) is applied.
  if (error && /report_email/i.test(error.message)) {
    ({ error } = await supabase.from('recurring_audit_schedules').upsert(base, { onConflict: 'user_id' }));
  }
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Includes GEMINI (scan) + RESEND + SELF_IMPROVEMENT_* so a recurring audit of the self-improvement
// target can feed the improvement plan directly (one loop instead of two). NEXT_PUBLIC_APP_URL is
// used to build the results link in the per-run email.
export type RecurringEnvLike = SelfImprovementEnvLike & { NEXT_PUBLIC_APP_URL?: string };

/** Look up a user's email (for the per-run audit email). */
async function resolveUserEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
    const email = (data?.email as string | undefined) ?? null;
    return email && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/** Email the owner their fresh recurring audit with a link to the full report. Best-effort. */
async function sendRecurringAuditEmail(
  env: RecurringEnvLike,
  to: string,
  scanUrl: string,
  score: number,
  letterGrade: string,
  scanId: string
): Promise<void> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return;
  const base = (env.NEXT_PUBLIC_APP_URL?.trim() || 'https://getgeopulse.com').replace(/\/$/, '');
  const link = `${base}/results/${scanId}`;
  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">',
    '<h2 style="font-size:18px;margin:0 0 8px">Your scheduled GEO-Pulse audit is ready</h2>',
    `<p style="margin:0 0 4px;color:#555">${scanUrl}</p>`,
    `<p style="font-size:40px;font-weight:800;margin:8px 0;letter-spacing:-1px">${score}<span style="font-size:16px;color:#888">/100 · ${letterGrade}</span></p>`,
    `<p style="margin:16px 0"><a href="${link}" style="background:#111;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">View the full report</a></p>`,
    '<p style="font-size:12px;color:#999;margin-top:20px">You’re getting this because you set up a recurring audit. Manage it in your GEO-Pulse settings.</p>',
    '</div>',
  ].join('');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `GEO-Pulse audit: ${scanUrl} scored ${score}/100`, html }),
    });
  } catch {
    /* best-effort */
  }
}

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

export type RecurringSweepResult = { scanned: number; ran: number; failed: number; fedSelfImprovement: number };

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
  const selfCfg = resolveSelfImprovementEnvConfig(env);
  let ran = 0;
  let failed = 0;
  let fedSelfImprovement = 0;

  for (const s of due) {
    try {
      const scan = await runFreeScan(s.url, llm);
      if (scan.ok) {
        const { data: scanRow } = await supabase
          .from('scans')
          .insert({
            url: scan.finalUrl,
            domain: scan.domain,
            status: 'complete',
            score: scan.output.score,
            letter_grade: scan.output.letterGrade,
            issues_json: scan.output.issues,
            full_results_json: {
              issues: scan.output.issues,
              categoryScores: scan.output.categoryScores,
              pageSample: scan.textSample.slice(0, 6000),
            },
            user_id: s.userId,
            startup_workspace_id: s.startupWorkspaceId,
            run_source: 'recurring',
          })
          .select('id')
          .single();
        await supabase
          .from('recurring_audit_schedules')
          .update({ last_run_at: nowIso, next_run_at: computeNextRun(s.cadence, nowMs), last_error: null, updated_at: nowIso })
          .eq('id', s.id);
        ran += 1;

        // Email the owner their fresh audit (best-effort — never fails the run).
        const scanId = (scanRow?.id as string | undefined) ?? null;
        if (scanId) {
          try {
            const to = s.reportEmail || (await resolveUserEmail(supabase, s.userId));
            if (to) await sendRecurringAuditEmail(env, to, scan.finalUrl, scan.output.score, scan.output.letterGrade, scanId);
          } catch {
            /* email is best-effort */
          }
        }

        // ONE LOOP: when this schedule audits the self-improvement target and the owner is an
        // autonomy operator, feed the plan straight into self-improvement (no second scan).
        if (sameHost(scan.finalUrl, selfCfg.targetUrl)) {
          try {
            const settings = await loadSelfImprovementSettings(supabase);
            if (!settings.killSwitch && (await isAutonomyOperator(supabase, s.userId))) {
              await deliverSelfImprovementFromScan({
                supabase,
                env,
                triggerSource: 'ci',
                targetUrl: selfCfg.targetUrl,
                output: scan.output,
                domain: scan.domain,
                finalUrl: scan.finalUrl,
                recipient: settings.reportRecipient || selfCfg.envRecipient,
              });
              fedSelfImprovement += 1;
            }
          } catch {
            /* self-improvement feed is best-effort — never fails the audit */
          }
        }
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

  return { scanned: due.length, ran, failed, fedSelfImprovement };
}

/**
 * Run a user's schedule ONCE, immediately (the "Run now / test" button). Scans, saves, emails the
 * chosen recipient, and advances the schedule. Returns the new scan id on success.
 */
export async function runUserAuditNow(
  supabase: SupabaseClient,
  env: RecurringEnvLike,
  userId: string,
  nowMs: number
): Promise<{ ok: true; scanId: string } | { ok: false; reason: string }> {
  const schedule = await loadUserSchedule(supabase, userId);
  if (!schedule) return { ok: false, reason: 'no_schedule' };

  const scan = await runFreeScan(schedule.url, buildLlm(env));
  if (!scan.ok) return { ok: false, reason: scan.reason };

  const { data: scanRow } = await supabase
    .from('scans')
    .insert({
      url: scan.finalUrl,
      domain: scan.domain,
      status: 'complete',
      score: scan.output.score,
      letter_grade: scan.output.letterGrade,
      issues_json: scan.output.issues,
      full_results_json: { issues: scan.output.issues, categoryScores: scan.output.categoryScores },
      user_id: schedule.userId,
      startup_workspace_id: schedule.startupWorkspaceId,
      run_source: 'recurring',
    })
    .select('id')
    .single();

  const nowIso = new Date(nowMs).toISOString();
  await supabase
    .from('recurring_audit_schedules')
    .update({ last_run_at: nowIso, next_run_at: computeNextRun(schedule.cadence, nowMs), last_error: null, updated_at: nowIso })
    .eq('id', schedule.id);

  const scanId = (scanRow?.id as string | undefined) ?? null;
  if (!scanId) return { ok: false, reason: 'insert_failed' };

  const to = schedule.reportEmail || (await resolveUserEmail(supabase, userId));
  if (to) await sendRecurringAuditEmail(env, to, scan.finalUrl, scan.output.score, scan.output.letterGrade, scanId);
  return { ok: true, scanId };
}
