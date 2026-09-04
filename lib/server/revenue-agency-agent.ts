/**
 * Revenue Agency orchestrator.
 *
 * This is intentionally a thin control layer over the agents GEO-Pulse already trusts:
 * outreach acquires, scans/reports diagnose, social proof distributes evidence, Stripe converts,
 * and monitoring retains. The orchestrator measures the hand-offs, identifies the current
 * bottleneck, and (in autonomous mode) asks the proof agent to replenish the distribution queue.
 *
 * No lead is auto-enrolled and no customer proof is exposed here. Outreach remains restricted to
 * admin-added prospects and the Social Proof Agent keeps its own consent/claim gates.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAutomationSetting } from './automation-settings';
import {
  runSocialProofAgent,
  type SocialProductionEnv,
  type SocialProofAgentResult,
} from './social-proof-agent';
import { structuredLogWithClientAndWait } from './structured-log';
import { runRevenueNurtureAgent, type RevenueNurtureResult } from './revenue-nurture-agent';
import type { LeadEmailEnv } from './lead-email';
import {
  parseProspectingMarkets,
  runAgencyProspectingAgent,
  type AgencyProspectingEnv,
  type AgencyProspectingResult,
} from './agency-prospecting-agent';
import { judgeGrowthLoop, type GrowthJudgeDecision } from './growth-judge';
import {
  isExcludedRevenueIdentity,
  isExternalPaidCheckout,
  isVerifiedStripeSubscriptionId,
  normalizedRevenueDomain,
  type RevenueIdentityMetadata,
} from './revenue-identity';

export type RevenueAgencyMode = 'off' | 'observe' | 'assist' | 'autonomous';

export type RevenueAgencyConfig = {
  readonly mode: RevenueAgencyMode;
  readonly runHourUtc: number;
  readonly socialProofEnabled: boolean;
  readonly nurtureEnabled: boolean;
  readonly nurtureDailyCap: number;
  readonly nurtureDelayHours: number;
  readonly prospectingEnabled: boolean;
  readonly prospectingDailyCap: number;
  readonly prospectingMarkets: readonly string[];
};

export type RevenueStage = {
  readonly key: 'acquire' | 'diagnose' | 'prove' | 'convert' | 'retain';
  readonly label: string;
  readonly value: number;
  readonly status: 'healthy' | 'attention' | 'waiting';
  readonly detail: string;
};

export type RevenueAgencySnapshot = {
  readonly windowDays: number;
  readonly leads: number;
  readonly activatedLeads: number;
  readonly markedConvertedLeads: number;
  readonly convertedLeads: number;
  readonly activeProspects: number;
  readonly outreachSends: number;
  readonly outreachOpens: number;
  readonly completedScans: number;
  readonly deliveredReports: number;
  readonly checkoutStarts: number;
  readonly repliesReceived: number;
  readonly meetingsBooked: number;
  readonly workspaceRecordsCreated: number;
  /** Legacy field name: product first value, potentially free/pilot; not sales qualification. */
  readonly qualifiedWorkspaceActivations: number;
  readonly paymentsCompleted: number;
  readonly paidSubscriptionsStarted: number;
  readonly cancellations: number;
  readonly proofAssets: number;
  readonly publishedProof: number;
  readonly activeMonitoring: number;
  readonly pastDueMonitoring: number;
  readonly activeAgencyAccounts: number;
  readonly stages: RevenueStage[];
  readonly focus: RevenueStage['key'];
  readonly focusReason: string;
};

export type RevenueAgencyRunResult = {
  readonly status: 'completed' | 'skipped' | 'failed';
  readonly mode: RevenueAgencyMode;
  readonly snapshot?: RevenueAgencySnapshot;
  readonly proof?: SocialProofAgentResult;
  readonly nurture?: RevenueNurtureResult;
  readonly prospecting?: AgencyProspectingResult;
  readonly judge?: GrowthJudgeDecision;
  readonly reason?: string;
};

function positiveInt(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), max)
    : fallback;
}

