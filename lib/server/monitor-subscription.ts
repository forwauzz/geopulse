/**
 * GEO-Pulse Monitoring — the $39/mo (or $390/yr) subscription (migration 058).
 *
 * A cold visitor runs the free audit, then subscribes to have that site re-audited every month.
 * This remains DECOUPLED from user_subscriptions / workspace provisioning and is email-keyed for
 * compatibility, while new checkouts require an account and recurring scans are attached to the
 * matching user. Email delivery uses an unguessable per-scan /share/<slug> link (issue #128).
 *
 * Stripe wiring is thin: checkout.session.completed seeds the row (it carries the customer email),
 * and the subscription/invoice lifecycle events flip status by stripe_subscription_id. The monthly
 * re-audit is driven by `next_audit_at`, swept by the worker cron.
 *
 * Dormant until migration 058 is applied AND the `show_monitor_subscription` flag is on (fail-closed).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { ctaButton, emailShell, escapeEmailHtml, scoreBlock } from './email-theme';
import { mintShareSlug, type RecurringEnvLike } from './recurring-audits';
import { fetchLatestVisibilityForDomain, renderVisibilitySummary } from './visibility-report';
import { runFreeScan } from '../../workers/scan-engine/run-scan';
import { GeminiProvider } from '../../workers/providers/gemini';
import type { LLMProvider } from '../../workers/lib/interfaces/providers';
import { structuredLog, structuredError } from './structured-log';
import { emitMarketingEvent } from '../../services/marketing-attribution/emit';

export type MonitorPlan = 'monthly' | 'annual';
export type MonitorStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

/** Re-audit cadence — one month between monthly reports regardless of monthly/annual billing. */
export const MONITOR_AUDIT_INTERVAL_DAYS = 30;

export function computeNextAudit(fromMs: number): string {
  return new Date(fromMs + MONITOR_AUDIT_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Delivery failures retry on the next daily window instead of silently waiting another month. */
export function computeDeliveryRetry(fromMs: number): string {
  return new Date(fromMs + 24 * 60 * 60 * 1000).toISOString();
}

/** Unguessable capability token for the signed-out live-stats link (hex, no dashes). */
export function mintPrivateToken(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
}

// ── Stripe price ↔ plan mapping ──────────────────────────────────────────────

type MonitorPriceEnv = {
  STRIPE_PRICE_ID_MONITOR_MONTHLY?: string;
  STRIPE_PRICE_ID_MONITOR_ANNUAL?: string;
};

/** Which monitor plan a Stripe price id represents, or null if it is not a monitor price. */
export function resolveMonitorPlan(priceId: string | null | undefined, env: MonitorPriceEnv): MonitorPlan | null {
  const id = priceId?.trim();
  if (!id) return null;
  if (id === env.STRIPE_PRICE_ID_MONITOR_MONTHLY?.trim()) return 'monthly';
  if (id === env.STRIPE_PRICE_ID_MONITOR_ANNUAL?.trim()) return 'annual';
  return null;
}

/** Resolve the Stripe price id for a requested plan (checkout time). */
export function monitorPriceIdForPlan(plan: MonitorPlan, env: MonitorPriceEnv): string | null {
  const id = plan === 'annual' ? env.STRIPE_PRICE_ID_MONITOR_ANNUAL : env.STRIPE_PRICE_ID_MONITOR_MONTHLY;
  return id?.trim() || null;
}

export function normalizeMonitorPlan(raw: string | null | undefined): MonitorPlan {
  return raw === 'annual' ? 'annual' : 'monthly';
}

function mapStripeStatus(status: Stripe.Subscription['status']): MonitorStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'past_due'; // 'unpaid' | 'paused'
  }
}

// ── Row types ────────────────────────────────────────────────────────────────

export type MonitorSubscriptionRow = {
  id: string;
  email: string;
  monitored_url: string;
  domain: string | null;
  plan: MonitorPlan;
  status: MonitorStatus;
  private_token: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  origin_scan_id: string | null;
  current_period_end: string | null;
  last_audit_at: string | null;
  next_audit_at: string | null;
};

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

// ── Seed a subscription from checkout.session.completed ───────────────────────

