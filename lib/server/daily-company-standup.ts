import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentStatus } from './agent-console';
import {
  loadFounderControlRoom,
  type WorkforceView,
} from './founder-control-room';
import {
  loadRevenueAgencySnapshot,
  type RevenueAgencySnapshot,
} from './revenue-agency-agent';
import {
  isExcludedRevenueIdentity,
  isVerifiedStripeSubscriptionId,
} from './revenue-identity';

export {
  isExcludedRevenueIdentity,
  isVerifiedStripeSubscriptionId,
} from './revenue-identity';

export type DepartmentId =
  | 'maya'
  | 'noah'
  | 'priya'
  | 'elena'
  | 'sofia'
  | 'jordan'
  | 'marcus'
  | 'codex';

export type AccountabilityLevel = 'pass' | 'watch' | 'fail' | 'not_evaluated';

export type AccountabilityCheck = {
  readonly key: string;
  readonly label: string;
  readonly level: AccountabilityLevel;
  readonly detail: string;
};

export type StandupWorkLoop = {
  readonly id: string;
  readonly source_type: string;
  readonly source_key: string;
  readonly lane: string;
  readonly owner: string;
  readonly state: string;
  readonly severity: string;
  readonly title: string;
  readonly detail: string | null;
  readonly next_action: string | null;
  readonly due_at: string | null;
  readonly attempt_count: number;
  readonly max_attempts: number;
  readonly founder_required: boolean;
  readonly blocker: string | null;
  readonly evidence: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;
  readonly verified_at: string | null;
  readonly resolved_at: string | null;
  readonly updated_at: string;
};

export type DepartmentStandup = {
  readonly id: DepartmentId;
  readonly name: string;
  readonly role: string;
  readonly remit: string;
  readonly status: 'on_track' | 'watch' | 'needs_intervention' | 'no_evidenced_work';
  readonly outcome: string;
  readonly workedOn: readonly string[];
  readonly workingNext: readonly string[];
  readonly blockers: readonly string[];
  readonly checks: readonly AccountabilityCheck[];
  readonly rubric: readonly string[];
};

export type DailyCompanyStandup = {
  readonly reportDate: string;
  readonly generatedAt: string;
  readonly verdict: 'healthy and growing' | 'revenue stalled with corrective action underway';
  readonly focus: string;
  readonly focusReason: string;
  readonly strongestSignal: string;
  readonly verifiedRecurringCustomers: number;
  readonly revenue: {
    readonly outreachSends: number;
    readonly outreachOpens: number;
    readonly replies: number;
    readonly meetings: number;
    readonly workspaceRecordsCreated: number;
    readonly qualifiedWorkspaceActivations: number;
    readonly checkoutStarts: number;
    readonly paidSubscriptionsStarted: number;
    readonly cancellations: number;
  };
  readonly activity: {
    readonly completedPast24h: number;
    readonly open: number;
    readonly overdue: number;
    readonly exhausted: number;
    readonly founderRequired: number;
  };
  readonly departments: readonly DepartmentStandup[];
  readonly founderDecisions: readonly string[];
  readonly limitations: readonly string[];
};

const OPEN_STATES = new Set(['discovered', 'assigned', 'executing', 'verifying', 'blocked']);

