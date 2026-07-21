/**
 * Outreach v1 — the simplest honest funnel: an admin adds a prospect (email + site + cadence), we
 * audit the site on that cadence and email them their scorecard with a link to the full live
 * report. No account needed on their side; the report page's own sign-up CTAs are the next step.
 *
 * Opens are tracked with a first-party pixel (an image request to our own domain, recorded per
 * send). Pixel opens undercount — image blocking is common — so the admin UI presents them as a
 * floor ("opened at least once"), never as engagement truth.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import { buildAuditLlm } from './fix-agent-run';
import { ctaButton, emailShell, escapeEmailHtml, issueListHtml, scoreBlock } from './email-theme';
import { renderOutreachTemplate, resolveOutreachTemplate } from './outreach-templates';
import { structuredLog } from './structured-log';

export type OutreachCadence = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type OutreachProspect = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly url: string;
  readonly cadence: OutreachCadence;
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
  readonly nextRunAt: string;
  readonly lastScanId: string | null;
  readonly lastError: string | null;
  /** Pinned message template; null = use the default template or the built-in email. */
  readonly templateId: string | null;
};

export type OutreachEnvLike = {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
};

const CADENCE_MS: Record<OutreachCadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export function computeNextOutreachRun(cadence: OutreachCadence, nowMs: number): string {
  return new Date(nowMs + (CADENCE_MS[cadence] ?? CADENCE_MS.monthly)).toISOString();
}

export function normalizeOutreachCadence(raw: string | null | undefined): OutreachCadence {
  const value = raw?.trim().toLowerCase();
  if (value === 'hourly' || value === 'daily' || value === 'weekly' || value === 'monthly') return value;
  return 'monthly';
}

type ProspectRow = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  url: string;
  cadence: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  last_scan_id: string | null;
  last_error: string | null;
  template_id?: string | null;
};

function toProspect(row: ProspectRow): OutreachProspect {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    url: row.url,
    cadence: normalizeOutreachCadence(row.cadence),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastScanId: row.last_scan_id,
    lastError: row.last_error,
    templateId: row.template_id ?? null,
  };
}