export type SeedMonitorArgs = {
  email: string;
  monitoredUrl: string;
  plan: MonitorPlan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  originScanId: string | null;
  status: MonitorStatus;
  nowMs: number;
};

/**
 * Update an existing monitor row in place from a checkout/seed. Always carries the (possibly new)
 * stripe_subscription_id so a re-subscribe or race never leaves the row pointing at a stale/absent
 * subscription. Arms the first monthly re-audit when the row transitions active and isn't armed yet.
 */
async function updateMonitorRowById(
  supabase: SupabaseClient,
  id: string,
  existingNextAuditAt: string | null,
  args: SeedMonitorArgs & { email: string }
): Promise<{ ok: boolean; created: false; token?: string; error?: string }> {
  const goingActive = (args.status === 'active' || args.status === 'trialing') && !existingNextAuditAt;
  const domain = hostFromUrl(args.monitoredUrl);
  const { data, error } = await supabase
    .from('monitoring_subscriptions')
    .update({
      email: args.email,
      monitored_url: args.monitoredUrl,
      domain,
      status: args.status,
      stripe_customer_id: args.stripeCustomerId,
      stripe_subscription_id: args.stripeSubscriptionId,
      stripe_price_id: args.stripePriceId,
      plan: args.plan,
      origin_scan_id: args.originScanId,
      ...(goingActive ? { next_audit_at: computeNextAudit(args.nowMs) } : {}),
      updated_at: new Date(args.nowMs).toISOString(),
    })
    .eq('id', id)
    .select('private_token')
    .maybeSingle();
  return error
    ? { ok: false, created: false, error: error.message }
    : { ok: true, created: false, token: (data?.private_token as string | undefined) };
}

/**
 * Idempotent create-or-touch from checkout completion. Keyed by stripe_subscription_id so webhook
 * retries never duplicate. Mints the private token once. When the row goes `active`, arms the first
 * monthly re-audit 30 days out (the origin free scan is this month's "report").
 *
 * A unique violation is NOT silently swallowed (Codex P1 #2): it is resolved to the conflicting row
 * (by subscription id, then by the active email+domain partial index) which is then updated to carry
 * this subscription. Only an unresolvable conflict returns ok:false, so the webhook surfaces it
 * (Stripe retries) instead of returning 200 with the subscription id unstored.
 */
export async function seedMonitorSubscription(
  supabase: SupabaseClient,
  args: SeedMonitorArgs
): Promise<{ ok: boolean; created: boolean; token?: string; error?: string }> {
  const email = args.email.trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, created: false, error: 'invalid_email' };
  if (!args.monitoredUrl) return { ok: false, created: false, error: 'missing_url' };
  const domain = hostFromUrl(args.monitoredUrl);

  if (args.stripeSubscriptionId) {
    const { data: existing } = await supabase
      .from('monitoring_subscriptions')
      .select('id, next_audit_at')
      .eq('stripe_subscription_id', args.stripeSubscriptionId)
      .maybeSingle();
    if (existing?.id) {
      return updateMonitorRowById(supabase, existing.id, existing.next_audit_at ?? null, { ...args, email });
    }
  }

  const token = mintPrivateToken();
  const active = args.status === 'active' || args.status === 'trialing';
  const { error } = await supabase.from('monitoring_subscriptions').insert({
    email,
    monitored_url: args.monitoredUrl,
    domain,
    plan: args.plan,
    status: args.status,
    private_token: token,
    stripe_customer_id: args.stripeCustomerId,
    stripe_subscription_id: args.stripeSubscriptionId,
    stripe_price_id: args.stripePriceId,
    origin_scan_id: args.originScanId,
    next_audit_at: active ? computeNextAudit(args.nowMs) : null,
    updated_at: new Date(args.nowMs).toISOString(),
  });
  if (!error) return { ok: true, created: true, token };

  if ((error as { code?: string }).code === '23505') {
    // Race: the sibling handler already inserted this exact subscription → update it in place.
    if (args.stripeSubscriptionId) {
      const { data: bySub } = await supabase
        .from('monitoring_subscriptions')
        .select('id, next_audit_at')
        .eq('stripe_subscription_id', args.stripeSubscriptionId)
        .maybeSingle();
      if (bySub?.id) {
        return updateMonitorRowById(supabase, bySub.id, bySub.next_audit_at ?? null, { ...args, email });
      }
    }
    // Active subscription already exists for this email+site (partial unique index). The customer
    // re-subscribed — repoint the newest active row to this Stripe subscription.
    if (domain) {
      const { data: byEmailDomain } = await supabase
        .from('monitoring_subscriptions')
        .select('id, next_audit_at')
        .eq('email', email)
        .eq('domain', domain)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byEmailDomain?.id) {
        return updateMonitorRowById(supabase, byEmailDomain.id, byEmailDomain.next_audit_at ?? null, { ...args, email });
      }
    }
    structuredError('monitor_seed_conflict_unresolved', {
      stripeSubscriptionId: args.stripeSubscriptionId ?? null,
      domain: domain ?? null,
    });
    return { ok: false, created: false, error: 'seed_conflict_unresolved' };
  }
  return { ok: false, created: false, error: error.message };
}

