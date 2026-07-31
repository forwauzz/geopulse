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
import {
  isOutreachStopped,
  isPermanentOutreachScanFailure,
  normalizeOutreachLifecycleStatus,
  progressAfterFailedScan,
  progressAfterFailedSend,
  progressAfterSuccessfulSend,
  type OutreachLifecycleStatus,
} from './outreach-sequence';
import { resolveReportContradictions, runReportQaGate, type GateIssue } from '../../workers/report/report-qa-gate';

/**
 * Fail-closed QA before an outreach email leaves (spec §18): a scorecard whose findings
 * contradict each other, don't reconcile, or contain garbled text must never reach a prospect.
 * A confirmed FAIL is a HIGH/MEDIUM-confidence FAIL — a NOT_TESTED, BLOCKED, or low-confidence
 * signal can never headline the email ("do not lead with a low-confidence issue").
 */
export function isConfirmedFail(issue: { status?: string | null; confidence?: string | null; passed?: boolean }): boolean {
  const status = (issue.status ?? '').toUpperCase();
  const confidence = (issue.confidence ?? '').toLowerCase();
  if (status === 'NOT_TESTED' || status === 'NOT_EVALUATED' || status === 'BLOCKED') return false;
  if (confidence === 'low') return false;
  return status === 'FAIL' || (status === '' && issue.passed === false);
}

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
  readonly lifecycleStatus: OutreachLifecycleStatus;
  /** Current outbound step; maxSequenceSteps null preserves legacy recurring audits. */
  readonly sequenceStep: number;
  readonly maxSequenceSteps: number | null;
  readonly sequenceDelaysDays: number[];
  readonly consecutiveFailures: number;
  readonly maxAttempts: number;
  readonly nextAction: string | null;
  readonly segment: string | null;
  readonly personalizationReason: string | null;
  readonly personalizationSourceUrl: string | null;
};

export type OutreachEnvLike = {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly SALES_REPLY_TO_EMAIL?: string;
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
  lifecycle_status?: string | null;
  sequence_step?: number | null;
  max_sequence_steps?: number | null;
  sequence_delays_days?: number[] | null;
  consecutive_failures?: number | null;
  max_attempts?: number | null;
  next_action?: string | null;
  segment?: string | null;
  personalization_reason?: string | null;
  personalization_source_url?: string | null;
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
    lifecycleStatus: normalizeOutreachLifecycleStatus(row.lifecycle_status),
    sequenceStep: Math.max(1, Number(row.sequence_step ?? 1)),
    maxSequenceSteps: row.max_sequence_steps == null ? null : Math.max(1, Number(row.max_sequence_steps)),
    sequenceDelaysDays: Array.isArray(row.sequence_delays_days) ? row.sequence_delays_days.map(Number) : [0, 4, 10],
    consecutiveFailures: Math.max(0, Number(row.consecutive_failures ?? 0)),
    maxAttempts: Math.max(1, Number(row.max_attempts ?? 3)),
    nextAction: row.next_action ?? null,
    segment: row.segment ?? null,
    personalizationReason: row.personalization_reason ?? null,
    personalizationSourceUrl: row.personalization_source_url ?? null,
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
  readonly walkthroughUrl: string;
  readonly pixelUrl: string;
  readonly unsubscribeUrl: string;
}): string {
  const greeting = args.recipientName ? `Hi ${escapeEmailHtml(args.recipientName)},` : 'Hi,';
  return emailShell({
    kicker: 'AI search readiness · complimentary audit',
    mastheadNote: 'Prepared for your team',
    sender: 'elena',
    bodyHtml: [
      `<p style="margin:0 0 10px;">${greeting}</p>`,
      `<p style="margin:0 0 14px;">We ran a public-site AI-search readiness audit of <strong>${escapeEmailHtml(args.domain)}</strong>. It checks observable access, structure, content, and trust signals; it does not predict or guarantee citations.</p>`,
      scoreBlock(args.score, args.grade, 'Your AI search readiness'),
      issueListHtml(args.topIssues),
      ctaButton('See your full report', args.resultsUrl),
      `<p style="margin:0 0 14px;color:#586162;font-size:13px;">The report shows what each check observed and a practical next step. No account is needed to view it.</p>`,
      ctaButton('Request a focused walkthrough', args.walkthroughUrl),
      `<p style="margin:0;color:#586162;font-size:13px;">Prefer a conversation? Send the site and your question. A person will review the public evidence before replying.</p>`,
    ].join('\n'),
    unsubscribeUrl: args.unsubscribeUrl,
    pixelUrl: args.pixelUrl,
  });
}

