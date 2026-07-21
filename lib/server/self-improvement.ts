/**
 * Admin-only autonomous self-improvement (OSS-REFACTOR-PLAN.md Loop 5a).
 *
 * getgeopulse.com audits ITSELF → records a run → emails the report (the actionable improvement
 * plan) to the admin. A later, external headless coding-agent runtime consumes the plan and ships
 * small fixes under self-gates (see scripts/autonomous-ship.mjs + .claude/commands/auto-ship.md).
 *
 * SAFETY: everything is OFF by default. The daily loop runs only when BOTH the env flag
 * (SELF_IMPROVEMENT_ENABLED) and the DB `self_improvement_settings.enabled` are on, a recipient
 * is set, and the DB `kill_switch` is false. The kill switch overrides everything.
 *
 * Pure helpers (config/plan/report) are unit-tested; the orchestration touches Supabase + Resend.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan, type FreeScanOutput, type ScanIssueJson } from '../../workers/scan-engine/run-scan';
import { GeminiProvider } from '../../workers/providers/gemini';
import type { LLMProvider } from '../../workers/lib/interfaces/providers';

export const DEFAULT_SELF_IMPROVEMENT_TARGET = 'https://getgeopulse.com/';
export const DEFAULT_SELF_IMPROVEMENT_HOUR_UTC = 12;

export type SelfImprovementEnvLike = {
  SELF_IMPROVEMENT_ENABLED?: string;
  SELF_IMPROVEMENT_TARGET_URL?: string;
  SELF_IMPROVEMENT_HOUR_UTC?: string;
  SELF_IMPROVEMENT_REPORT_TO?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export type SelfImprovementEnvConfig = {
  /** env flag on (SELF_IMPROVEMENT_ENABLED truthy). DB `enabled` is checked separately. */
  envEnabled: boolean;
  targetUrl: string;
  hourUtc: number;
  /** recipient from env (DB `report_recipient` takes precedence when present). */
  envRecipient: string | null;
};