export function resolveRevenueAgencyConfig(
  config: Record<string, unknown>,
  enabled: boolean,
  killed: boolean
): RevenueAgencyConfig {
  const rawMode = typeof config['mode'] === 'string' ? config['mode'] : '';
  const mode: RevenueAgencyMode =
    killed || !enabled
      ? 'off'
      : rawMode === 'observe' || rawMode === 'assist' || rawMode === 'autonomous'
        ? rawMode
        : 'observe';
  return {
    mode,
    runHourUtc: positiveInt(config['run_hour_utc'], 14, 23),
    socialProofEnabled:
      typeof config['social_proof_enabled'] === 'boolean'
        ? config['social_proof_enabled']
        : true,
    nurtureEnabled:
      typeof config['nurture_enabled'] === 'boolean' ? config['nurture_enabled'] : false,
    nurtureDailyCap: positiveInt(config['nurture_daily_cap'], 5, 20),
    nurtureDelayHours: positiveInt(config['nurture_delay_hours'], 24, 168),
    prospectingEnabled:
      typeof config['prospecting_enabled'] === 'boolean' ? config['prospecting_enabled'] : false,
    prospectingDailyCap: positiveInt(config['prospecting_daily_cap'], 5, 10),
    prospectingMarkets: parseProspectingMarkets(config['prospecting_markets']),
  };
}

async function safeCount(
  supabase: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<number> {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

type RevenueIdentityScan = {
  readonly id: string;
  readonly domain: string | null;
  readonly url: string | null;
  readonly user_id: string | null;
};

async function loadRevenueIdentityLookups(
  supabase: SupabaseClient,
  scanIds: readonly string[],
  directUserIds: readonly string[]
): Promise<{
  readonly scanById: ReadonlyMap<string, RevenueIdentityScan>;
  readonly emailByUserId: ReadonlyMap<string, string>;
}> {
  const uniqueScanIds = [...new Set(scanIds.filter(Boolean))];
  let scans: RevenueIdentityScan[] = [];
  if (uniqueScanIds.length > 0) {
    const result = await supabase
      .from('scans')
      .select('id,domain,url,user_id')
      .in('id', uniqueScanIds)
      .limit(5_000);
    if (!result.error) scans = (result.data ?? []) as RevenueIdentityScan[];
  }
  const userIds = [...new Set([
    ...directUserIds.filter(Boolean),
    ...scans.map((row) => row.user_id).filter((value): value is string => Boolean(value)),
  ])];
  let users: Array<{ id: string; email: string }> = [];
  if (userIds.length > 0) {
    const result = await supabase.from('users').select('id,email').in('id', userIds).limit(5_000);
    if (!result.error) users = (result.data ?? []) as Array<{ id: string; email: string }>;
  }
  return {
    scanById: new Map(scans.map((row) => [row.id, row])),
    emailByUserId: new Map(users.map((row) => [row.id, row.email])),
  };
}

async function safeExternalCheckoutStartCount(
  supabase: SupabaseClient,
  since: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .schema('analytics')
      .from('marketing_events')
      .select('id,scan_id,user_id,metadata_json')
      .eq('event_name', 'checkout_started')
      .gte('event_ts', since)
      .limit(5_000);
    if (error || !data?.length) return 0;
    const rows = data as Array<{
      id: string;
      scan_id: string | null;
      user_id: string | null;
      metadata_json: RevenueIdentityMetadata;
    }>;
    const lookups = await loadRevenueIdentityLookups(
      supabase,
      rows.map((row) => row.scan_id).filter((value): value is string => Boolean(value)),
      rows.map((row) => row.user_id).filter((value): value is string => Boolean(value))
    );
    return rows.filter((row) => {
      const scan = row.scan_id ? lookups.scanById.get(row.scan_id) : undefined;
      const userId = row.user_id ?? scan?.user_id ?? null;
      return isExternalPaidCheckout({
        email: userId ? lookups.emailByUserId.get(userId) ?? null : null,
        domain: scan?.domain ?? scan?.url ?? null,
        metadata: row.metadata_json,
      });
    }).length;
  } catch {
    return 0;
  }
}

async function safeExternalPaymentCount(
  supabase: SupabaseClient,
  since: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id,user_id,scan_id,stripe_session_id,amount_cents')
      .eq('status', 'complete')
      .gt('amount_cents', 0)
      .gte('created_at', since)
      .limit(5_000);
    if (error || !data?.length) return 0;
    const rows = data as Array<{
      id: string;
      user_id: string | null;
      scan_id: string | null;
      stripe_session_id: string | null;
      amount_cents: number;
    }>;
    const lookups = await loadRevenueIdentityLookups(
      supabase,
      rows.map((row) => row.scan_id).filter((value): value is string => Boolean(value)),
      rows.map((row) => row.user_id).filter((value): value is string => Boolean(value))
    );
    return rows.filter((row) => {
      if (!/^cs_[A-Za-z0-9_]+$/.test(row.stripe_session_id?.trim() ?? '')) return false;
      const scan = row.scan_id ? lookups.scanById.get(row.scan_id) : undefined;
      const userId = row.user_id ?? scan?.user_id ?? null;
      return !isExcludedRevenueIdentity({
        email: userId ? lookups.emailByUserId.get(userId) ?? null : null,
        domain: scan?.domain ?? scan?.url ?? null,
      });
    }).length;
  } catch {
    return 0;
  }
}

