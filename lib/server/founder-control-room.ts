import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentStatus } from './agent-console';
import type { RevenueAgencySnapshot } from './revenue-agency-agent';

export type WorkforceDecision = 'Keep' | 'Repair' | 'Merge as capability' | 'Retire';

export type WorkforceMember = {
  readonly id: 'maya' | 'noah' | 'priya' | 'elena' | 'jordan' | 'marcus';
  readonly name: string;
  readonly role: string;
  readonly icon: string;
  readonly initials: string;
  readonly color: string;
  readonly job: string;
  readonly capabilityKeys: readonly string[];
};

export const NAMED_WORKFORCE: readonly WorkforceMember[] = [
  {
    id: 'maya',
    name: 'Maya Brooks',
    role: 'AI Chief of Staff',
    icon: 'assistant',
    initials: 'MB',
    color: 'bg-violet-600',
    job: 'Runs the company loop, names the commercial bottleneck, and escalates only decisions that need you.',
    capabilityKeys: ['revenue_agency', 'engagement_digest'],
  },
  {
    id: 'noah',
    name: 'Noah Carter',
    role: 'Activation Manager',
    icon: 'rocket_launch',
    initials: 'NC',
    color: 'bg-sky-600',
    job: 'Owns signup, onboarding, workspace provisioning, first value, and recovery.',
    capabilityKeys: ['recurring_audits'],
  },
  {
    id: 'priya',
    name: 'Priya Shah',
    role: 'Customer Outcomes Strategist',
    icon: 'insights',
    initials: 'PS',
    color: 'bg-emerald-600',
    job: 'Turns audits into fixes, verifies progress, and delivers monitoring, reports, and competitor evidence.',
    capabilityKeys: ['design', 'gpm', 'competitor_discovery', 'competitor_benchmark'],
  },
  {
    id: 'elena',
    name: 'Elena Park',
    role: 'Customer Intelligence Lead',
    icon: 'psychology',
    initials: 'EP',
    color: 'bg-amber-600',
    job: 'Learns from real funnel activity and reports the weakest activation-to-revenue handoff every week.',
    capabilityKeys: ['research'],
  },
  {
    id: 'jordan',
    name: 'Jordan Reyes',
    role: 'Growth Director',
    icon: 'campaign',
    initials: 'JR',
    color: 'bg-rose-600',
    job: 'Owns editorial, safe social proof, outreach, Instagram, and qualified organic demand.',
    capabilityKeys: ['marketing_autopilot', 'social_proof', 'outreach'],
  },
  {
    id: 'marcus',
    name: 'Marcus Reed',
    role: 'Reliability Engineer',
    icon: 'shield',
    initials: 'MR',
    color: 'bg-slate-700',
    job: 'Watches queues, report delivery, social publishing, Stripe, schedules, and self-improvement.',
    capabilityKeys: ['self_improvement', 'benchmark'],
  },
] as const;

export type AgentActivity = {
  readonly event: string;
  readonly level: 'info' | 'warning' | 'error';
  readonly createdAt: string;
};

export type WorkforceView = WorkforceMember & {
  readonly enabled: boolean;
  readonly status: 'Working' | 'Needs attention' | 'Paused';
  readonly blockers: readonly string[];
  readonly lastAction: AgentActivity | null;
  readonly nextAction: string;
  readonly capabilities: readonly AgentStatus[];
};

export type ReliabilityIncident = {
  readonly area: 'Queue' | 'Report' | 'Social' | 'Stripe' | 'Schedule';
  readonly event: string;
  readonly createdAt: string;
};

export type FounderControlRoom = {
  readonly summary: string;
  readonly currentBottleneck: string;
  readonly metrics: readonly { label: string; value: string; detail: string }[];
  readonly learningBrief: {
    readonly headline: string;
    readonly observation: string;
    readonly recommendation: string;
  };
  readonly incidents: readonly ReliabilityIncident[];
  readonly founderDecisions: readonly string[];
  readonly workforce: readonly WorkforceView[];
};

const EVENT_HINTS: Record<WorkforceMember['id'], readonly string[]> = {
  maya: ['revenue_agency', 'engagement_digest'],
  noah: ['onboarding', 'activation', 'provision', 'recovery', 'checkout'],
  priya: ['report', 'gpm', 'monitor', 'competitor', 'outcome', 'audit'],
  elena: ['lead', 'outreach', 'funnel', 'conversion', 'customer_learning'],
  jordan: ['editorial', 'social', 'distribution', 'instagram', 'outreach'],
  marcus: ['failed', 'error', 'queue', 'schedule', 'stripe', 'self_improvement', 'cron'],
};

export function classifyReliabilityIncident(event: string): ReliabilityIncident['area'] | null {
  const value = event.toLowerCase();
  if (value.includes('stripe') || value.includes('checkout') || value.includes('billing')) return 'Stripe';
  if (value.includes('social') || value.includes('distribution') || value.includes('instagram')) return 'Social';
  if (value.includes('report') || value.includes('artifact') || value.includes('email_delivery')) return 'Report';
  if (value.includes('queue') || value.includes('scan') || value.includes('job')) return 'Queue';
  if (value.includes('schedule') || value.includes('cron') || value.includes('self_improvement')) return 'Schedule';
  return null;
}