type BoundedOutreachMessageArgs = {
  readonly recipientName: string | null;
  readonly domain: string;
  readonly score: number;
  readonly grade: string;
  readonly topIssues: ReadonlyArray<{ check?: string; fix?: string }>;
  readonly resultsUrl: string;
  readonly walkthroughUrl: string;
  readonly pixelUrl: string;
  readonly unsubscribeUrl: string;
  readonly sequenceStep: number;
};

export function buildBoundedOutreachMessage(
  args: BoundedOutreachMessageArgs,
): {
  readonly subject: string;
  readonly html: string;
  readonly variant: 'evidence_opener' | 'reply_first_email_notes_v2' | 'close_the_loop';
} {
  if (args.sequenceStep <= 1) {
    return {
      subject: `${args.domain}: AI search readiness score ${args.score}/100`,
      html: buildOutreachEmailHtml(args),
      variant: 'evidence_opener',
    };
  }

  const greeting = args.recipientName ? `Hi ${escapeEmailHtml(args.recipientName)},` : 'Hi,';

  if (args.sequenceStep === 2) {
    const firstIssue = args.topIssues[0];
    const issueContext = firstIssue?.check
      ? `<p style="margin:0 0 14px;">One confirmed gap was <strong>${escapeEmailHtml(firstIssue.check)}</strong>${firstIssue.fix ? `: ${escapeEmailHtml(firstIssue.fix)}` : '.'}</p>`
      : '';
    return {
      subject: `Quick question about ${args.domain}`,
      html: emailShell({
        kicker: 'AI search readiness | follow-up',
        mastheadNote: 'One practical question',
        sender: 'elena',
        bodyHtml: [
          `<p style="margin:0 0 10px;">${greeting}</p>`,
          `<p style="margin:0 0 14px;">I sent the public-site audit for <strong>${escapeEmailHtml(args.domain)}</strong> earlier. It found observable access, structure, content, and trust gaps; it did not predict or guarantee citations.</p>`,
          issueContext,
          '<p style="margin:0 0 14px;">Is AI-search visibility something your team owns, or should I send the evidence to someone else?</p>',
          '<p style="margin:0;color:#586162;font-size:13px;">If you own it, reply with "notes" and I will send the two highest-confidence checks in this thread. No call or account is needed. If someone else owns it, their role is enough.</p>',
        ].join('\n'),
        unsubscribeUrl: args.unsubscribeUrl,
        pixelUrl: args.pixelUrl,
      }),
      variant: 'reply_first_email_notes_v2',
    };
  }

  return {
    subject: `Should I close the loop on ${args.domain}?`,
    html: emailShell({
      kicker: 'AI search readiness | final note',
      mastheadNote: 'Closing the loop',
      sender: 'elena',
      bodyHtml: [
        `<p style="margin:0 0 10px;">${greeting}</p>`,
        `<p style="margin:0 0 14px;">Last note on the public-site audit for <strong>${escapeEmailHtml(args.domain)}</strong>. I do not want to keep sending this if the timing or fit is wrong.</p>`,
        '<p style="margin:0 0 14px;">Should I close this out, or would a short walkthrough be useful? Either reply is helpful.</p>',
        ctaButton('Keep the audit for reference', args.resultsUrl),
      ].join('\n'),
      unsubscribeUrl: args.unsubscribeUrl,
      pixelUrl: args.pixelUrl,
    }),
    variant: 'close_the_loop',
  };
}