type ExternalSubscriptionMetrics = {
  readonly paidWorkspaceSubscriptions: number;
  readonly paidMonitoringSubscriptions: number;
  readonly cancellations: number;
  readonly activeMonitoring: number;
  readonly pastDueMonitoring: number;
};

async function loadExternalSubscriptionMetrics(
  supabase: SupabaseClient,
  since: string
): Promise<ExternalSubscriptionMetrics> {
  const empty: ExternalSubscriptionMetrics = {
    paidWorkspaceSubscriptions: 0,
    paidMonitoringSubscriptions: 0,
    cancellations: 0,
    activeMonitoring: 0,
    pastDueMonitoring: 0,
  };
  try {
    const [workspaceResult, monitoringResult] = await Promise.all([
      supabase
        .from('user_subscriptions')
        .select('user_id,status,stripe_subscription_id,metadata,created_at,cancelled_at')
        .limit(5_000),
      supabase
        .from('monitoring_subscriptions')
        .select('email,domain,status,stripe_subscription_id,created_at,canceled_at')
        .limit(5_000),
    ]);
    if (workspaceResult.error || monitoringResult.error) return empty;
    const workspaceRows = (workspaceResult.data ?? []) as Array<{
      user_id: string;
      status: string;
      stripe_subscription_id: string | null;
      metadata: RevenueIdentityMetadata;
      created_at: string;
      cancelled_at: string | null;
    }>;
    const monitoringRows = (monitoringResult.data ?? []) as Array<{
      email: string;
      domain: string | null;
      status: string;
      stripe_subscription_id: string | null;
      created_at: string;
      canceled_at: string | null;
    }>;
    const lookups = await loadRevenueIdentityLookups(
      supabase,
      [],
      workspaceRows.map((row) => row.user_id)
    );
    const externalWorkspace = workspaceRows.filter((row) =>
      isVerifiedStripeSubscriptionId(row.stripe_subscription_id)
      && !isExcludedRevenueIdentity({
        email: lookups.emailByUserId.get(row.user_id) ?? null,
        metadata: row.metadata,
      })
    );
    const externalMonitoring = monitoringRows.filter((row) =>
      isVerifiedStripeSubscriptionId(row.stripe_subscription_id)
      && !isExcludedRevenueIdentity({ email: row.email, domain: row.domain })
    );
    return {
      paidWorkspaceSubscriptions: externalWorkspace.filter((row) =>
        ['active', 'trialing'].includes(row.status) && row.created_at >= since
      ).length,
      paidMonitoringSubscriptions: externalMonitoring.filter((row) =>
        ['active', 'trialing'].includes(row.status) && row.created_at >= since
      ).length,
      cancellations:
        externalWorkspace.filter((row) => row.status === 'cancelled' && (row.cancelled_at ?? '') >= since).length
        + externalMonitoring.filter((row) => row.status === 'canceled' && (row.canceled_at ?? '') >= since).length,
      activeMonitoring: externalMonitoring.filter((row) => row.status === 'active').length,
      pastDueMonitoring: externalMonitoring.filter((row) => row.status === 'past_due').length,
    };
  } catch {
    return empty;
  }
}

