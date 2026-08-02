/**
 * Campaign results (VCI-8 / ECP-4).
 *
 * The funnel exists to support one decision — scale, revise, or stop — so it is built to resist
 * the two ways an early campaign flatters itself:
 *
 *   1. **Zero is not the same as unknown.** A stage whose denominator cannot be established
 *      renders `not_available`, never `0`. "0 replies out of 25" is a finding; "0 replies out of
 *      an unknown number of delivered messages" is not, and printing it as 0% would invent one.
 *   2. **Only a real active recurring subscription is revenue.** Opens and clicks carry their
 *      measurement limitation with them; test mail, internal addresses, and Jack/Lifter are
 *      excluded from the revenue stages entirely.
 *
 * Stage age matters as much as stage count: a cohort stuck at "sent" for eleven days is a
 * different problem from one that reached "replied" and stalled, and the operator should not have
 * to open a ledger to tell them apart.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailCampaignV1 } from './email-campaign-contract';

export type FunnelStageKey =
  | 'eligible'
  | 'enrolled'
  | 'queued'
  | 'sent'
  | 'provider_accepted'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'positive_reply'
  | 'walkthrough'
  | 'trial_or_baseline'
  | 'checkout'
  | 'active_recurring_subscription';

export interface FunnelStage {
  readonly key: FunnelStageKey;
  readonly label: string;
  /** null means not_available — never render it as zero. */
  readonly count: number | null;
  readonly unavailableReason: string | null;
  readonly denominator: number | null;
  readonly ratePercent: number | null;
  /** Hours since the oldest record still sitting at this stage. */
  readonly stageAgeHours: number | null;
  readonly limitation: string | null;
  readonly isRevenue: boolean;
}

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  eligible: 'Eligible',
  enrolled: 'Enrolled',
  queued: 'Queued',
  sent: 'Sent',
  provider_accepted: 'Provider accepted / delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  replied: 'Replied',
  positive_reply: 'Positive reply',
  walkthrough: 'Walkthrough',
  trial_or_baseline: 'Trial / baseline',
  checkout: 'Checkout',
  active_recurring_subscription: 'Active recurring subscription',
};

const STAGE_ORDER: readonly FunnelStageKey[] = [
  'eligible', 'enrolled', 'queued', 'sent', 'provider_accepted', 'opened', 'clicked',
  'replied', 'positive_reply', 'walkthrough', 'trial_or_baseline', 'checkout',
  'active_recurring_subscription',
];

const STAGE_LIMITATIONS: Partial<Record<FunnelStageKey, string>> = {
  opened: 'Pixel opens undercount — image blocking is common. Treat as a floor, never as engagement truth.',
  clicked: 'Click tracking is first-party and link-based; a forwarded or copied link is not attributed.',
  provider_accepted: 'Provider acceptance is not delivery to a human inbox and is never engagement.',
};

const REVENUE_STAGES = new Set<FunnelStageKey>(['active_recurring_subscription']);

/**
 * Addresses that must never count toward a commercial result. Internal senders and the existing
 * Jack/Lifter relationship are excluded by explicit rule rather than by hoping nobody notices —
 * the whole point of VCI-8's revenue outcome is "a real customer who is not Jack/Lifter".
 */
export const NON_COMMERCIAL_EMAIL_DOMAINS: readonly string[] = [
  'getgeopulse.com', 'geopulse.com', 'lifter.ca', 'techehealthservices.com', 'aurionclinical.com',
];