export const DEPARTMENT_RUBRICS: Readonly<Record<DepartmentId, readonly string[]>> = {
  maya: [
    'Names the deepest revenue constraint using real funnel evidence.',
    'Every open item has one owner, next action, deadline, and closure condition.',
    'Accepts completion only when evidence verifies the outcome.',
    'Escalates only genuine founder decisions.',
    'Records one complete daily company standup and sends only qualifying exceptions.',
  ],
  noah: [
    'Moves real signups through onboarding to a visible useful baseline.',
    'Recovers stalled activation without inventing customer activity.',
    'Keeps onboarding and entitlement paths functional.',
    'Measures time to first value and activation.',
  ],
  priya: [
    'Uses source-backed, vertical-relevant search and customer evidence.',
    'Turns evidence into useful scorecards, reports, and next actions.',
    'Verifies delivery and customer outcome measurement.',
    'Avoids generic content work disconnected from the active campaign.',
  ],
  elena: [
    'Maintains qualified, lawful, deduplicated prospect coverage.',
    'Executes only approved outreach and respects all exit conditions.',
    'Classifies every reply and routes positive intent promptly.',
    'Optimizes human reply, meeting, activation, and subscription movement.',
  ],
  sofia: [
    'Produces source-linked buyer and competitor research.',
    'Keeps every insight relevant to the active vertical and buyer problem.',
    'Extracts patterns without copying third-party assets.',
    'Hands Jordan a clear claim boundary and original angle.',
  ],
  jordan: [
    'Creates original campaign-aligned content with one useful buyer outcome.',
    'Passes editorial, visual, claim, privacy, and attribution gates.',
    'Proves actual publication instead of treating a draft as completion.',
    'Reviews downstream actions and stops repeated losing formats.',
  ],
  marcus: [
    'Keeps customer-critical runtime, queues, providers, billing, and webhooks healthy.',
    'Reproduces and repairs defects through deployment and fresh production evidence.',
    'Uses bounded retries and changes strategy when attempts are exhausted.',
    'Protects spend, security, privacy, and data integrity.',
  ],
  codex: [
    'Keeps the company focused on the first real recurring customer.',
    'Selects one bounded experiment and enforces its success and stop conditions.',
    'Closes engineering and operating loops through production verification.',
    'Coordinates department heads without creating unnecessary systems or work.',
  ],
};

const OWNER_ALIASES: Readonly<Record<string, DepartmentId>> = {
  maya: 'maya',
  'maya brooks': 'maya',
  noah: 'noah',
  'noah carter': 'noah',
  priya: 'priya',
  'priya shah': 'priya',
  elena: 'elena',
  'elena park': 'elena',
  sofia: 'sofia',
  'sofia chen': 'sofia',
  jordan: 'jordan',
  'jordan reyes': 'jordan',
  marcus: 'marcus',
  'marcus reed': 'marcus',
  codex: 'codex',
};

function ownerId(value: string): DepartmentId | null {
  return OWNER_ALIASES[value.trim().toLowerCase()] ?? null;
}

function hasEvidence(value: Record<string, unknown> | null): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function isOpen(loop: StandupWorkLoop): boolean {
  return OPEN_STATES.has(loop.state);
}

function isPast24Hours(value: string | null, now: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= now.getTime() - 86_400_000;
}

function isOverdue(loop: StandupWorkLoop, now: Date): boolean {
  if (!isOpen(loop) || !loop.due_at) return false;
  const due = new Date(loop.due_at).getTime();
  return Number.isFinite(due) && due < now.getTime();
}

function isExhausted(loop: StandupWorkLoop): boolean {
  return isOpen(loop) && loop.attempt_count >= loop.max_attempts;
}

function check(
  key: string,
  label: string,
  level: AccountabilityLevel,
  detail: string
): AccountabilityCheck {
  return { key, label, level, detail };
}