// ── Lifecycle updates by subscription id ─────────────────────────────────────

/** Flip status / period from a Stripe subscription event. Only touches an existing monitor row. */
export async function updateMonitorSubscriptionStatus(
  supabase: SupabaseClient,
  args: { stripeSubscriptionId: string; status: MonitorStatus; currentPeriodEnd: string | null; nowMs: number }
): Promise<void> {
  const { data: row } = await supabase
    .from('monitoring_subscriptions')
    .select('id, next_audit_at, status')
    .eq('stripe_subscription_id', args.stripeSubscriptionId)
    .maybeSingle();
  if (!row?.id) return; // not a monitor subscription (or seed not yet processed)

  const armFirstAudit =
    (args.status === 'active' || args.status === 'trialing') && !row.next_audit_at;
  await supabase
    .from('monitoring_subscriptions')
    .update({
      status: args.status,
      current_period_end: args.currentPeriodEnd,
      ...(args.status === 'canceled' ? { canceled_at: new Date(args.nowMs).toISOString() } : {}),
      ...(armFirstAudit ? { next_audit_at: computeNextAudit(args.nowMs) } : {}),
      updated_at: new Date(args.nowMs).toISOString(),
    })
    .eq('id', row.id);
}

/**
 * True when a stripe_subscription_id belongs to a monitor subscription (routes webhook events).
 * Resilient: a lookup failure (or a table that doesn't exist yet) reports "not a monitor sub" so
 * the caller falls through to the existing workspace/invoice handlers instead of erroring.
 */
export async function isMonitorSubscription(
  supabase: SupabaseClient,
  stripeSubscriptionId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('monitoring_subscriptions')
      .select('id')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    return !!data?.id;
  } catch {
    return false;
  }
}

// ── Monthly re-audit sweep ───────────────────────────────────────────────────

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