function isTruthyFlag(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

export function resolveSelfImprovementEnvConfig(env: SelfImprovementEnvLike | undefined): SelfImprovementEnvConfig {
  const hourRaw = Number.parseInt(env?.SELF_IMPROVEMENT_HOUR_UTC ?? '', 10);
  const hourUtc = Number.isFinite(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : DEFAULT_SELF_IMPROVEMENT_HOUR_UTC;
  return {
    envEnabled: isTruthyFlag(env?.SELF_IMPROVEMENT_ENABLED),
    targetUrl: env?.SELF_IMPROVEMENT_TARGET_URL?.trim() || DEFAULT_SELF_IMPROVEMENT_TARGET,
    hourUtc,
    envRecipient: env?.SELF_IMPROVEMENT_REPORT_TO?.trim() || null,
  };
}

export type SelfImprovementSettings = {
  enabled: boolean;
  killSwitch: boolean;
  autonomousShipEnabled: boolean;
  reportRecipient: string | null;
};

const DEFAULT_SETTINGS: SelfImprovementSettings = {
  enabled: false,
  killSwitch: false,
  autonomousShipEnabled: false,
  reportRecipient: null,
};

/** Load the single-row runtime settings; falls back to safe defaults (disabled) on any error. */
export async function loadSelfImprovementSettings(supabase: SupabaseClient): Promise<SelfImprovementSettings> {
  try {
    const { data, error } = await supabase
      .from('self_improvement_settings')
      .select('enabled, kill_switch, autonomous_ship_enabled, report_recipient')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      enabled: Boolean(data.enabled),
      killSwitch: Boolean(data.kill_switch),
      autonomousShipEnabled: Boolean(data.autonomous_ship_enabled),
      reportRecipient: typeof data.report_recipient === 'string' && data.report_recipient.trim()
        ? data.report_recipient.trim()
        : null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── Improvement plan (pure) ──────────────────────────────────────────────────────
export type ImprovementItem = {
  check: string;
  checkId: string;
  weight: number;
  category: string;
  finding: string;
  fix: string;
};

function isActionableFailure(i: ScanIssueJson): boolean {
  if (i.passed) return false;
  if (i.status === 'BLOCKED' || i.status === 'NOT_EVALUATED') return false;
  // Skip LLM checks that merely failed to fetch (finding like "http_403").
  if (i.status === 'LOW_CONFIDENCE' && /^http_\d+$/.test(i.finding.trim())) return false;
  return true;
}

/** Top failed checks, ranked by weight — the actionable plan handed to the coding agent. */
export function buildImprovementPlan(output: FreeScanOutput, max = 8): ImprovementItem[] {
  return output.issues
    .filter(isActionableFailure)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((i) => ({
      check: i.check,
      checkId: i.checkId,
      weight: i.weight,
      category: i.category,
      finding: i.finding,
      fix: i.fix ?? 'Review this check on the site.',
    }));
}

// ── Report email (pure HTML/text builders) ───────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSelfImprovementReportHtml(input: {
  targetUrl: string;
  score: number;
  letterGrade: string;
  plan: ImprovementItem[];
  dateStr: string;
}): string {
  const rows = input.plan.length === 0
    ? '<p style="color:#586162;">No actionable failures — the site is in good shape today.</p>'
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9E9;border-radius:6px;border-collapse:collapse;">
        <tr style="background:#F1F4F4;">
          <th style="padding:6px 8px;text-align:left;font-size:12px;">Priority</th>
          <th style="padding:6px 8px;text-align:left;font-size:12px;">Check</th>
          <th style="padding:6px 8px;text-align:left;font-size:12px;">Fix</th>
        </tr>
        ${input.plan.map((p, i) => `<tr>
          <td style="padding:4px 8px;font-size:13px;font-weight:700;">${String(i + 1)}</td>
          <td style="padding:4px 8px;font-size:13px;">${esc(p.check)}</td>
          <td style="padding:4px 8px;font-size:13px;color:#2C3435;">${esc(p.fix)}</td>
        </tr>`).join('')}
      </table>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F4;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:640px;">
  <tr><td style="background:#565E74;padding:24px 32px;">
    <span style="color:#fff;font-size:20px;font-weight:700;">GEO-Pulse</span>
    <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:12px;">Daily Self-Improvement Report</span>
  </td></tr>
  <tr><td style="padding:24px 32px 8px;">
    <h2 style="margin:0;color:#2C3435;font-size:18px;">${esc(input.targetUrl)}</h2>
    <p style="margin:6px 0 0;color:#586162;font-size:14px;">AI visibility score: <strong style="font-size:22px;color:#2C3435;">${String(input.score)}</strong> / 100 · Grade ${esc(input.letterGrade)}</p>
  </td></tr>
  <tr><td style="padding:8px 32px 24px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Improvement Plan</h3>
    ${rows}
  </td></tr>
  <tr><td style="padding:24px 32px;border-top:1px solid #F1F4F4;">
    <p style="color:#ABB4B5;font-size:11px;margin:0;">Generated ${esc(input.dateStr)} · Autonomous self-improvement loop (Loop 5a)</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export type SendResult = { ok: true; id?: string } | { ok: false; reason: string };

export async function sendSelfImprovementReport(input: {
  resendApiKey: string;
  from: string;
  to: string;
  targetUrl: string;
  score: number;
  letterGrade: string;
  plan: ImprovementItem[];
}): Promise<SendResult> {
  const dateStr = new Date().toISOString().split('T')[0] ?? '';
  const html = buildSelfImprovementReportHtml({ ...input, dateStr });
  const res = await fetch('https://api.resend.com/emails', {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { Authorization: `Bearer ${input.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `GEO-Pulse self-audit — ${String(input.score)}/100 (${input.letterGrade}) — ${dateStr}`,
      html,
    }),
  });
  if (!res.ok) return { ok: false, reason: (await res.text().catch(() => '')).slice(0, 500) };
  try {
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch {
    return { ok: true };
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────────
export type SelfImprovementRunResult = {
  ok: boolean;
  status: 'audited' | 'skipped' | 'failed';
  runId?: string;
  score?: number;
  letterGrade?: string;
  plan?: ImprovementItem[];
  emailed?: boolean;
  reason?: string;
};

function buildLlm(env: SelfImprovementEnvLike): LLMProvider | undefined {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return undefined;
  return new GeminiProvider({
    GEMINI_API_KEY: key,
    GEMINI_MODEL: env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    GEMINI_ENDPOINT: env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models',
  });
}

const NOOP_LLM: LLMProvider = {
  async analyze() {
    return { passed: false, reasoning: 'llm_not_configured', confidence: 'low' as const };
  },
};

/**
 * Run one self-audit of the target site, record a ledger row, and (when a recipient + Resend key
 * are configured) email the improvement plan. Respects the DB kill switch. `force` bypasses the
 * DB `enabled` check (used by the admin manual-trigger route) but NOT the kill switch.
 */
/** Is this user a no-human-in-the-loop autonomy operator? */
export async function isAutonomyOperator(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await supabase
      .from('user_autonomy_flags')
      .select('autonomy_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(data?.autonomy_enabled);
  } catch {
    return false;
  }
}

/**
 * Build the improvement plan from an ALREADY-RUN scan, email it, and record a ledger row — without
 * re-scanning. Lets the recurring-audit loop drive self-improvement directly (one loop, not two).
 */
export async function deliverSelfImprovementFromScan(args: {
  supabase: SupabaseClient;
  env: SelfImprovementEnvLike;
  triggerSource: 'worker_cron' | 'admin_manual' | 'ci';
  targetUrl: string;
  output: FreeScanOutput;
  domain: string;
  finalUrl: string;
  recipient: string | null;
}): Promise<{ runId?: string; emailed: boolean; plan: ImprovementItem[] }> {
  const plan = buildImprovementPlan(args.output);
  let emailed = false;
  if (args.recipient && args.env.RESEND_API_KEY?.trim() && args.env.RESEND_FROM_EMAIL?.trim()) {
    const sent = await sendSelfImprovementReport({
      resendApiKey: args.env.RESEND_API_KEY.trim(),
      from: args.env.RESEND_FROM_EMAIL.trim(),
      to: args.recipient,
      targetUrl: args.targetUrl,
      score: args.output.score,
      letterGrade: args.output.letterGrade,
      plan,
    });
    emailed = sent.ok;
  }
  const { data } = await args.supabase
    .from('self_improvement_runs')
    .insert({
      trigger_source: args.triggerSource,
      target_url: args.targetUrl,
      status: 'audited',
      score: args.output.score,
      letter_grade: args.output.letterGrade,
      summary: { plan, domain: args.domain, finalUrl: args.finalUrl, driver: 'recurring_audit' },
      emailed_to: emailed ? args.recipient : null,
    })
    .select('id')
    .single();
  return { runId: data?.id, emailed, plan };
}

export async function runSelfImprovementAudit(args: {
  supabase: SupabaseClient;
  env: SelfImprovementEnvLike;
  triggerSource: 'worker_cron' | 'admin_manual' | 'ci';
  force?: boolean;
}): Promise<SelfImprovementRunResult> {
  const { supabase, env, triggerSource } = args;
  const cfg = resolveSelfImprovementEnvConfig(env);
  const settings = await loadSelfImprovementSettings(supabase);

  if (settings.killSwitch) {
    return { ok: false, status: 'skipped', reason: 'kill_switch' };
  }
  if (!args.force && !(cfg.envEnabled && settings.enabled)) {
    return { ok: false, status: 'skipped', reason: 'disabled' };
  }

  const llm = buildLlm(env) ?? NOOP_LLM;
  const scan = await runFreeScan(cfg.targetUrl, llm);
  if (!scan.ok) {
    const { data } = await supabase
      .from('self_improvement_runs')
      .insert({ trigger_source: triggerSource, target_url: cfg.targetUrl, status: 'failed', error: scan.reason })
      .select('id')
      .single();
    return { ok: false, status: 'failed', runId: data?.id, reason: scan.reason };
  }

  const plan = buildImprovementPlan(scan.output);
  const recipient = settings.reportRecipient || cfg.envRecipient;

  let emailed = false;
  if (recipient && env.RESEND_API_KEY?.trim() && env.RESEND_FROM_EMAIL?.trim()) {
    const sent = await sendSelfImprovementReport({
      resendApiKey: env.RESEND_API_KEY.trim(),
      from: env.RESEND_FROM_EMAIL.trim(),
      to: recipient,
      targetUrl: cfg.targetUrl,
      score: scan.output.score,
      letterGrade: scan.output.letterGrade,
      plan,
    });
    emailed = sent.ok;
  }

  const { data, error } = await supabase
    .from('self_improvement_runs')
    .insert({
      trigger_source: triggerSource,
      target_url: cfg.targetUrl,
      status: 'audited',
      score: scan.output.score,
      letter_grade: scan.output.letterGrade,
      summary: { plan, domain: scan.domain, finalUrl: scan.finalUrl },
      emailed_to: emailed ? recipient : null,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, status: 'failed', reason: error.message, score: scan.output.score, letterGrade: scan.output.letterGrade, plan };
  }

  return {
    ok: true,
    status: 'audited',
    runId: data?.id,
    score: scan.output.score,
    letterGrade: scan.output.letterGrade,
    plan,
    emailed,
  };
}