async function safeQualifiedReportCount(
  supabase: SupabaseClient,
  since: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('scans')
      .select('id')
      .eq('status', 'complete')
      .in('run_source', ['public_self_serve', 'agency_dashboard', 'startup_dashboard', 'monitor'])
      .gte('created_at', since)
      .limit(5_000);
    if (error || !data?.length) return 0;
    return safeCount(supabase, 'reports', (query) =>
      query.in('scan_id', data.map((row) => row.id)).not('email_delivered_at', 'is', null)
    );
  } catch {
    return 0;
  }
}

type WorkspaceActivationOwner = {
  readonly id: string;
  readonly kind: 'startup' | 'agency';
  readonly canonical_domain: string | null;
  readonly fallback_domain: string | null;
  readonly status: string;
  readonly metadata: RevenueIdentityMetadata;
};

type WorkspaceActivationScan = {
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
  readonly domain: string | null;
  readonly url: string | null;
  readonly run_source: string | null;
};

export function countQualifiedWorkspaceActivations(args: {
  readonly owners: readonly WorkspaceActivationOwner[];
  readonly scans: readonly WorkspaceActivationScan[];
}): number {
  const owners = new Map(
    args.owners.map((owner) => [`${owner.kind}:${owner.id}`, owner] as const),
  );
  const activatedDomains = new Set<string>();
  for (const scan of args.scans) {
    const kind = scan.startup_workspace_id ? 'startup' : scan.agency_account_id ? 'agency' : null;
    const ownerId = scan.startup_workspace_id ?? scan.agency_account_id;
    if (!kind || !ownerId) continue;
    const owner = owners.get(`${kind}:${ownerId}`);
    if (!owner || !['active', 'pilot'].includes(owner.status)) continue;
    if (
      (kind === 'startup' && !['startup_dashboard', 'monitor'].includes(scan.run_source ?? ''))
      || (kind === 'agency' && !['agency_dashboard', 'monitor'].includes(scan.run_source ?? ''))
    ) continue;

    const ownerDomain = normalizedRevenueDomain(owner.canonical_domain ?? owner.fallback_domain);
    if (!ownerDomain || isExcludedRevenueIdentity({ domain: ownerDomain, metadata: owner.metadata })) continue;
    if (
      kind === 'startup'
      && normalizedRevenueDomain(scan.domain ?? scan.url) !== ownerDomain
    ) continue;
    activatedDomains.add(ownerDomain);
  }
  return activatedDomains.size;
}

