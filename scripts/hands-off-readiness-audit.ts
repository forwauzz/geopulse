import { createServiceRoleClient } from '../lib/supabase/service-role';
import { loadAgentStatuses } from '../lib/server/agent-console';
import { loadCampaignControlRoom } from '../lib/server/campaign-control-room';
import { loadProviderSpendSummary } from '../lib/server/provider-spend-control';
import { classifyRuntimeIncidents } from '../lib/server/runtime-incident-control';

type Row = Record<string, any>;

const OPEN_STATES = ['discovered', 'assigned', 'executing', 'verifying', 'blocked'];
const FAILURE_EVENT_RE = /(fail|error|timeout|stale|blocked|exhausted|dead.?letter|rollback|unhealthy)/i;
const NON_INCIDENT_EVENT_RE = /(validation|expected|rejected|blocked_by_policy|rate_limit_guard|gpm_client_run_blocked)/i;

function hoursAgo(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? (now.getTime() - parsed) / 3_600_000 : null;
}

function groupCount(rows: readonly Row[], field: string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[field] ?? '<missing>');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function groupCompound(rows: readonly Row[], fields: readonly string[]): Array<{ key: string; count: number }> {
  return groupCount(
    rows.map((row) => ({ compound: fields.map((field) => String(row[field] ?? '<missing>')).join(' / ') })),
    'compound',
  );
}

