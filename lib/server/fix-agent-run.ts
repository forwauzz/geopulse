/**
 * A complete Fix Agent run: fresh audit → fixes → optionally the pull request, in one action.
 *
 * Before this, the agent read whatever audit happened to be newest and the user had to press a
 * second button to open the PR. Both halves are now one run, so "fix my site" is a single action.
 *
 * The fresh audit matters for more than convenience: fixes generated from a stale audit can
 * describe problems the user already solved, which is how an agent ends up opening a PR for work
 * that is already done.
 *
 * Auto-PR stays opt-in. Opening a pull request writes to someone's repository, so it happens only
 * when that user has explicitly authorized it (see fix-agent-auto-pr.ts) — and even then it only
 * ever opens a PR: never merges, and never overwrites a file that already exists.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import { GeminiProvider } from '../../workers/providers/gemini';
import type { LLMProvider } from '../../workers/lib/interfaces/providers';

/**
 * The audit's LLM. Without a Gemini key the checks that need one report "not configured" rather
 * than failing the run — the deterministic checks still produce a usable audit.
 */
export function buildAuditLlm(env: {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
}): LLMProvider {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    return {
      async analyze() {
        return { passed: false, reasoning: 'llm_not_configured', confidence: 'low' as const };
      },
    };
  }
  return new GeminiProvider({
    GEMINI_API_KEY: key,
    GEMINI_MODEL: env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    GEMINI_ENDPOINT:
      env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models',
  });
}

export type FixAgentAuditResult =
  | { ok: true; scanId: string; url: string; domain: string; score: number | null }
  | { ok: false; reason: string };

/**
 * Where to point the audit.
 *
 * The recurring schedule is the user's stated site, so it wins. Otherwise fall back to the domain
 * of their most recent audit — the site they were last looking at. Returning null rather than
 * guessing a URL keeps the agent from auditing something the user never asked about.
 */
export async function resolveFixAgentTargetUrl(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data: schedule } = await supabase
      .from('recurring_audit_schedules')
      .select('url')
      .eq('user_id', userId)
      .maybeSingle();
    const scheduled = (schedule?.url as string | undefined)?.trim();
    if (scheduled) return scheduled;
  } catch {
    /* fall through to the latest scan */
  }

  try {
    const { data: scan } = await supabase
      .from('scans')
      .select('url')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const url = (scan?.url as string | undefined)?.trim();
    return url || null;
  } catch {
    return null;
  }
}

/**
 * Run a fresh audit and persist it, so it becomes the newest scan the agent reads.
 *
 * `run_source` mirrors what a normal dashboard scan records rather than inventing a value: this is
 * a dashboard-initiated audit, just triggered from the agent instead of the form. The column is
 * NOT NULL with a CHECK list, so a Fix-Agent-specific source would need a migration to say
 * something the existing values already say correctly.
 */
export async function runFixAgentAudit(args: {
  readonly supabase: SupabaseClient;
  readonly llm: LLMProvider;
  readonly userId: string;
  readonly startupWorkspaceId?: string | null;
  /** Injected so a caller can audit an explicit URL instead of the resolved one. */
  readonly url?: string;
}): Promise<FixAgentAuditResult> {
  const target = args.url ?? (await resolveFixAgentTargetUrl(args.supabase, args.userId));
  if (!target) return { ok: false, reason: 'no_target' };

  const scan = await runFreeScan(target, args.llm);
  if (!scan.ok) return { ok: false, reason: scan.reason };

  try {
    const { data, error } = await args.supabase
      .from('scans')
      .insert({
        url: scan.finalUrl,
        domain: scan.domain,
        status: 'complete',
        score: scan.output.score,
        letter_grade: scan.output.letterGrade,
        issues_json: scan.output.issues,
        full_results_json: { issues: scan.output.issues, categoryScores: scan.output.categoryScores },
        user_id: args.userId,
        startup_workspace_id: args.startupWorkspaceId ?? null,
        run_source: args.startupWorkspaceId ? 'startup_dashboard' : 'public_self_serve',
      })
      .select('id')
      .single();

    const scanId = (data?.id as string | undefined) ?? null;
    if (error || !scanId) return { ok: false, reason: 'insert_failed' };

    return {
      ok: true,
      scanId,
      url: scan.finalUrl,
      domain: scan.domain,
      score: scan.output.score,
    };
  } catch {
    return { ok: false, reason: 'insert_failed' };
  }
}