export async function listOutreachProspects(supabase: SupabaseClient): Promise<OutreachProspect[]> {
  const { data } = await supabase
    .from('outreach_prospects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  return ((data ?? []) as ProspectRow[]).map(toProspect);
}

export function buildOutreachEmailHtml(args: {
  readonly recipientName: string | null;
  readonly domain: string;
  readonly score: number;
  readonly grade: string;
  readonly topIssues: ReadonlyArray<{ check?: string; fix?: string }>;
  readonly resultsUrl: string;
  readonly pixelUrl: string;
  readonly unsubscribeUrl: string;
}): string {
  const greeting = args.recipientName ? `Hi ${escapeEmailHtml(args.recipientName)},` : 'Hi,';
  return emailShell({
    kicker: 'AI search readiness · complimentary audit',
    mastheadNote: 'Prepared for your team',
    bodyHtml: [
      `<p style="margin:0 0 10px;">${greeting}</p>`,
      `<p style="margin:0 0 14px;">We ran an AI-readiness audit of <strong>${escapeEmailHtml(args.domain)}</strong> — how clearly AI engines like ChatGPT, Gemini and Perplexity can read, understand and cite your site.</p>`,
      scoreBlock(args.score, args.grade, 'Your AI search readiness'),
      issueListHtml(args.topIssues),
      ctaButton('See your full report', args.resultsUrl),
      `<p style="margin:0;color:#586162;font-size:13px;">The full report shows every check, what it means for your business, and exactly what to change — with copy-paste fixes. No account needed to view it.</p>`,
    ].join('\n'),
    unsubscribeUrl: args.unsubscribeUrl,
    pixelUrl: args.pixelUrl,
  });
}

async function sendOutreachEmail(
  env: OutreachEnvLike,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Audit one prospect's site now, email the scorecard, and advance the schedule. */
export async function runOutreachForProspect(args: {
  readonly supabase: SupabaseClient;
  readonly env: OutreachEnvLike;
  readonly prospect: OutreachProspect;
  readonly nowMs: number;
}): Promise<{ ok: true; scanId: string; score: number } | { ok: false; reason: string }> {
  const { supabase, env, prospect, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();

  const scan = await runFreeScan(prospect.url, buildAuditLlm(env));
  if (!scan.ok) {
    await supabase
      .from('outreach_prospects')
      .update({ last_run_at: nowIso, next_run_at: computeNextOutreachRun(prospect.cadence, nowMs), last_error: scan.reason, updated_at: nowIso })
      .eq('id', prospect.id);
    return { ok: false, reason: scan.reason };
  }

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
      user_id: null,
      run_source: 'recurring',
    })
    .select('id')
    .single();
  const scanId = (scanRow?.id as string | undefined) ?? null;
  if (!scanId) {
    await supabase
      .from('outreach_prospects')
      .update({ last_run_at: nowIso, next_run_at: computeNextOutreachRun(prospect.cadence, nowMs), last_error: 'scan_insert_failed', updated_at: nowIso })
      .eq('id', prospect.id);
    return { ok: false, reason: 'scan_insert_failed' };
  }

  const { data: sendRow } = await supabase
    .from('outreach_sends')
    .insert({ prospect_id: prospect.id, scan_id: scanId, score: scan.output.score })
    .select('id')
    .single();
  const sendId = (sendRow?.id as string | undefined) ?? null;

  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com').replace(/\/+$/, '');
  const topFailed = scan.output.issues
    .filter((issue) => issue.passed === false)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 3);

  let emailed = false;
  if (sendId) {
    const resultsUrl = `${appUrl}/results/${scanId}`;
    const pixelUrl = `${appUrl}/api/outreach/open/${sendId}`;
    const unsubscribeUrl = `${appUrl}/api/outreach/unsubscribe/${prospect.id}`;

    // Custom template (pinned or default) wins; the built-in scorecard email is the
    // fallback so outreach keeps working before migration 054 is applied.
    const template = await resolveOutreachTemplate(supabase, prospect.templateId);
    const message = template
      ? renderOutreachTemplate(
          template,
          {
            name: prospect.name,
            company: prospect.company,
            domain: scan.domain,
            score: scan.output.score,
            grade: scan.output.letterGrade,
            topIssues: topFailed,
            reportUrl: resultsUrl,
          },
          pixelUrl,
          unsubscribeUrl
        )
      : {
          subject: `${scan.domain}: AI search readiness score ${scan.output.score}/100`,
          html: buildOutreachEmailHtml({
            recipientName: prospect.name,
            domain: scan.domain,
            score: scan.output.score,
            grade: scan.output.letterGrade,
            topIssues: topFailed,
            resultsUrl,
            pixelUrl,
            unsubscribeUrl,
          }),
        };

    emailed = await sendOutreachEmail(env, prospect.email, message.subject, message.html);
  }

  await supabase
    .from('outreach_prospects')
    .update({
      last_run_at: nowIso,
      next_run_at: computeNextOutreachRun(prospect.cadence, nowMs),
      last_scan_id: scanId,
      last_error: emailed ? null : 'email_send_failed',
      updated_at: nowIso,
    })
    .eq('id', prospect.id);

  return { ok: true, scanId, score: scan.output.score };
}

/** Cron sweep: run every enabled prospect whose next_run_at has passed. */
export async function runDueOutreach(args: {
  readonly supabase: SupabaseClient;
  readonly env: OutreachEnvLike;
  readonly nowMs: number;
  readonly limit?: number;
}): Promise<{ scanned: number; ran: number; failed: number }> {
  const nowIso = new Date(args.nowMs).toISOString();
  const { data } = await args.supabase
    .from('outreach_prospects')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', nowIso)
    .limit(args.limit ?? 10);

  const due = ((data ?? []) as ProspectRow[]).map(toProspect);
  let ran = 0;
  let failed = 0;
  for (const prospect of due) {
    const result = await runOutreachForProspect({ ...args, prospect });
    if (result.ok) ran += 1;
    else failed += 1;
  }
  if (due.length > 0) {
    structuredLog('outreach_sweep', { scanned: due.length, ran, failed });
  }
  return { scanned: due.length, ran, failed };
}

/** Record an open from the tracking pixel. Fail-soft: a pixel must never error. */
export async function markOutreachOpen(supabase: SupabaseClient, sendId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('outreach_sends')
      .select('id, opened_at, open_count')
      .eq('id', sendId)
      .maybeSingle();
    if (!data?.id) return;
    await supabase
      .from('outreach_sends')
      .update({
        opened_at: (data.opened_at as string | null) ?? new Date().toISOString(),
        open_count: ((data.open_count as number | null) ?? 0) + 1,
      })
      .eq('id', sendId);
  } catch {
    /* never fail a pixel */
  }
}