function genericChecks(loops: readonly StandupWorkLoop[], now: Date): AccountabilityCheck[] {
  const open = loops.filter(isOpen);
  const completed = loops.filter(
    (loop) => loop.state === 'completed' && isPast24Hours(loop.resolved_at, now)
  );
  const overdue = open.filter((loop) => isOverdue(loop, now));
  const exhausted = open.filter(isExhausted);
  const missingHandoff = open.filter((loop) => !loop.next_action?.trim() || !loop.due_at);
  const unverified = completed.filter(
    (loop) => !loop.verified_at && !hasEvidence(loop.evidence)
  );
  const blocked = open.filter((loop) => loop.state === 'blocked');
  const unexplainedBlocked = blocked.filter((loop) => !loop.blocker?.trim());

  return [
    check(
      'timeliness',
      'Timeliness and retry control',
      overdue.length > 0 || exhausted.length > 0 ? 'fail' : 'pass',
      overdue.length > 0 || exhausted.length > 0
        ? `${overdue.length} overdue and ${exhausted.length} exhausted item(s).`
        : 'No overdue or exhausted assigned work.'
    ),
    check(
      'closure_evidence',
      'Evidence-backed closure',
      completed.length === 0 ? 'not_evaluated' : unverified.length > 0 ? 'fail' : 'pass',
      completed.length === 0
        ? 'No completed work was recorded in the last 24 hours.'
        : unverified.length > 0
          ? `${unverified.length} completion(s) lack verification evidence.`
          : `${completed.length} completion(s) include evidence or verification.`
    ),
    check(
      'next_action',
      'Next-action clarity',
      open.length === 0 ? 'not_evaluated' : missingHandoff.length > 0 ? 'fail' : 'pass',
      open.length === 0
        ? 'No open assigned work.'
        : missingHandoff.length > 0
          ? `${missingHandoff.length} open item(s) lack a next action or deadline.`
          : 'Every open item has a next action and deadline.'
    ),
    check(
      'blocker_ownership',
      'Blocker ownership',
      unexplainedBlocked.length > 0 ? 'fail' : blocked.length > 0 ? 'watch' : 'pass',
      unexplainedBlocked.length > 0
        ? `${unexplainedBlocked.length} blocked item(s) do not explain the blocker.`
        : blocked.length > 0
          ? `${blocked.length} explained blocker(s) remain open.`
          : 'No blocked work.'
    ),
  ];
}

function accountabilityStatus(
  checks: readonly AccountabilityCheck[],
  hasRecordedWork: boolean
): DepartmentStandup['status'] {
  if (checks.some((item) => item.level === 'fail')) return 'needs_intervention';
  if (checks.some((item) => item.level === 'watch')) return 'watch';
  return hasRecordedWork ? 'on_track' : 'no_evidenced_work';
}

function strongestSignal(snapshot: RevenueAgencySnapshot, verifiedRecurring: number): string {
  if (verifiedRecurring > 0) {
    return `${verifiedRecurring} prospect- or lead-linked recurring customer(s) remain active.`;
  }
  if (snapshot.meetingsBooked > 0) return `${snapshot.meetingsBooked} meeting(s) booked.`;
  if (snapshot.repliesReceived > 0) return `${snapshot.repliesReceived} human reply/replies received.`;
  if (snapshot.checkoutStarts > 0) return `${snapshot.checkoutStarts} checkout start(s) recorded.`;
  if (snapshot.qualifiedWorkspaceActivations > 0) {
    return `${snapshot.qualifiedWorkspaceActivations} workspace(s) reached product first value. Product/pilot activity only; not evidence of buying intent.`;
  }
  if (snapshot.deliveredReports > 0) {
    return `${snapshot.deliveredReports} report(s) delivered. Product/pilot activity only; not evidence of buying intent.`;
  }
  if (snapshot.completedScans > 0) return `${snapshot.completedScans} scan(s) completed. Product/pilot activity only; not evidence of buying intent.`;
  if (snapshot.outreachSends > 0) {
    return `${snapshot.outreachSends} provider-accepted outreach send(s); no deeper movement yet.`;
  }
  return 'No trustworthy commercial movement was recorded.';
}

function departmentOutcome(
  id: DepartmentId,
  snapshot: RevenueAgencySnapshot,
  loops: readonly StandupWorkLoop[],
  verifiedRecurring: number
): string {
  const open = loops.filter(isOpen).length;
  switch (id) {
    case 'maya':
      return `${open} company work item(s) open; focus is ${snapshot.focus}.`;
    case 'noah':
      return `${snapshot.workspaceRecordsCreated} workspace record(s) created and ${snapshot.qualifiedWorkspaceActivations} product first-value activation(s) in ${snapshot.windowDays} days; free/pilot usage may be included, not sales qualification.`;
    case 'priya':
      return `${snapshot.completedScans} product scan(s) and ${snapshot.deliveredReports} delivered report(s) in ${snapshot.windowDays} days; internal/partner tests may be included.`;
    case 'elena':
      return `${snapshot.outreachSends} send(s), ${snapshot.repliesReceived} reply/replies, and ${snapshot.meetingsBooked} meeting(s) in ${snapshot.windowDays} days.`;
    case 'sofia':
      return `${open} owned research or audience work item(s) currently open.`;
    case 'jordan':
      return `${snapshot.proofAssets} proof asset(s) created and ${snapshot.publishedProof} published in ${snapshot.windowDays} days.`;
    case 'marcus':
      return `${open} reliability work item(s) currently open.`;
    case 'codex':
      return `Company focus is ${snapshot.focus}; verified recurring customers: ${verifiedRecurring}.`;
  }
}