async function sendMonitorAuditEmail(
  env: RecurringEnvLike,
  to: string,
  scanUrl: string,
  score: number,
  letterGrade: string,
  shareSlug: string,
  visibilityHtml = ''
): Promise<boolean> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return false;
  const base = (env.NEXT_PUBLIC_APP_URL?.trim() || 'https://getgeopulse.com').replace(/\/$/, '');
  const link = `${base}/share/${shareSlug}`;
  const html = emailShell({
    kicker: 'Monthly monitoring · AI search readiness',
    mastheadNote: 'GEO-Pulse Monitoring',
    bodyHtml: [
      `<p style="margin:0 0 6px;">Here is this month's audit of <strong>${escapeEmailHtml(scanUrl)}</strong>.</p>`,
      scoreBlock(score, letterGrade, 'AI search readiness'),
      visibilityHtml,
      ctaButton('View your full report + ranking', link),
      `<p style="margin:0;color:#586162;font-size:13px;">Your private report shows every check, how you rank against local competitors, and what changed since last month.</p>`,
    ].join('\n'),
    footerNote: 'You are getting this because you subscribed to GEO-Pulse Monitoring. Reply to this email to cancel or manage your subscription.',
  });
  try {
    const response = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Your monthly GEO-Pulse report: ${scanUrl} scored ${score}/100`, html }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type MonitorSweepResult = { due: number; ran: number; failed: number };

/**
 * Re-audit every active subscription whose monthly window has elapsed. Bounded per tick (Free-plan
 * CPU budget). Persists a scan (run_source 'monitor', share_slug for the signed-out link), emails
 * the subscriber, and advances next_audit_at. Safe no-op when nothing is due.
 */
export async function runDueMonitorAudits(args: {
  supabase: SupabaseClient;
  env: RecurringEnvLike;
  nowMs: number;
  limit?: number;
}): Promise<MonitorSweepResult> {
  const { supabase, env, nowMs } = args;
  const nowIso = new Date(nowMs).toISOString();
  const { data } = await supabase
    .from('monitoring_subscriptions')
    .select('id, email, monitored_url, next_audit_at')
    .eq('status', 'active')
    .lte('next_audit_at', nowIso)
    .order('next_audit_at', { ascending: true })
    .limit(args.limit ?? 3);

  const due = (data ?? []) as Pick<MonitorSubscriptionRow, 'id' | 'email' | 'monitored_url'>[];
  const llm = buildLlm(env);
  let ran = 0;
  let failed = 0;

  for (const sub of due) {
    try {
      const scan = await runFreeScan(sub.monitored_url, llm);
      if (!scan.ok) {
        await supabase
          .from('monitoring_subscriptions')
          .update({ last_audit_at: nowIso, next_audit_at: computeDeliveryRetry(nowMs), last_error: scan.reason, updated_at: nowIso })
          .eq('id', sub.id);
        failed += 1;
        continue;
      }
      const shareSlug = mintShareSlug();
      const { data: owner } = await supabase
        .from('users')
        .select('id')
        .eq('email', sub.email.trim().toLowerCase())
        .maybeSingle();
      const { data: scanRow, error: scanInsertError } = await supabase
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
            monitoringSubscriptionId: sub.id,
            generatedAt: nowIso,
          },
          user_id: owner?.id ?? null,
          run_source: 'monitor',
          share_slug: shareSlug,
        })
        .select('id')
        .single();
      if (scanInsertError || !scanRow?.id) {
        throw new Error(scanInsertError?.message ?? 'monitor_scan_insert_failed');
      }

      // Display-only visibility (free path): include the AI Visibility Performance block when the
      // domain already has benchmark data. Reads existing metrics — runs no new benchmark.
      const vis = await fetchLatestVisibilityForDomain(supabase, scan.domain);
      const visibilityHtml = vis ? renderVisibilitySummary({ domain: scan.domain, metrics: vis }).html : '';
      const delivered = await sendMonitorAuditEmail(
        env,
        sub.email,
        scan.finalUrl,
        scan.output.score,
        scan.output.letterGrade,
        shareSlug,
        visibilityHtml
      );
      if (!delivered) {
        await supabase
          .from('monitoring_subscriptions')
          .update({
            last_audit_at: nowIso,
            next_audit_at: computeDeliveryRetry(nowMs),
            last_error: 'report_email_delivery_failed',
            updated_at: nowIso,
          })
          .eq('id', sub.id);
        failed += 1;
        structuredError('monitor_report_delivery_failed', {
          subscriptionId: sub.id,
          scanId: scanRow.id,
        });
        continue;
      }

      await supabase
        .from('monitoring_subscriptions')
        .update({ last_audit_at: nowIso, next_audit_at: computeNextAudit(nowMs), last_error: null, updated_at: nowIso })
        .eq('id', sub.id);
      await emitMarketingEvent(supabase, 'report_delivered', {
        idempotency_key: `monitor_report_delivered:${scanRow.id}`,
        scan_id: scanRow.id as string,
        user_id: owner?.id ?? null,
        email: sub.email,
        metadata: { kind: 'monitor', monitoring_subscription_id: sub.id },
      });
      ran += 1;
    } catch (err) {
      failed += 1;
      await supabase
        .from('monitoring_subscriptions')
        .update({ next_audit_at: computeDeliveryRetry(nowMs), last_error: err instanceof Error ? err.message : 'error', updated_at: nowIso })
        .eq('id', sub.id);
      structuredError('monitor_audit_run_failed', { subscriptionId: sub.id, error: err instanceof Error ? err.message : 'error' });
    }
  }

  if (due.length > 0) {
    structuredLog('monitor_audit_sweep', { due: due.length, ran, failed }, 'info');
  }
  return { due: due.length, ran, failed };
}

// ── Stripe webhook adapters ──────────────────────────────────────────────────

function isoFromUnix(sec: number | null | undefined): string | null {
  return typeof sec === 'number' && sec > 0 ? new Date(sec * 1000).toISOString() : null;
}

/** True when a Stripe subscription object is a monitor subscription (metadata or price). */
export function isMonitorSubscriptionObject(sub: Stripe.Subscription, env: MonitorPriceEnv): boolean {
  if (sub.metadata?.['kind'] === 'monitor') return true;
  return resolveMonitorPlan(sub.items?.data?.[0]?.price?.id, env) !== null;
}

/**
 * checkout.session.completed for a monitor subscription — the authoritative seed. Retrieves the
 * subscription for accurate status/price/period, then upserts the email-keyed row. Returns
 * `{ handled: false }` for non-monitor sessions so the caller falls through to its own logic.
 */
export async function handleMonitorCheckoutCompleted(args: {
  supabase: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  env: MonitorPriceEnv;
  nowMs: number;
}): Promise<{ handled: boolean; ok?: boolean; error?: string }> {
  const { supabase, stripe, session, env, nowMs } = args;
  if (session.metadata?.['kind'] !== 'monitor') return { handled: false };

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const monitoredUrl = session.metadata?.['monitored_url'] ?? null;
  if (!email || !monitoredUrl) {
    return { handled: true, ok: false, error: 'missing_email_or_url' };
  }

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  let status: MonitorStatus = 'active';
  let priceId: string | null = null;
  let currentPeriodEnd: string | null = null;
  let plan: MonitorPlan = normalizeMonitorPlan(session.metadata?.['plan']);
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      status = mapStripeStatus(sub.status);
      priceId = sub.items?.data?.[0]?.price?.id ?? null;
      currentPeriodEnd = isoFromUnix(sub.current_period_end);
      plan = resolveMonitorPlan(priceId, env) ?? plan;
    } catch {
      /* fall back to session-derived values */
    }
  }

  const result = await seedMonitorSubscription(supabase, {
    email,
    monitoredUrl,
    plan,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subId,
    stripePriceId: priceId,
    originScanId: (session.metadata?.['scan_id'] as string | undefined) ?? null,
    status,
    nowMs,
  });
  if (result.ok && currentPeriodEnd && subId) {
    await supabase
      .from('monitoring_subscriptions')
      .update({ current_period_end: currentPeriodEnd })
      .eq('stripe_subscription_id', subId);
  }
  return { handled: true, ok: result.ok, error: result.error };
}

/** subscription.created/updated/deleted for a monitor subscription. */
export async function handleMonitorSubscriptionEvent(args: {
  supabase: SupabaseClient;
  subscription: Stripe.Subscription;
  env: MonitorPriceEnv;
  deleted: boolean;
  nowMs: number;
}): Promise<{ handled: boolean }> {
  const { supabase, subscription, env, deleted, nowMs } = args;
  if (!isMonitorSubscriptionObject(subscription, env)) return { handled: false };
  await updateMonitorSubscriptionStatus(supabase, {
    stripeSubscriptionId: subscription.id,
    status: deleted ? 'canceled' : mapStripeStatus(subscription.status),
    currentPeriodEnd: isoFromUnix(subscription.current_period_end),
    nowMs,
  });
  return { handled: true };
}

/** invoice.payment_succeeded/failed for a monitor subscription (detected by an existing row). */
export async function handleMonitorInvoiceEvent(args: {
  supabase: SupabaseClient;
  invoice: Stripe.Invoice;
  paid: boolean;
  nowMs: number;
}): Promise<{ handled: boolean }> {
  const { supabase, invoice, paid, nowMs } = args;
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;
  if (!subId || !(await isMonitorSubscription(supabase, subId))) return { handled: false };
  await updateMonitorSubscriptionStatus(supabase, {
    stripeSubscriptionId: subId,
    status: paid ? 'active' : 'past_due',
    currentPeriodEnd: isoFromUnix(invoice.period_end),
    nowMs,
  });
  return { handled: true };
}