function nextActionFor(member: WorkforceMember, snapshot: RevenueAgencySnapshot): string {
  if (member.id === 'maya') return `Coordinate the ${snapshot.focus} stage and report only exceptions.`;
  if (member.id === 'noah') return snapshot.completedScans === 0
    ? 'Help the next signup reach a completed first scan.'
    : 'Watch signup-to-first-scan activation and recover stalled accounts.';
  if (member.id === 'priya') return snapshot.deliveredReports < snapshot.completedScans
    ? 'Close the gap between completed scans and delivered reports.'
    : 'Verify customer actions and prepare the next monitoring update.';
  if (member.id === 'elena') return `Explain why ${snapshot.focus} is the weakest handoff in the weekly learning brief.`;
  if (member.id === 'jordan') return snapshot.proofAssets === 0
    ? 'Create a claim-safe proof asset from verified evidence.'
    : 'Distribute qualified proof without exceeding cadence limits.';
  return 'Review new failures and confirm scheduled jobs are healthy.';
}

export function buildFounderControlRoom(args: {
  agents: readonly AgentStatus[];
  snapshot: RevenueAgencySnapshot;
  logs: readonly { event: string; level: 'info' | 'warning' | 'error'; created_at: string }[];
}): FounderControlRoom {
  const { agents, snapshot, logs } = args;
  const incidents = logs
    .filter((row) => row.level === 'error' || row.level === 'warning')
    .map((row) => {
      const area = classifyReliabilityIncident(row.event);
      return area ? { area, event: row.event, createdAt: row.created_at } : null;
    })
    .filter((row): row is ReliabilityIncident => row !== null)
    .slice(0, 8);

  const workforce = NAMED_WORKFORCE.map((member): WorkforceView => {
    const capabilities = member.capabilityKeys
      .map((key) => agents.find((agent) => agent.key === key))
      .filter((agent): agent is AgentStatus => Boolean(agent));
    const blockers = [...new Set(capabilities.flatMap((agent) => agent.blockers))];
    const hints = EVENT_HINTS[member.id];
    const last = logs.find((row) => hints.some((hint) => row.event.toLowerCase().includes(hint)));
    const enabled = capabilities.length === 0 || capabilities.some((agent) => agent.enabled);
    return {
      ...member,
      enabled,
      status: blockers.length > 0 ? 'Needs attention' : enabled ? 'Working' : 'Paused',
      blockers,
      lastAction: last
        ? { event: last.event, level: last.level, createdAt: last.created_at }
        : null,
      nextAction: nextActionFor(member, snapshot),
      capabilities,
    };
  });

  const denominator = snapshot.leads + snapshot.activeProspects;
  const conversion = denominator > 0 ? Math.round((snapshot.convertedLeads / denominator) * 100) : 0;
  const activation = denominator > 0 ? Math.min(100, Math.round((snapshot.completedScans / denominator) * 100)) : 0;
  const delivery = snapshot.completedScans > 0
    ? Math.min(100, Math.round((snapshot.deliveredReports / snapshot.completedScans) * 100))
    : 0;
  const founderDecisions = [
    ...(snapshot.pastDueMonitoring > 0
      ? [`Decide how to recover ${snapshot.pastDueMonitoring} past-due monitoring subscription${snapshot.pastDueMonitoring === 1 ? '' : 's'}.`]
      : []),
    ...(incidents.length > 0 ? [`Review ${incidents.length} recent reliability exception${incidents.length === 1 ? '' : 's'}.`] : []),
  ];

  return {
    summary:
      incidents.length > 0
        ? `The company loop is operating, with ${incidents.length} recent exception${incidents.length === 1 ? '' : 's'} for Marcus to investigate.`
        : `The company loop is operating. Maya is focused on ${snapshot.focus}; nothing currently requires founder intervention.`,
    currentBottleneck: snapshot.focusReason,
    metrics: [
      { label: 'Revenue', value: String(snapshot.convertedLeads), detail: 'paid relationships in 30 days' },
      { label: 'Activation', value: `${activation}%`, detail: 'prospects reaching a completed scan' },
      { label: 'Monitoring', value: String(snapshot.activeMonitoring), detail: 'active recurring accounts' },
      { label: 'Delivery', value: `${delivery}%`, detail: 'completed scans with delivered reports' },
      { label: 'Conversion', value: `${conversion}%`, detail: 'known prospects becoming paid' },
    ],
    learningBrief: {
      headline: `Weakest handoff: ${snapshot.focus}`,
      observation: snapshot.focusReason,
      recommendation:
        snapshot.focus === 'convert'
          ? 'Improve the report-to-paid-monitoring CTA before increasing lead volume.'
          : snapshot.focus === 'retain'
            ? 'Make recurring monitoring the obvious next step after every delivered report.'
            : `Concentrate this week on ${snapshot.focus} before scaling downstream activity.`,
    },
    incidents,
    founderDecisions,
    workforce,
  };
}

export async function loadFounderControlRoom(
  supabase: SupabaseClient,
  agents: readonly AgentStatus[],
  snapshot: RevenueAgencySnapshot
): Promise<FounderControlRoom> {
  let logs: { event: string; level: 'info' | 'warning' | 'error'; created_at: string }[] = [];
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const result = await supabase
      .from('app_logs')
      .select('event,level,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300);
    if (!result.error) logs = (result.data ?? []) as typeof logs;
  } catch {
    // The control room must remain available when observability storage is unavailable.
  }
  return buildFounderControlRoom({ agents, snapshot, logs });
}