function formatDue(value: string | null): string {
  if (!value) return 'No deadline';
  const due = new Date(value);
  if (!Number.isFinite(due.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(due);
}

function globalMayaChecks(args: {
  readonly loops: readonly StandupWorkLoop[];
  readonly snapshot: RevenueAgencySnapshot;
  readonly now: Date;
}): AccountabilityCheck[] {
  const open = args.loops.filter(isOpen);
  const completed = args.loops.filter(
    (loop) => loop.state === 'completed' && isPast24Hours(loop.resolved_at, args.now)
  );
  const incompleteOwnership = open.filter(
    (loop) => !loop.owner.trim() || !loop.next_action?.trim() || !loop.due_at
  );
  const unsupportedClosure = completed.filter(
    (loop) => !loop.verified_at && !hasEvidence(loop.evidence)
  );
  const overdue = open.filter((loop) => isOverdue(loop, args.now));
  const exhausted = open.filter(isExhausted);
  const founderItems = open.filter((loop) => loop.founder_required);
  const weakFounderItems = founderItems.filter(
    (loop) => !loop.blocker?.trim() || !loop.next_action?.trim()
  );
  const revenueAction = open.some((loop) => {
    const metadata = loop.metadata ?? {};
    return (
      loop.source_type === 'campaign_experiment'
      || typeof metadata['growth_campaign_id'] === 'string'
      || ['outreach', 'revenue', 'sales'].includes(loop.lane)
    );
  });

  return [
    check(
      'owner_coverage',
      'Company ownership coverage',
      incompleteOwnership.length > 0 ? 'fail' : 'pass',
      incompleteOwnership.length > 0
        ? `${incompleteOwnership.length} open item(s) lack an owner, next action, or deadline.`
        : `All ${open.length} open item(s) have accountable handoffs.`
    ),
    check(
      'closure_integrity',
      'Independent closure verification',
      completed.length === 0 ? 'not_evaluated' : unsupportedClosure.length > 0 ? 'fail' : 'pass',
      completed.length === 0
        ? 'No company completion was recorded in the last 24 hours.'
        : unsupportedClosure.length > 0
          ? `${unsupportedClosure.length} company completion(s) lack evidence.`
          : `${completed.length} company completion(s) were evidence-backed.`
    ),
    check(
      'deadline_control',
      'Deadline and retry control',
      overdue.length > 0 || exhausted.length > 0 ? 'fail' : 'pass',
      overdue.length > 0 || exhausted.length > 0
        ? `${overdue.length} overdue and ${exhausted.length} exhausted company item(s).`
        : 'No overdue or exhausted company work.'
    ),
    check(
      'escalation_hygiene',
      'Founder escalation discipline',
      weakFounderItems.length > 0 ? 'fail' : founderItems.length > 0 ? 'watch' : 'pass',
      weakFounderItems.length > 0
        ? `${weakFounderItems.length} founder item(s) lack a precise decision or blocker.`
        : founderItems.length > 0
          ? `${founderItems.length} documented founder decision(s) remain.`
          : 'No routine work was pushed to the founder.'
    ),
    check(
      'revenue_action',
      'Revenue action in motion',
      revenueAction ? 'pass' : 'fail',
      revenueAction
        ? `At least one owned action supports the ${args.snapshot.focus} constraint.`
        : `No open action is tied to the ${args.snapshot.focus} revenue constraint.`
    ),
  ];
}

function buildDepartment(args: {
  readonly view: WorkforceView;
  readonly loops: readonly StandupWorkLoop[];
  readonly snapshot: RevenueAgencySnapshot;
  readonly now: Date;
  readonly verifiedRecurring: number;
}): DepartmentStandup {
  const id = args.view.id;
  const owned = args.loops.filter((loop) => ownerId(loop.owner) === id);
  const completed = owned
    .filter((loop) => loop.state === 'completed' && isPast24Hours(loop.resolved_at, args.now))
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
  const open = owned
    .filter(isOpen)
    .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const checks = id === 'maya'
    ? globalMayaChecks({ loops: args.loops, snapshot: args.snapshot, now: args.now })
    : genericChecks(owned, args.now);
  const workedOn = completed.slice(0, 3).map((loop) => loop.title);
  if (workedOn.length === 0 && args.view.lastAction) {
    workedOn.push(`Operational event: ${args.view.lastAction.event}`);
  }
  if (workedOn.length === 0) workedOn.push('No evidenced completion in the last 24 hours.');
  const workingNext = open.slice(0, 3).map(
    (loop) => `${loop.title}: ${loop.next_action ?? 'Next action missing'} (due ${formatDue(loop.due_at)})`
  );
  if (workingNext.length === 0) workingNext.push(args.view.nextAction);
  const blockers = [
    ...new Set([
      ...args.view.blockers,
      ...open.map((loop) => loop.blocker?.trim()).filter((value): value is string => Boolean(value)),
    ]),
  ];

  return {
    id,
    name: args.view.name,
    role: args.view.role,
    remit: args.view.job,
    status: accountabilityStatus(checks, completed.length > 0 || open.length > 0 || Boolean(args.view.lastAction)),
    outcome: departmentOutcome(
      id,
      args.snapshot,
      id === 'maya' ? args.loops : owned,
      args.verifiedRecurring
    ),
    workedOn,
    workingNext,
    blockers,
    checks,
    rubric: DEPARTMENT_RUBRICS[id],
  };
}

function buildCodexDepartment(args: {
  readonly loops: readonly StandupWorkLoop[];
  readonly snapshot: RevenueAgencySnapshot;
  readonly now: Date;
  readonly verifiedRecurring: number;
}): DepartmentStandup {
  const owned = args.loops.filter((loop) => ownerId(loop.owner) === 'codex');
  const completed = owned
    .filter((loop) => loop.state === 'completed' && isPast24Hours(loop.resolved_at, args.now))
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
  const open = owned.filter(isOpen);
  const globalChecks = globalMayaChecks({
    loops: args.loops,
    snapshot: args.snapshot,
    now: args.now,
  });
  const checks = [
    globalChecks.find((item) => item.key === 'revenue_action')!,
    globalChecks.find((item) => item.key === 'deadline_control')!,
    ...genericChecks(owned, args.now).filter((item) => item.key !== 'timeliness'),
  ];
  const workedOn = completed.slice(0, 3).map((loop) => loop.title);
  if (workedOn.length === 0) {
    workedOn.push('Coordinated the company constraint and evidence-gated operating loop.');
  }
  const workingNext = open.slice(0, 3).map(
    (loop) => `${loop.title}: ${loop.next_action ?? 'Next action missing'} (due ${formatDue(loop.due_at)})`
  );
  if (workingNext.length === 0) {
    workingNext.push(`Drive the ${args.snapshot.focus} constraint: ${args.snapshot.focusReason}`);
  }
  const blockers = open
    .map((loop) => loop.blocker?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    id: 'codex',
    name: 'Codex',
    role: 'Technical Co-Founder, COO & Growth Operator',
    remit: 'Runs the operating cadence, repairs the product, enforces accountability, and drives the first recurring customer.',
    status: accountabilityStatus(checks, true),
    outcome: departmentOutcome('codex', args.snapshot, owned, args.verifiedRecurring),
    workedOn,
    workingNext,
    blockers,
    checks,
    rubric: DEPARTMENT_RUBRICS.codex,
  };
}

export function buildDailyCompanyStandup(args: {
  readonly snapshot: RevenueAgencySnapshot;
  readonly workforce: readonly WorkforceView[];
  readonly loops: readonly StandupWorkLoop[];
  readonly founderDecisions: readonly string[];
  readonly verifiedRecurringCustomers: number;
  readonly limitations?: readonly string[];
  readonly now?: Date;
}): DailyCompanyStandup {
  const now = args.now ?? new Date();
  const open = args.loops.filter(isOpen);
  const completed = args.loops.filter(
    (loop) => loop.state === 'completed' && isPast24Hours(loop.resolved_at, now)
  );
  const overdue = open.filter((loop) => isOverdue(loop, now));
  const exhausted = open.filter(isExhausted);
  const founderRequired = open.filter((loop) => loop.founder_required);
  const revenueTruthSnapshot: RevenueAgencySnapshot =
    args.verifiedRecurringCustomers === 0 && args.snapshot.focus === 'retain'
      ? {
          ...args.snapshot,
          focus: 'convert',
          focusReason: 'No verified non-internal recurring customer exists; one-time payments, trials, and comps do not advance the company to retention.',
        }
      : args.snapshot;
  const departments = [
    ...args.workforce.map((view) =>
      buildDepartment({
        view,
        loops: args.loops,
        snapshot: revenueTruthSnapshot,
        now,
        verifiedRecurring: args.verifiedRecurringCustomers,
      })
    ),
    buildCodexDepartment({
      loops: args.loops,
      snapshot: revenueTruthSnapshot,
      now,
      verifiedRecurring: args.verifiedRecurringCustomers,
    }),
  ];

  return {
    reportDate: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      dateStyle: 'full',
    }).format(now),
    generatedAt: now.toISOString(),
    verdict:
      args.verifiedRecurringCustomers > 0
        ? 'healthy and growing'
        : 'revenue stalled with corrective action underway',
    focus: revenueTruthSnapshot.focus,
    focusReason: revenueTruthSnapshot.focusReason,
    strongestSignal: strongestSignal(args.snapshot, args.verifiedRecurringCustomers),
    verifiedRecurringCustomers: args.verifiedRecurringCustomers,
    revenue: {
      outreachSends: args.snapshot.outreachSends,
      outreachOpens: args.snapshot.outreachOpens,
      replies: args.snapshot.repliesReceived,
      meetings: args.snapshot.meetingsBooked,
      workspaceRecordsCreated: args.snapshot.workspaceRecordsCreated,
      qualifiedWorkspaceActivations: args.snapshot.qualifiedWorkspaceActivations,
      checkoutStarts: args.snapshot.checkoutStarts,
      paidSubscriptionsStarted: args.snapshot.paidSubscriptionsStarted,
      cancellations: args.snapshot.cancellations,
    },
    activity: {
      completedPast24h: completed.length,
      open: open.length,
      overdue: overdue.length,
      exhausted: exhausted.length,
      founderRequired: founderRequired.length,
    },
    departments,
    founderDecisions: [
      ...new Set([
        ...args.founderDecisions,
        ...founderRequired.map(
          (loop) => `${loop.owner}: ${loop.next_action ?? loop.blocker ?? loop.title}`
        ),
      ]),
    ],
    limitations: args.limitations ?? [],
  };
}