export function isNonCommercialEmail(email: string, testRecipients: readonly string[] = []): boolean {
  const value = email.trim().toLowerCase();
  if (testRecipients.map((entry) => entry.toLowerCase()).includes(value)) return true;
  const domain = value.slice(value.indexOf('@') + 1);
  return NON_COMMERCIAL_EMAIL_DOMAINS.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`));
}

export interface FunnelInput {
  /** null = the underlying evidence could not be established, NOT "none happened". */
  readonly counts: Partial<Record<FunnelStageKey, number | null>>;
  /** Oldest still-at-this-stage timestamp, for stage age. */
  readonly oldestAt?: Partial<Record<FunnelStageKey, string | null>>;
  readonly nowMs: number;
}

function hours(from: string | null | undefined, nowMs: number): number | null {
  if (!from) return null;
  const ms = Date.parse(from);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(((nowMs - ms) / 3_600_000) * 10) / 10);
}

/**
 * Pure funnel assembly. Each stage's rate is against the nearest EARLIER stage that has a known
 * count — so one unavailable stage in the middle does not silently reparent every later rate onto
 * a denominator the operator was not shown.
 */
export function buildCampaignFunnel(input: FunnelInput): FunnelStage[] {
  const stages: FunnelStage[] = [];
  let lastKnown: { key: FunnelStageKey; count: number } | null = null;

  for (const key of STAGE_ORDER) {
    const raw = input.counts[key];
    const count = typeof raw === 'number' ? raw : null;
    const denominator = lastKnown?.count ?? null;

    stages.push({
      key,
      label: STAGE_LABELS[key],
      count,
      unavailableReason: count === null ? (raw === null ? 'evidence unavailable' : 'not measured for this campaign') : null,
      denominator,
      ratePercent:
        count !== null && denominator !== null && denominator > 0
          ? Math.round((count / denominator) * 1000) / 10
          : null,
      stageAgeHours: hours(input.oldestAt?.[key], input.nowMs),
      limitation: STAGE_LIMITATIONS[key] ?? null,
      isRevenue: REVENUE_STAGES.has(key),
    });

    if (count !== null) lastKnown = { key, count };
  }

  return stages;
}

// ── Operator closure ────────────────────────────────────────────────────────────

export type CampaignDecision = 'scale' | 'revise' | 'stop' | 'continue' | 'not_enough_evidence';

export interface CampaignClosure {
  readonly owner: string;
  readonly nextAction: string;
  readonly dueAt: string | null;
  readonly closureCondition: string;
  readonly retryPolicy: string;
  readonly decision: CampaignDecision;
  readonly rationale: string;
}

/**
 * The evidence-based recommendation. It deliberately refuses to recommend anything until the
 * declared stop threshold is actually reached: "0 replies so far" is not evidence that the message
 * is wrong, and treating it as such is how a campaign gets rewritten before it has been read.
 */
export function deriveCampaignClosure(args: {
  readonly contract: EmailCampaignV1;
  readonly funnel: readonly FunnelStage[];
  readonly stopThresholdSends: number;
}): CampaignClosure {
  const stage = (key: FunnelStageKey) => args.funnel.find((item) => item.key === key)?.count ?? null;
  const accepted = stage('provider_accepted');
  const qualified = stage('positive_reply');
  const walkthroughs = stage('walkthrough');
  const subscriptions = stage('active_recurring_subscription');

  const base = {
    owner: args.contract.goal.owner,
    dueAt: args.contract.schedule.startAt,
    closureCondition: args.contract.goal.closureCondition,
    retryPolicy: args.contract.goal.retryPolicy,
  };

  if (args.contract.state === 'stopped') {
    return {
      ...base,
      decision: 'stop',
      nextAction: 'Record the stop reason and what the next intervention should change.',
      rationale: args.contract.governance.stopReason ?? 'The campaign was stopped.',
    };
  }

  if (subscriptions !== null && subscriptions > 0) {
    return {
      ...base,
      decision: 'scale',
      nextAction: 'Repeat the experiment on a second bounded cohort to test whether the path reproduces.',
      rationale: `${String(subscriptions)} active recurring subscription${subscriptions === 1 ? '' : 's'} attributable to this campaign.`,
    };
  }

  if ((qualified !== null && qualified > 0) || (walkthroughs !== null && walkthroughs > 0)) {
    return {
      ...base,
      decision: 'continue',
      nextAction: 'Work the qualified intent through to a baseline and a checkout before changing the message.',
      rationale: `Success condition met: ${String(qualified ?? 0)} qualified repl${(qualified ?? 0) === 1 ? 'y' : 'ies'}, ${String(walkthroughs ?? 0)} walkthrough(s). Revenue has not followed yet.`,
    };
  }

  if (accepted === null) {
    return {
      ...base,
      decision: 'not_enough_evidence',
      nextAction: 'Reconcile the send ledger before drawing any conclusion from this campaign.',
      rationale: 'Provider acceptance could not be established, so the denominator for every later stage is unknown.',
    };
  }

  if (accepted >= args.stopThresholdSends) {
    return {
      ...base,
      decision: 'revise',
      nextAction: 'Change exactly one variable and run a new intervention version.',
      rationale: `${String(accepted)} provider-accepted first messages reached the declared stop threshold of ${String(args.stopThresholdSends)} with no qualified reply.`,
    };
  }

  return {
    ...base,
    decision: 'not_enough_evidence',
    nextAction: `Let the bounded sequence finish. ${String(args.stopThresholdSends - accepted)} more accepted first message(s) before the declared stop threshold applies.`,
    rationale: `${String(accepted)} of ${String(args.stopThresholdSends)} accepted first messages so far. Deciding now would change the message before it has been read.`,
  };
}

// ── Loading ─────────────────────────────────────────────────────────────────────

export interface CampaignResults {
  readonly funnel: readonly FunnelStage[];
  readonly closure: CampaignClosure;
  readonly excludedNonCommercial: number;
  readonly warnings: readonly string[];
}

async function safeRows(
  label: string,
  promise: PromiseLike<{ data?: unknown; error?: unknown }>,
  warnings: string[],
): Promise<Record<string, any>[] | null> {
  try {
    const result = await promise;
    if (result.error) {
      warnings.push(`${label} could not be loaded`);
      return null;
    }
    return Array.isArray(result.data) ? (result.data as Record<string, any>[]) : [];
  } catch {
    warnings.push(`${label} could not be loaded`);
    return null;
  }
}

/**
 * Reconcile against the existing ledgers. A ledger that fails to load produces a `null` count and
 * therefore `not_available` downstream — never a zero that would read as a real measurement.
 */
export async function loadCampaignResults(args: {
  readonly supabase: SupabaseClient;
  readonly contract: EmailCampaignV1;
  readonly testRecipients?: readonly string[];
  readonly nowMs: number;
}): Promise<CampaignResults> {
  const warnings: string[] = [];
  const audienceId = args.contract.audience.audienceId;

  const enrollments = audienceId
    ? await safeRows(
        'Enrollments',
        args.supabase
          .from('outreach_campaign_enrollments')
          .select('id,contact_id,prospect_id,status,enrolled_at,exited_at')
          .eq('audience_id', audienceId),
        warnings,
      )
    : [];

  const prospectIds = (enrollments ?? [])
    .map((row) => (row.prospect_id ? String(row.prospect_id) : null))
    .filter((id): id is string => Boolean(id));

  const prospects = prospectIds.length > 0
    ? await safeRows(
        'Prospects',
        args.supabase
          .from('outreach_prospects')
          .select('id,email,lifecycle_status,next_run_at,last_run_at,replied_at,converted_at,unsubscribed_at')
          .in('id', prospectIds),
        warnings,
      )
    : [];

  const sends = prospectIds.length > 0
    ? await safeRows(
        'Sends',
        args.supabase
          .from('outreach_sends')
          .select('id,prospect_id,sent_at,opened_at,delivery_status,provider_message_id')
          .in('prospect_id', prospectIds),
        warnings,
      )
    : [];

  const commercialProspects = (prospects ?? []).filter(
    (row) => !isNonCommercialEmail(String(row.email ?? ''), args.testRecipients ?? []),
  );
  const excludedNonCommercial = (prospects ?? []).length - commercialProspects.length;
  const commercialProspectIds = new Set(commercialProspects.map((row) => String(row.id)));
  const commercialSends = (sends ?? []).filter((row) => commercialProspectIds.has(String(row.prospect_id)));

  const emails = commercialProspects.map((row) => String(row.email).toLowerCase());
  const subscriptions = emails.length > 0
    ? await safeRows(
        'Subscriptions',
        args.supabase
          .from('monitoring_subscriptions')
          .select('email,status,created_at')
          .in('status', ['active', 'trialing'])
          .in('email', emails),
        warnings,
      )
    : [];

  const leads = emails.length > 0
    ? await safeRows(
        'Leads',
        args.supabase.from('leads').select('email,request_type,status,created_at').in('email', emails),
        warnings,
      )
    : [];

  const countOrNull = (rows: Record<string, any>[] | null, predicate: (row: Record<string, any>) => boolean): number | null =>
    rows === null ? null : rows.filter(predicate).length;

  const oldest = (rows: Record<string, any>[] | null, field: string, predicate: (row: Record<string, any>) => boolean): string | null => {
    if (!rows) return null;
    const values = rows.filter(predicate).map((row) => String(row[field] ?? '')).filter(Boolean).sort();
    return values[0] ?? null;
  };

  const funnel = buildCampaignFunnel({
    nowMs: args.nowMs,
    counts: {
      eligible: args.contract.audience.recipientCount,
      enrolled: enrollments === null ? null : enrollments.length,
      queued: countOrNull(commercialProspects, (row) => row.lifecycle_status === 'active' && !row.last_run_at),
      sent: countOrNull(commercialSends, () => true),
      provider_accepted: countOrNull(commercialSends, (row) => row.delivery_status === 'sent'),
      opened: countOrNull(commercialSends, (row) => Boolean(row.opened_at)),
      // Click attribution is not wired into this ledger yet — reported as unavailable rather than
      // as zero, which would read as "nobody clicked".
      clicked: null,
      replied: countOrNull(commercialProspects, (row) => Boolean(row.replied_at)),
      positive_reply: countOrNull(commercialProspects, (row) => row.lifecycle_status === 'positive_reply'),
      walkthrough: countOrNull(leads, (row) => String(row.request_type ?? '').includes('walkthrough')),
      trial_or_baseline: countOrNull(subscriptions, (row) => row.status === 'trialing'),
      checkout: countOrNull(subscriptions, () => true),
      active_recurring_subscription: countOrNull(subscriptions, (row) => row.status === 'active'),
    },
    oldestAt: {
      enrolled: oldest(enrollments, 'enrolled_at', () => true),
      sent: oldest(commercialSends, 'sent_at', () => true),
      replied: oldest(commercialProspects, 'replied_at', (row) => Boolean(row.replied_at)),
    },
  });

  return {
    funnel,
    closure: deriveCampaignClosure({
      contract: args.contract,
      funnel,
      stopThresholdSends: args.contract.audience.recipientCount ?? 25,
    }),
    excludedNonCommercial,
    warnings: [...new Set(warnings)],
  };
}