async function loadQualifiedWorkspaceActivationCount(
  supabase: SupabaseClient,
  since: string,
): Promise<number> {
  try {
    const scansResult = await supabase
      .from('scans')
      .select('startup_workspace_id,agency_account_id,domain,url,run_source')
      .eq('status', 'complete')
      .in('run_source', ['startup_dashboard', 'agency_dashboard', 'monitor'])
      .gte('created_at', since)
      .limit(5_000);
    if (scansResult.error || !scansResult.data?.length) return 0;
    const scans = scansResult.data as WorkspaceActivationScan[];
    const startupIds = [...new Set(scans.map((row) => row.startup_workspace_id).filter((id): id is string => Boolean(id)))];
    const agencyIds = [...new Set(scans.map((row) => row.agency_account_id).filter((id): id is string => Boolean(id)))];
    const [startupResult, agencyResult] = await Promise.all([
      startupIds.length > 0
        ? supabase.from('startup_workspaces').select('id,canonical_domain,primary_domain,status,metadata').in('id', startupIds)
        : Promise.resolve({ data: [], error: null }),
      agencyIds.length > 0
        ? supabase.from('agency_accounts').select('id,canonical_domain,website_domain,status,metadata').in('id', agencyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (startupResult.error || agencyResult.error) return 0;
    const owners: WorkspaceActivationOwner[] = [
      ...((startupResult.data ?? []) as Array<{
        id: string; canonical_domain: string | null; primary_domain: string | null; status: string; metadata: RevenueIdentityMetadata;
      }>).map((row) => ({
        id: row.id,
        kind: 'startup' as const,
        canonical_domain: row.canonical_domain,
        fallback_domain: row.primary_domain,
        status: row.status,
        metadata: row.metadata,
      })),
      ...((agencyResult.data ?? []) as Array<{
        id: string; canonical_domain: string | null; website_domain: string | null; status: string; metadata: RevenueIdentityMetadata;
      }>).map((row) => ({
        id: row.id,
        kind: 'agency' as const,
        canonical_domain: row.canonical_domain,
        fallback_domain: row.website_domain,
        status: row.status,
        metadata: row.metadata,
      })),
    ];
    return countQualifiedWorkspaceActivations({ owners, scans });
  } catch {
    return 0;
  }
}

export function chooseRevenueAgencyFocus(values: {
  leads: number;
  activeProspects: number;
  completedScans: number;
  proofAssets: number;
  paidSubscriptionsStarted: number;
  activeMonitoring: number;
  repliesReceived?: number;
  meetingsBooked?: number;
  checkoutStarts?: number;
}): { focus: RevenueStage['key']; reason: string } {
  // Saved inventory, published posts and customer-path scans can include partner
  // tests. They do not establish that acquisition or buying intent is working.
  if (values.leads === 0 && (values.repliesReceived ?? 0) === 0
    && (values.meetingsBooked ?? 0) === 0 && (values.checkoutStarts ?? 0) === 0
    && values.paidSubscriptionsStarted === 0 && values.activeMonitoring === 0) {
    return { focus: 'acquire', reason: 'Qualified acquisition is not established: no recorded leads, replies, meetings or checkout starts. Saved prospects and product/pilot activity are not buying intent.' };
  }
  if (values.leads + values.activeProspects === 0) {
    return { focus: 'acquire', reason: 'The loop needs qualified prospects before any downstream stage can compound.' };
  }
  if (values.completedScans === 0) {
    return { focus: 'diagnose', reason: 'Prospects exist, but there is no recent audit evidence to turn into value.' };
  }
  if (values.proofAssets === 0) {
    return { focus: 'prove', reason: 'Audit evidence exists, but none has been packaged into safe distribution assets yet.' };
  }
  if (values.paidSubscriptionsStarted === 0) {
    return { focus: 'convert', reason: 'Recorded commercial signals need follow-through; no recent recurring subscription has started. Activity alone does not establish acquisition quality.' };
  }
  if (values.activeMonitoring === 0) {
    return { focus: 'retain', reason: 'Conversions exist, but recurring monitoring has not become the retention layer yet.' };
  }
  return { focus: 'acquire', reason: 'The full loop is active; the next constraint is adding more qualified demand.' };
}

export async function loadRevenueAgencySnapshot(
  supabase: SupabaseClient,
  now = new Date(),
  windowDays = 30
): Promise<RevenueAgencySnapshot> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [
    leads,
    activatedLeads,
    markedConvertedLeads,
    activeProspects,
    outreachSends,
    outreachOpens,
    completedScans,
    deliveredReports,
    checkoutStarts,
    repliesReceived,
    meetingsBooked,
    startupWorkspaceRecordsCreated,
    agencyAccountRecordsCreated,
    qualifiedWorkspaceActivations,
    paymentsCompleted,
    subscriptionMetrics,
    proofAssets,
    publishedProof,
    activeAgencyAccounts,
  ] = await Promise.all([
    safeCount(supabase, 'leads', (q) => q.gte('created_at', since)),
    safeCount(supabase, 'leads', (q) => q.not('scan_id', 'is', null).gte('created_at', since)),
    safeCount(supabase, 'leads', (q) => q.eq('converted', true).gte('converted_at', since)),
    safeCount(supabase, 'outreach_prospects', (q) => q.eq('enabled', true)),
    safeCount(supabase, 'outreach_sends', (q) => q.gte('sent_at', since)),
    safeCount(supabase, 'outreach_sends', (q) => q.not('opened_at', 'is', null).gte('sent_at', since)),
    safeCount(supabase, 'scans', (q) =>
      q.eq('status', 'complete')
        .in('run_source', ['public_self_serve', 'agency_dashboard', 'startup_dashboard', 'monitor'])
        .gte('created_at', since)
    ),
    safeQualifiedReportCount(supabase, since),
    safeExternalCheckoutStartCount(supabase, since),
    safeCount(supabase, 'commercial_handoff_events', (q) =>
      q.eq('event_type', 'reply_received').gte('occurred_at', since)
    ),
    safeCount(supabase, 'commercial_handoff_events', (q) =>
      q.eq('event_type', 'meeting_booked').gte('occurred_at', since)
    ),
    safeCount(supabase, 'startup_workspaces', (q) => q.gte('created_at', since)),
    safeCount(supabase, 'agency_accounts', (q) => q.gte('created_at', since)),
    loadQualifiedWorkspaceActivationCount(supabase, since),
    safeExternalPaymentCount(supabase, since),
    loadExternalSubscriptionMetrics(supabase, since),
    safeCount(supabase, 'distribution_assets', (q) =>
      q.eq('metadata->>created_by_agent', 'social_proof_agent').gte('created_at', since)
    ),
    safeCount(supabase, 'distribution_jobs', (q) => q.eq('status', 'published').gte('completed_at', since)),
    safeCount(supabase, 'agency_accounts', (q) => q.eq('status', 'active')),
  ]);
  // Stripe-backed payment/subscription records, not a mutable CRM flag, are
  // the authority for paid conversion.
  const paidSubscriptionsStarted =
    subscriptionMetrics.paidWorkspaceSubscriptions
    + subscriptionMetrics.paidMonitoringSubscriptions;
  const convertedLeads = paymentsCompleted + paidSubscriptionsStarted;
  const workspaceRecordsCreated = startupWorkspaceRecordsCreated + agencyAccountRecordsCreated;
  const cancellations = subscriptionMetrics.cancellations;
  const activeMonitoring = subscriptionMetrics.activeMonitoring;
  const pastDueMonitoring = subscriptionMetrics.pastDueMonitoring;

  const focus = chooseRevenueAgencyFocus({
    leads,
    activeProspects,
    completedScans,
    // Published distribution is already proof in market even when the asset was
    // created manually instead of by the social-proof agent.
    proofAssets: proofAssets + publishedProof,
    paidSubscriptionsStarted,
    activeMonitoring,
    repliesReceived,
    meetingsBooked,
    checkoutStarts,
  });

  const stages: RevenueStage[] = [
    {
      key: 'acquire',
      label: 'Acquire',
      value: leads + activeProspects,
      status: leads > 0 || repliesReceived > 0 || meetingsBooked > 0 || checkoutStarts > 0 ? 'healthy' : 'attention',
      detail: `${leads} new leads · ${activeProspects} enabled outreach records (inventory, not buying intent)`,
    },
    {
      key: 'diagnose',
      label: 'Diagnose',
      value: completedScans,
      status: completedScans > 0 ? 'healthy' : 'waiting',
      detail: `${completedScans} completed scans · ${deliveredReports} reports delivered · ${workspaceRecordsCreated} workspace records created · ${qualifiedWorkspaceActivations} product first-value activations. Product/pilot activity only; not evidence of buying intent.`,
    },
    {
      key: 'prove',
      label: 'Prove',
      value: proofAssets,
      status: proofAssets > 0 ? 'healthy' : completedScans > 0 ? 'attention' : 'waiting',
      detail: `${proofAssets} proof assets · ${publishedProof} distribution jobs published`,
    },
    {
      key: 'convert',
      label: 'Convert',
      value: paidSubscriptionsStarted,
      status: paidSubscriptionsStarted > 0 ? 'healthy' : leads + activeProspects > 0 ? 'attention' : 'waiting',
      detail: `${paidSubscriptionsStarted} recurring subscriptions started · ${paymentsCompleted} one-time payments · ${checkoutStarts} checkout starts · ${outreachOpens}/${outreachSends} tracked email opens`,
    },
    {
      key: 'retain',
      label: 'Retain',
      value: activeMonitoring,
      status: activeMonitoring > 0 && pastDueMonitoring === 0 ? 'healthy' : activeMonitoring > 0 ? 'attention' : 'waiting',
      detail: `${activeMonitoring} active monitoring · ${pastDueMonitoring} past due · ${activeAgencyAccounts} agency accounts`,
    },
  ];

  return {
    windowDays,
    leads,
    activatedLeads,
    markedConvertedLeads,
    convertedLeads,
    activeProspects,
    outreachSends,
    outreachOpens,
    completedScans,
    deliveredReports,
    checkoutStarts,
    repliesReceived,
    meetingsBooked,
    workspaceRecordsCreated,
    qualifiedWorkspaceActivations,
    paymentsCompleted,
    paidSubscriptionsStarted,
    cancellations,
    proofAssets,
    publishedProof,
    activeMonitoring,
    pastDueMonitoring,
    activeAgencyAccounts,
    stages,
    focus: focus.focus,
    focusReason: focus.reason,
  };
}

async function alreadyRanToday(supabase: SupabaseClient, now: Date): Promise<boolean> {
  try {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { count, error } = await supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'revenue_agency_run')
      .eq('data->>status', 'completed')
      .gte('created_at', start.toISOString());
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function runRevenueAgency(args: {
  readonly supabase: SupabaseClient;
  readonly appUrl: string;
  readonly env?: LeadEmailEnv & AgencyProspectingEnv & SocialProductionEnv;
  readonly force?: boolean;
  readonly now?: Date;
}): Promise<RevenueAgencyRunResult> {
  const now = args.now ?? new Date();
  const setting = await loadAutomationSetting(args.supabase, 'revenue_agency');
  const config = resolveRevenueAgencyConfig(setting.config, setting.enabled, setting.killSwitch);
  const mode = args.force && config.mode === 'off' && !setting.killSwitch ? 'observe' : config.mode;
  if (mode === 'off') {
    return { status: 'skipped', mode, reason: setting.killSwitch ? 'kill_switch' : 'disabled' };
  }
  if (!args.force && (await alreadyRanToday(args.supabase, now))) {
    return { status: 'skipped', mode, reason: 'already_ran_today' };
  }

  try {
    const snapshot = await loadRevenueAgencySnapshot(args.supabase, now);
    const judge = judgeGrowthLoop(snapshot);
    const marketIndex = Math.floor(now.getTime() / 86_400_000) % Math.max(config.prospectingMarkets.length, 1);
    const market = config.prospectingMarkets[marketIndex] ?? 'Toronto, Canada';
    const prospecting =
      config.prospectingEnabled && mode === 'autonomous' && judge.allowProspecting
        ? await runAgencyProspectingAgent({
            supabase: args.supabase,
            env: args.env ?? (process.env as AgencyProspectingEnv),
            market,
            dailyCap: config.prospectingDailyCap,
          })
        : undefined;
    const proof =
      config.socialProofEnabled &&
      judge.allowSocialProof &&
      (mode === 'assist' || mode === 'autonomous')
        ? await runSocialProofAgent({
          supabase: args.supabase,
          appUrl: args.appUrl,
          env: args.env,
           now,
           campaignOnly: true,
           campaignScopeRequired: true,
         })
        : undefined;
    const nurture =
      config.nurtureEnabled && mode === 'autonomous' && judge.allowNurture
        ? await runRevenueNurtureAgent({
            supabase: args.supabase,
            appUrl: args.appUrl,
            env: args.env ?? (process.env as LeadEmailEnv),
            now,
            dailyCap: config.nurtureDailyCap,
            delayHours: config.nurtureDelayHours,
          })
        : undefined;

    await structuredLogWithClientAndWait(
      args.supabase,
      'revenue_agency_run',
      {
        status: 'completed',
        mode,
        focus: snapshot.focus,
        leads: snapshot.leads,
        scans: snapshot.completedScans,
        proof_assets: snapshot.proofAssets,
        converted_leads: snapshot.convertedLeads,
        active_monitoring: snapshot.activeMonitoring,
        social_proof_status: proof?.status ?? null,
        nurture_status: nurture?.status ?? null,
        nurture_sent: nurture?.sent ?? 0,
        prospecting_status: prospecting?.status ?? null,
        prospecting_discovered: prospecting?.discovered ?? 0,
        prospecting_qualified: prospecting?.qualified ?? 0,
        prospecting_saved: prospecting?.saved ?? 0,
        prospecting_reason: prospecting?.reason ?? null,
        growth_judge_bottleneck: judge.bottleneck,
        growth_judge_recommendation: judge.recommendation,
        growth_judge_allow_prospecting: judge.allowProspecting,
        growth_judge_allow_social_proof: judge.allowSocialProof,
        growth_judge_allow_nurture: judge.allowNurture,
      },
      'info'
    );
    return { status: 'completed', mode, snapshot, proof, nurture, prospecting, judge };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    await structuredLogWithClientAndWait(
      args.supabase,
      'revenue_agency_run',
      { status: 'failed', mode, reason },
      'error'
    );
    return { status: 'failed', mode, reason };
  }
}