type SubscriptionMetadata = Record<string, unknown> | null;

type ActiveMonitoringSubscription = {
  readonly id: string;
  readonly email: string;
  readonly domain: string | null;
  readonly stripe_subscription_id: string | null;
};

type ActiveWorkspaceSubscription = {
  readonly id: string;
  readonly user_id: string;
  readonly stripe_subscription_id: string | null;
  readonly metadata: SubscriptionMetadata;
};

async function loadVerifiedRecurringCustomers(
  supabase: SupabaseClient
): Promise<{ count: number; limitations: string[] }> {
  const limitations: string[] = [];
  const customers = new Set<string>();
  try {
    const [monitoringResult, workspaceResult] = await Promise.all([
      supabase
        .from('monitoring_subscriptions')
        .select('id,email,domain,stripe_subscription_id')
        .eq('status', 'active')
        .limit(2_000),
      supabase
        .from('user_subscriptions')
        .select('id,user_id,stripe_subscription_id,metadata')
        .eq('status', 'active')
        .limit(2_000),
    ]);

    if (monitoringResult.error) {
      limitations.push('The active monitoring-subscription ledger could not be read.');
    } else {
      for (const row of (monitoringResult.data ?? []) as ActiveMonitoringSubscription[]) {
        if (
          isVerifiedStripeSubscriptionId(row.stripe_subscription_id)
          && !isExcludedRevenueIdentity({ email: row.email, domain: row.domain })
        ) {
          customers.add(row.email.trim().toLowerCase());
        }
      }
    }

    if (workspaceResult.error) {
      limitations.push('The active workspace-subscription ledger could not be read.');
    } else {
      const subscriptions = (workspaceResult.data ?? []) as ActiveWorkspaceSubscription[];
      const userIds = [...new Set(subscriptions.map((row) => row.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id,email')
          .in('id', userIds);
        if (usersError) {
          limitations.push('Workspace subscription owners could not be verified.');
        } else {
          const emailByUser = new Map(
            ((users ?? []) as Array<{ id: string; email: string }>).map((row) => [row.id, row.email])
          );
          for (const row of subscriptions) {
            const email = emailByUser.get(row.user_id) ?? null;
            if (
              isVerifiedStripeSubscriptionId(row.stripe_subscription_id)
              && !isExcludedRevenueIdentity({ email, metadata: row.metadata })
            ) {
              customers.add(email!.trim().toLowerCase());
            }
          }
        }
      }
    }

    return { count: customers.size, limitations };
  } catch {
    return {
      count: 0,
      limitations: ['The active recurring-subscription ledgers were unavailable.'],
    };
  }
}

export async function loadDailyCompanyStandup(args: {
  readonly supabase: SupabaseClient;
  readonly agents: readonly AgentStatus[];
  readonly now?: Date;
}): Promise<DailyCompanyStandup> {
  const now = args.now ?? new Date();
  const snapshot = await loadRevenueAgencySnapshot(args.supabase, now, 30);
  const room = await loadFounderControlRoom(args.supabase, args.agents, snapshot);
  const [{ data: loopData, error: loopError }, verified] = await Promise.all([
    args.supabase
      .from('agent_work_loops')
      .select('id,source_type,source_key,lane,owner,state,severity,title,detail,next_action,due_at,attempt_count,max_attempts,founder_required,blocker,evidence,metadata,verified_at,resolved_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1_000),
    loadVerifiedRecurringCustomers(args.supabase),
  ]);
  const limitations = [...verified.limitations];
  if (loopError) limitations.push('The work-loop ledger could not be read.');

  return buildDailyCompanyStandup({
    snapshot,
    workforce: room.workforce,
    loops: ((loopData ?? []) as StandupWorkLoop[]),
    founderDecisions: room.founderDecisions,
    verifiedRecurringCustomers: verified.count,
    limitations,
    now,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function listHtml(items: readonly string[], empty: string): string {
  const values = items.length > 0 ? items : [empty];
  return `<ul style="margin:8px 0 0;padding-left:20px">${values
    .map((item) => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

function checkColor(level: AccountabilityLevel): string {
  if (level === 'pass') return '#166534';
  if (level === 'watch') return '#a16207';
  if (level === 'fail') return '#b91c1c';
  return '#64748b';
}

function departmentHtml(department: DepartmentStandup): string {
  const checks = department.checks
    .map(
      (item) =>
        `<li style="margin:0 0 7px;color:${checkColor(item.level)}"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>`
    )
    .join('');
  return `
    <section style="margin:0 0 18px;padding:18px;border:1px solid #e5e7eb;border-radius:14px;background:#ffffff">
      <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(department.role)}</p>
      <h3 style="margin:5px 0 0;font-size:20px;color:#111827">${escapeHtml(department.name)} · ${escapeHtml(department.status.replaceAll('_', ' '))}</h3>
      <p style="margin:8px 0 0;color:#374151"><strong>Outcome:</strong> ${escapeHtml(department.outcome)}</p>
      <p style="margin:12px 0 0"><strong>Role rubric</strong></p>
      ${listHtml(department.rubric, 'No role rubric configured.')}
      <p style="margin:12px 0 0"><strong>Worked on</strong></p>
      ${listHtml(department.workedOn, 'No evidenced work.')}
      <p style="margin:12px 0 0"><strong>Working next</strong></p>
      ${listHtml(department.workingNext, 'No next action recorded.')}
      <p style="margin:12px 0 0"><strong>Blockers</strong></p>
      ${listHtml(department.blockers, 'None recorded.')}
      <p style="margin:12px 0 0"><strong>Accountability checks</strong></p>
      <ul style="margin:8px 0 0;padding-left:20px">${checks}</ul>
    </section>`;
}

export function renderDailyCompanyStandupHtml(report: DailyCompanyStandup): string {
  const departmentSections = report.departments.map(departmentHtml).join('');
  const decisions = report.founderDecisions.length > 0
    ? listHtml(report.founderDecisions, 'None.')
    : '<p style="margin:8px 0 0;color:#166534">None. Routine work remains with the team.</p>';
  const limitations = report.limitations.length > 0
    ? `<h2 style="margin:28px 0 0;font-size:20px">Data limitations</h2>${listHtml(report.limitations, 'None.')}`
    : '';

  return `
    <main style="max-width:760px;margin:0 auto;font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <p style="margin:0;color:#7c3aed;font-size:12px;text-transform:uppercase;letter-spacing:.1em">GEO-Pulse daily company standup</p>
      <h1 style="margin:8px 0 0;font-size:30px">${escapeHtml(report.reportDate)}</h1>
      <p style="margin:8px 0 0;font-size:18px"><strong>Verdict:</strong> ${escapeHtml(report.verdict)}</p>
      <p style="margin:8px 0 0"><strong>Current constraint:</strong> ${escapeHtml(report.focus)}. ${escapeHtml(report.focusReason)}</p>
      <p style="margin:8px 0 0"><strong>Strongest trustworthy signal:</strong> ${escapeHtml(report.strongestSignal)}</p>

      <h2 style="margin:28px 0 10px;font-size:22px">Revenue scoreboard · 30 days</h2>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc">
        <tbody>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Outreach sent / opened</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.revenue.outreachSends} / ${report.revenue.outreachOpens}</strong></td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Human replies / meetings</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.revenue.replies} / ${report.revenue.meetings}</strong></td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Workspace records created / product first value (not sales qualification)</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.revenue.workspaceRecordsCreated} / ${report.revenue.qualifiedWorkspaceActivations}</strong></td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Checkout starts</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.revenue.checkoutStarts}</strong></td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Paid subscriptions started / cancellations</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.revenue.paidSubscriptionsStarted} / ${report.revenue.cancellations}</strong></td></tr>
          <tr><td style="padding:9px;border:1px solid #e5e7eb">Verified non-internal recurring customers</td><td style="padding:9px;border:1px solid #e5e7eb"><strong>${report.verifiedRecurringCustomers}</strong></td></tr>
        </tbody>
      </table>

      <h2 style="margin:28px 0 10px;font-size:22px">Company activity debrief · 24 hours</h2>
      <p style="margin:0">${report.activity.completedPast24h} completed · ${report.activity.open} open · ${report.activity.overdue} overdue · ${report.activity.exhausted} exhausted · ${report.activity.founderRequired} founder-required</p>

      <h2 style="margin:28px 0 12px;font-size:22px">Department-head standup</h2>
      <p style="margin:0 0 16px;color:#475569">This debrief is compiled from work loops, production events, and funnel evidence. Department heads do not grade themselves. Maya is evaluated from company-wide ownership and closure evidence.</p>
      ${departmentSections}

      <h2 style="margin:28px 0 0;font-size:22px">Founder decisions only</h2>
      ${decisions}
      ${limitations}
      <p style="margin:28px 0 0"><a href="https://getgeopulse.com/admin/campaigns">Open Loop Control</a></p>
    </main>`;
}