export async function sendOutreachEmail(
  env: OutreachEnvLike,
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string,
): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; detail: string }> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return { ok: false, detail: 'resend_credentials_missing' };

  const replyTo = env.SALES_REPLY_TO_EMAIL?.trim();
  const body = JSON.stringify({
    from,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        signal: AbortSignal.timeout(15_000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'Idempotency-Key': idempotencyKey,
        },
        body,
      });
      if (res.ok) {
        let providerMessageId: string | null = null;
        try {
          const responseBody = (await res.json()) as { id?: string };
          providerMessageId = responseBody.id ?? null;
        } catch {
          /* provider accepted the request; the identifier is optional evidence */
        }
        return { ok: true, providerMessageId };
      }

      // The real reason must reach the admin UI — a bare boolean cost us a debugging
      // round-trip on the first live send (issue #112).
      let detail = `http_${String(res.status)}`;
      try {
        const responseBody = (await res.json()) as { message?: string; name?: string };
        const message = [responseBody.name, responseBody.message].filter(Boolean).join(': ');
        if (message) detail = `${detail} ${message}`.slice(0, 300);
      } catch {
        /* keep the status-only detail */
      }
      if (attempt === 1 && (res.status === 429 || res.status >= 500)) continue;
      structuredLog('outreach_email_send_failed', { detail, attempts: attempt }, 'warning');
      return { ok: false, detail };
    } catch (err) {
      const detail = err instanceof Error && err.name === 'TimeoutError' ? 'send_timeout' : 'network_error';
      if (attempt === 1) continue;
      structuredLog('outreach_email_send_failed', { detail, attempts: attempt }, 'warning');
      return { ok: false, detail };
    }
  }

  return { ok: false, detail: 'delivery_retry_exhausted' };
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

  if (!prospect.enabled || isOutreachStopped(prospect.lifecycleStatus)) {
    return { ok: false, reason: `outreach_stopped:${prospect.lifecycleStatus}` };
  }

  const scan = await runFreeScan(prospect.url, buildAuditLlm(env));
  if (!scan.ok) {
    if (prospect.maxSequenceSteps != null) {
      const failure = progressAfterFailedScan({
        consecutiveFailures: prospect.consecutiveFailures,
        maxAttempts: prospect.maxAttempts,
        nowMs,
        reason: scan.reason,
        permanent: isPermanentOutreachScanFailure(scan.reason),
      });
      await supabase
        .from('outreach_prospects')
        .update({
          enabled: failure.enabled,
          lifecycle_status: failure.lifecycleStatus,
          consecutive_failures: failure.consecutiveFailures,
          last_run_at: nowIso,
          next_run_at: failure.nextRunAt,
          last_error: scan.reason,
          next_action: failure.nextAction,
          exited_at: failure.exitedAt,
          exit_reason: failure.exitReason,
          updated_at: nowIso,
        })
        .eq('id', prospect.id);
      return { ok: false, reason: scan.reason };
    }
    await supabase
      .from('outreach_prospects')
      .update({ last_run_at: nowIso, next_run_at: computeNextOutreachRun(prospect.cadence, nowMs), last_error: scan.reason, updated_at: nowIso })
      .eq('id', prospect.id);
    return { ok: false, reason: scan.reason };
  }

  // Fail-closed QA (spec §18): resolve known contradictions, then gate. A report that fails the
  // gate is persisted (for the admin run view) but NEVER emailed — the scorecard the prospect
  // sees must be internally consistent and free of garbled/clipped findings.
  const resolved = resolveReportContradictions((scan.output.issues ?? []) as GateIssue[]);
  const gate = runReportQaGate({ issues: resolved.issues });

  const { data: scanRow } = await supabase
    .from('scans')
    .insert({
      url: scan.finalUrl,
      domain: scan.domain,
      status: 'complete',
      score: scan.output.score,
      letter_grade: scan.output.letterGrade,
      issues_json: resolved.issues,
      full_results_json: {
        issues: resolved.issues,
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

  // QUARANTINE: the scan is recorded, but a report that fails the gate never reaches the prospect.
  if (!gate.ok) {
    await supabase
      .from('outreach_prospects')
      .update({
        last_run_at: nowIso,
        next_run_at: computeNextOutreachRun(prospect.cadence, nowMs),
        last_scan_id: scanId,
        last_error: `quarantined: ${gate.violations.map((v) => v.rule).join(', ')}`,
        updated_at: nowIso,
      })
      .eq('id', prospect.id);
    structuredLog(
      'outreach_report_quarantined',
      { prospectId: prospect.id, scanId, violations: gate.violations.map((v) => v.rule).join(',') },
      'warning'
    );
    return { ok: false, reason: 'quarantined' };
  }

  const { data: sendRow } = await supabase
    .from('outreach_sends')
    .insert({
      prospect_id: prospect.id,
      scan_id: scanId,
      score: scan.output.score,
      delivery_status: 'pending',
      sequence_step: prospect.maxSequenceSteps == null ? null : prospect.sequenceStep,
    })
    .select('id')
    .single();
  const sendId = (sendRow?.id as string | undefined) ?? null;

  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com').replace(/\/+$/, '');
  // Confirmed FAILs only — never headline the email with a NOT_TESTED or low-confidence signal.
  // resolveReportContradictions preserves every field at runtime; the GateIssue type just omits
  // `weight`, so cast back to the scan-issue shape the email template already accepts.
  const topFailed = (resolved.issues as unknown as typeof scan.output.issues)
    .filter(isConfirmedFail)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 3);

  let sendOutcome: { ok: true; providerMessageId: string | null } | { ok: false; detail: string } = {
    ok: false,
    detail: 'send_row_insert_failed',
  };
  if (sendId) {
    const campaign = prospect.segment === 'msp-qc' ? 'msp-first-customer' : 'agency-first-customer';
    const resultParams = new URLSearchParams({
      utm_source: 'outreach',
      utm_medium: 'email',
      utm_campaign: campaign,
      utm_content: `sequence-${String(prospect.sequenceStep)}`,
    });
    const walkthroughParams = new URLSearchParams(resultParams);
    walkthroughParams.set('website', prospect.url);
    walkthroughParams.set('source', 'outreach');
    const resultsUrl = `${appUrl}/results/${scanId}?${resultParams.toString()}`;
    const walkthroughUrl = `${appUrl}/walkthrough?${walkthroughParams.toString()}`;
    const pixelUrl = `${appUrl}/api/outreach/open/${sendId}`;
    const unsubscribeUrl = `${appUrl}/api/outreach/unsubscribe/${prospect.id}`;

    // Custom template (pinned or default) wins; the built-in scorecard email is the
    // fallback so outreach keeps working before migration 054 is applied.
    const template = await resolveOutreachTemplate(supabase, prospect.templateId);
    const builtInMessage = prospect.maxSequenceSteps == null
      ? {
          subject: `${scan.domain}: AI search readiness score ${scan.output.score}/100`,
          html: buildOutreachEmailHtml({
            recipientName: prospect.name,
            domain: scan.domain,
            score: scan.output.score,
            grade: scan.output.letterGrade,
            topIssues: topFailed,
            resultsUrl,
            walkthroughUrl,
            pixelUrl,
            unsubscribeUrl,
          }),
          variant: 'recurring_scorecard',
        }
      : buildBoundedOutreachMessage({
          recipientName: prospect.name,
          domain: scan.domain,
          score: scan.output.score,
          grade: scan.output.letterGrade,
          topIssues: topFailed,
          resultsUrl,
          walkthroughUrl,
          pixelUrl,
          unsubscribeUrl,
          sequenceStep: prospect.sequenceStep,
        });
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
            walkthroughUrl,
            personalizationReason: prospect.personalizationReason,
            personalizationSourceUrl: prospect.personalizationSourceUrl,
          },
          pixelUrl,
          unsubscribeUrl
        )
      : builtInMessage;
    structuredLog('outreach_message_variant_selected', {
      prospectId: prospect.id,
      sendId,
      campaign,
      sequenceStep: prospect.maxSequenceSteps == null ? null : prospect.sequenceStep,
      variant: 'variant' in message ? message.variant : 'custom_template',
    });

    // The provider receives the same key for the bounded in-process retry, so an
    // accepted request with a lost response cannot produce a duplicate email.
    const idempotencyKey = `outreach-send-${sendId}`;
    sendOutcome = await sendOutreachEmail(
      env,
      prospect.email,
      message.subject,
      message.html,
      idempotencyKey,
    );
  }

  if (sendId) {
    await supabase
      .from('outreach_sends')
      .update({
        delivery_status: sendOutcome.ok ? 'sent' : 'failed',
        provider_message_id: sendOutcome.ok ? sendOutcome.providerMessageId : null,
        delivery_error: sendOutcome.ok ? null : sendOutcome.detail,
        updated_at: nowIso,
      })
      .eq('id', sendId);
  }

  if (!sendOutcome.ok) {
    const failure = progressAfterFailedSend({
      consecutiveFailures: prospect.consecutiveFailures,
      maxAttempts: prospect.maxAttempts,
      nowMs,
      reason: sendOutcome.detail,
    });
    await supabase
      .from('outreach_prospects')
      .update({
        enabled: failure.enabled,
        lifecycle_status: failure.lifecycleStatus,
        consecutive_failures: failure.consecutiveFailures,
        last_run_at: nowIso,
        next_run_at: failure.nextRunAt,
        last_scan_id: scanId,
        last_error: `email_send_failed: ${sendOutcome.detail}`,
        next_action: failure.nextAction,
        updated_at: nowIso,
      })
      .eq('id', prospect.id);
    return { ok: false, reason: `email_send_failed:${sendOutcome.detail}` };
  }

  const progress = progressAfterSuccessfulSend(
    prospect,
    nowMs,
    computeNextOutreachRun(prospect.cadence, nowMs),
  );
  await supabase
    .from('outreach_prospects')
    .update({
      enabled: progress.enabled,
      lifecycle_status: progress.lifecycleStatus,
      sequence_step: progress.sequenceStep,
      consecutive_failures: 0,
      last_run_at: nowIso,
      next_run_at: progress.nextRunAt,
      last_scan_id: scanId,
      last_error: null,
      next_action: progress.nextAction,
      exited_at: progress.exitedAt,
      exit_reason: progress.exitReason,
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

  let due = ((data ?? []) as ProspectRow[]).map(toProspect);

  // Conversion is a hard stop. Reconcile active/trialing subscriptions by email before
  // attempting another campaign step so a customer never receives a cold follow-up.
  if (due.length > 0) {
    const { data: subscriptions, error: subscriptionError } = await args.supabase
      .from('monitoring_subscriptions')
      .select('email')
      .in('status', ['active', 'trialing'])
      .limit(1000);
    if (!subscriptionError) {
      const convertedEmails = new Set(
        ((subscriptions ?? []) as Array<{ email: string }>).map((row) => row.email.toLowerCase()),
      );
      const converted = due.filter((prospect) => convertedEmails.has(prospect.email.toLowerCase()));
      if (converted.length > 0) {
        await Promise.all(converted.map((prospect) => args.supabase
          .from('outreach_prospects')
          .update({
            enabled: false,
            lifecycle_status: 'converted',
            converted_at: nowIso,
            exited_at: nowIso,
            exit_reason: 'active_subscription',
            next_action: null,
            updated_at: nowIso,
          })
          .eq('id', prospect.id)));
        due = due.filter((prospect) => !convertedEmails.has(prospect.email.toLowerCase()));
      }
    }
  }

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