function incidentSnapshot(log: Row): Record<string, unknown> {
  const data = log.data && typeof log.data === 'object' ? log.data as Row : {};
  const allowed = [
    'status',
    'reason',
    'message',
    'stage',
    'failed_stage',
    'error_code',
    'errors',
    'failed',
    'blocked',
    'attempt',
    'retryable',
  ];
  return {
    event: log.event,
    level: log.level,
    createdAt: log.created_at,
    data: Object.fromEntries(
      allowed
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key]]),
    ),
  };
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const db = createServiceRoleClient(url, key);

  const [
    agents,
    loopsResult,
    attemptsResult,
    logsResult,
    latestMayaResult,
    distributionResult,
    contentResult,
    outreachResult,
    intelligenceAlertsResult,
    spend,
  ] = await Promise.all([
    loadAgentStatuses(db, process.env as Record<string, string | undefined>),
    db
      .from('agent_work_loops')
      .select('id,source_type,source_key,parent_loop_id,lane,owner,state,severity,title,next_action,due_at,attempt_count,max_attempts,founder_required,blocker,evidence,metadata,verified_at,resolved_at,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(2_000),
    db
      .from('agent_work_loop_attempts')
      .select('loop_id,attempt_number,state,owner,outcome,attempted_at')
      .gte('attempted_at', since7d)
      .order('attempted_at', { ascending: false })
      .limit(2_000),
    db
      .from('app_logs')
      .select('event,level,created_at,data')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false })
      .limit(5_000),
    db
      .from('app_logs')
      .select('event,level,created_at,data')
      .in('event', [
        'chief_of_staff_campaign_check',
        'chief_of_staff_campaign_escalation',
        'chief_of_staff_founder_attention_sent',
        'chief_of_staff_resolved_digest_sent',
        'chief_of_staff_daily_standup_sent',
        'chief_of_staff_campaign_digest_failed',
      ])
      .order('created_at', { ascending: false })
      .limit(25),
    db
      .from('distribution_jobs')
      .select('id,status,scheduled_for,completed_at,last_error,created_at,updated_at')
      .in('status', ['queued', 'processing', 'failed'])
      .order('updated_at', { ascending: false })
      .limit(500),
    db
      .from('content_items')
      .select('id,content_type,status,approved_at,published_at,updated_at')
      .in('status', ['idea', 'brief', 'draft', 'review', 'approved'])
      .order('updated_at', { ascending: false })
      .limit(1_000),
    db
      .from('outreach_prospects')
      .select('id,enabled,next_run_at,last_run_at,last_error,updated_at')
      .eq('enabled', true)
      .order('next_run_at', { ascending: true })
      .limit(500),
    db
      .from('intelligence_quality_alerts')
      .select('id,severity,reason_code,source_kind,observed_at,created_at,resolved_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(1_000),
    loadProviderSpendSummary(db),
  ]);

  const room = await loadCampaignControlRoom({ supabase: db, agents, now });
  const loops = (loopsResult.data ?? []) as Row[];
  const openLoops = loops.filter((loop) => OPEN_STATES.includes(String(loop.state)));
  const completedLoops = loops.filter((loop) => loop.state === 'completed');
  const overdueLoops = openLoops.filter((loop) => {
    const due = Date.parse(String(loop.due_at ?? ''));
    return Number.isFinite(due) && due < now.getTime();
  });
  const exhaustedLoops = openLoops.filter(
    (loop) => Number(loop.attempt_count ?? 0) >= Number(loop.max_attempts ?? 3),
  );
  const malformedLoops = openLoops.filter(
    (loop) => !String(loop.owner ?? '').trim()
      || !String(loop.next_action ?? '').trim()
      || !loop.due_at,
  );
  const founderLoops = openLoops.filter((loop) => loop.founder_required === true);

  const logs = (logsResult.data ?? []) as Row[];
  const errorLogs = logs.filter((log) => log.level === 'error');
  const incidentLikeLogs = logs.filter(
    (log) => (
      log.level === 'error'
      || FAILURE_EVENT_RE.test(String(log.event ?? ''))
    ) && !NON_INCIDENT_EVENT_RE.test(String(log.event ?? '')),
  );
  const incidentEvents = groupCount(incidentLikeLogs, 'event');
  const runtimeSignals = classifyRuntimeIncidents(logs);
  const activeRuntimeSignals = runtimeSignals.filter((signal) => signal.active);
  const uncoveredIncidentEvents = activeRuntimeSignals.filter(
    (signal) => !openLoops.some((loop) =>
      loop.source_type === 'runtime_incident'
      && loop.source_key === signal.definition.key,
    ),
  );

  const mayaEvents = (latestMayaResult.data ?? []) as Row[];
  const latestMaya = mayaEvents.find((row) => [
    'chief_of_staff_campaign_check',
    'chief_of_staff_campaign_escalation',
  ].includes(String(row['event'] ?? ''))) ?? null;
  const mayaAgeHours = hoursAgo(latestMaya?.created_at, now);
  const activeDistribution = (distributionResult.data ?? []) as Row[];
  const stuckDistribution = activeDistribution.filter((job) => {
    const age = hoursAgo(job.scheduled_for ?? job.updated_at ?? job.created_at, now);
    return job.status === 'failed'
      || (job.status === 'processing' && (age ?? 0) > 2)
      || (job.status === 'queued' && Date.parse(String(job.scheduled_for ?? '')) < now.getTime() - 2 * 3_600_000);
  });
  const pendingContent = (contentResult.data ?? []) as Row[];
  const staleApprovedContent = pendingContent.filter((item) => {
    const age = hoursAgo(item.approved_at ?? item.updated_at, now);
    return item.status === 'approved' && (age ?? 0) > 24;
  });
  const pendingOutreach = (outreachResult.data ?? []) as Row[];
  const stuckOutreach = pendingOutreach.filter((prospect) => {
    const due = Date.parse(String(prospect.next_run_at ?? ''));
    return Boolean(prospect.last_error)
      || (Number.isFinite(due) && due < now.getTime() - 24 * 3_600_000);
  });
  const intelligenceAlerts = (intelligenceAlertsResult.data ?? []) as Row[];
  const qualityAlertLoopKeys = new Set(
    openLoops
      .filter((loop) => loop.source_type === 'intelligence_quality_alert')
      .map((loop) => String(loop.source_key)),
  );
  const uncoveredQualityAlerts = intelligenceAlerts.filter(
    (alert) => !qualityAlertLoopKeys.has(String(alert.id)),
  );
  const productionHealth = String(latestMaya?.data?.health ?? 'unknown');

  const report = {
    generatedAt: now.toISOString(),
    verdict: {
      handsOffReady:
        productionHealth !== 'blocked'
        && productionHealth !== 'unknown'
        && Boolean(latestMaya)
        && (mayaAgeHours ?? Infinity) <= 2
        && malformedLoops.length === 0
        && founderLoops.length === 0
        && uncoveredIncidentEvents.length === 0
        && uncoveredQualityAlerts.length === 0
        && stuckDistribution.length === 0
        && stuckOutreach.length === 0,
      campaignHealth: productionHealth,
      localDiagnosticCampaignHealth: room.health,
      cronHealthy: room.cron.healthy,
      mayaHeartbeatAgeHours: mayaAgeHours,
    },
    maya: {
      latestEvent: latestMaya?.event ?? null,
      latestAt: latestMaya?.created_at ?? null,
      latestData: latestMaya?.data ?? null,
      recentEvents: groupCount(mayaEvents, 'event'),
    },
    loops: {
      totalLoaded: loops.length,
      open: openLoops.length,
      completed: completedLoops.length,
      byState: groupCount(loops, 'state'),
      bySourceOpen: groupCount(openLoops, 'source_type'),
      byStateSourceLaneOpen: groupCompound(openLoops, ['state', 'source_type', 'lane']),
      byOwnerOpen: groupCount(openLoops, 'owner'),
      byLaneOpen: groupCount(openLoops, 'lane'),
      overdue: overdueLoops.length,
      exhausted: exhaustedLoops.length,
      malformed: malformedLoops.length,
      founderRequired: founderLoops.length,
      attemptsPast7d: (attemptsResult.data ?? []).length,
      overdueSample: overdueLoops.slice(0, 20).map((loop) => ({
        id: loop.id,
        owner: loop.owner,
        lane: loop.lane,
        state: loop.state,
        title: loop.title,
        dueAt: loop.due_at,
        attempts: loop.attempt_count,
        maxAttempts: loop.max_attempts,
      })),
      exhaustedSample: exhaustedLoops.slice(0, 20).map((loop) => ({
        id: loop.id,
        owner: loop.owner,
        title: loop.title,
        blocker: loop.blocker,
      })),
      blockedSample: openLoops
        .filter((loop) => loop.state === 'blocked')
        .slice(0, 30)
        .map((loop) => ({
          id: loop.id,
          sourceType: loop.source_type,
          sourceKey: loop.source_key,
          owner: loop.owner,
          title: loop.title,
          blocker: loop.blocker,
          detail: loop.detail,
        })),
      ingestionFailureSample: openLoops
        .filter((loop) => loop.source_type === 'intelligence_ingestion')
        .slice(0, 20)
        .map((loop) => ({
          sourceKey: loop.source_key,
          blocker: loop.blocker,
          detail: loop.detail,
          evidence: loop.evidence,
        })),
      founderRequiredSample: founderLoops.slice(0, 20).map((loop) => ({
        id: loop.id,
        owner: loop.owner,
        title: loop.title,
        nextAction: loop.next_action,
        blocker: loop.blocker,
      })),
    },
    incidents: {
      errorsPast7d: errorLogs.length,
      incidentLikePast7d: incidentLikeLogs.length,
      events: incidentEvents.slice(0, 50),
      active: activeRuntimeSignals.map((signal) => ({
        key: signal.definition.key,
        owner: signal.definition.owner,
        latestFailureAt: signal.latestFailureAt,
        consecutiveFailures: signal.consecutiveFailures,
        reason: signal.reason,
      })),
      uncoveredEvents: uncoveredIncidentEvents.map((signal) => signal.definition.key),
      latestSignals: incidentEvents.slice(0, 50).map(({ key: event }) => ({
        event,
        signals: incidentLikeLogs
          .filter((log) => log.event === event)
          .slice(0, 3)
          .map(incidentSnapshot),
      })),
      productionRuntimeSignals: logs
        .filter((log) => [
          'social_proof_agent_run',
          'autonomous_campaign_execution',
          'gpm_sweep_completed',
          'gpm_sweep_completed_with_errors',
          'intelligence_learning_loop',
        ].includes(String(log.event)))
        .slice(0, 20)
        .map(incidentSnapshot),
    },
    execution: {
      campaignsTracked: room.campaigns.length,
      campaignActions: room.actions.length,
      stuckDistribution: stuckDistribution.length,
      staleApprovedOrScheduledContent: staleApprovedContent.length,
      stuckOutreach: stuckOutreach.length,
    },
    intelligence: {
      openQualityAlerts: intelligenceAlerts.length,
      uncoveredQualityAlerts: uncoveredQualityAlerts.length,
      bySeverity: groupCount(intelligenceAlerts, 'severity'),
      byReason: groupCount(intelligenceAlerts, 'reason_code'),
    },
    spend,
    agentBlockers: agents
      .filter((agent) => !agent.enabled || agent.killSwitch || agent.blockers.length > 0)
      .map((agent) => ({
        key: agent.key,
        name: agent.name,
        enabled: agent.enabled,
        killSwitch: agent.killSwitch,
        blockers: agent.blockers,
      })),
    queryErrors: [
      loopsResult.error,
      attemptsResult.error,
      logsResult.error,
      latestMayaResult.error,
      distributionResult.error,
      contentResult.error,
      outreachResult.error,
      intelligenceAlertsResult.error,
    ].filter(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.queryErrors.length > 0) process.exitCode = 2;
  else if (!report.verdict.handsOffReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
