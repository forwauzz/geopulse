type Db = { from(table: string): any };
type Row = Record<string, any>;

export type RuntimeIncidentDefinition = {
  readonly key: string;
  readonly lane: string;
  readonly campaignLane: 'social' | 'email' | 'prospecting' | 'competitors' | 'benchmarks';
  readonly owner: 'Jordan' | 'Priya' | 'Elena' | 'Marcus' | 'Maya';
  readonly title: string;
  readonly failureEvents: readonly string[];
  readonly successEvents: readonly string[];
  readonly nextAction: string;
};

export type RuntimeIncidentSignal = {
  readonly definition: RuntimeIncidentDefinition;
  readonly active: boolean;
  readonly consecutiveFailures: number;
  readonly latestFailureAt: string | null;
  readonly latestSuccessAt: string | null;
  readonly reason: string | null;
};

const DEFINITIONS: readonly RuntimeIncidentDefinition[] = [
  {
    key: 'social-production',
    lane: 'social',
    campaignLane: 'social',
    owner: 'Marcus',
    title: 'Repair the Sofia and Jordan production runtime',
    failureEvents: [
      'social_proof_agent_run',
      'jordan_media_render_failed',
      'autonomous_campaign_execution_error',
    ],
    successEvents: ['social_proof_agent_run', 'autonomous_campaign_execution'],
    nextAction: 'Retry the bounded production run, repair the render or runtime contract if it repeats, and verify a new asset or a clean no-op.',
  },
  {
    key: 'gpm-monitoring',
    lane: 'benchmarks',
    campaignLane: 'benchmarks',
    owner: 'Marcus',
    title: 'Repair recurring client visibility measurement',
    failureEvents: ['gpm_client_run_failed', 'gpm_sweep_completed_with_errors', 'gpm_sweep_config_failed'],
    successEvents: ['gpm_client_run_launched', 'gpm_sweep_completed'],
    nextAction: 'Retry the failed client measurement and verify a replacement run or report before closing.',
  },
  {
    key: 'intelligence-learning',
    lane: 'intelligence',
    campaignLane: 'benchmarks',
    owner: 'Marcus',
    title: 'Repair the intelligence learning loop',
    failureEvents: ['intelligence_learning_loop_error'],
    successEvents: ['intelligence_learning_loop'],
    nextAction: 'Repair the learning-stage failure and verify a clean intelligence learning heartbeat.',
  },
  {
    key: 'chief-of-staff',
    lane: 'operations',
    campaignLane: 'benchmarks',
    owner: 'Marcus',
    title: 'Restore Maya’s hourly control check',
    failureEvents: ['chief_of_staff_campaign_check_error', 'chief_of_staff_campaign_digest_failed'],
    successEvents: ['chief_of_staff_campaign_check', 'chief_of_staff_campaign_escalation'],
    nextAction: 'Restore Maya’s check or digest and verify the next hourly control-room heartbeat.',
  },
  {
    key: 'revenue-delivery',
    lane: 'revenue',
    campaignLane: 'prospecting',
    owner: 'Elena',
    title: 'Repair revenue and outreach delivery',
    failureEvents: [
      'revenue_agency_cron_error',
      'outreach_sweep_error',
      'engagement_digest_error',
      'weekly_report_failed',
      'weekly_report_error',
    ],
    successEvents: ['revenue_agency_cron_run', 'outreach_sweep_tick', 'engagement_digest_tick'],
    nextAction: 'Retry the revenue delivery path and verify a provider send or a clean no-op.',
  },
  {
    key: 'distribution',
    lane: 'social',
    campaignLane: 'social',
    owner: 'Marcus',
    title: 'Repair the publishing dispatcher',
    failureEvents: ['distribution_schedule_worker_error', 'distribution_verification_worker_error'],
    successEvents: ['distribution_job_schedule_completed'],
    nextAction: 'Repair the dispatch stage and verify the next provider publication or clean queue sweep.',
  },
  {
    key: 'seo-runtime',
    lane: 'seo',
    campaignLane: 'competitors',
    owner: 'Marcus',
    title: 'Repair the autonomous SEO runtime',
    failureEvents: ['seo_agent_failed', 'seo_agent_worker_error', 'seo_editorial_cron_error'],
    successEvents: ['seo_agent_completed', 'seo_editorial_cron_run'],
    nextAction: 'Repair the SEO execution path and verify the next discovery or editorial run.',
  },
] as const;

function time(row: Row | undefined): number {
  const parsed = Date.parse(String(row?.created_at ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function data(row: Row | undefined): Row {
  return row?.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? row.data
    : {};
}

function failure(row: Row, definition: RuntimeIncidentDefinition): boolean {
  if (!definition.failureEvents.includes(String(row.event))) return false;
  if (row.level === 'error') return true;
  const payload = data(row);
  return payload.status === 'failed'
    || Number(payload.failed ?? payload.errors ?? 0) > 0
    || String(row.event).includes('with_errors')
    || String(row.event).endsWith('_failed')
    || String(row.event).endsWith('_error');
}

function success(row: Row, definition: RuntimeIncidentDefinition): boolean {
  if (!definition.successEvents.includes(String(row.event))) return false;
  if (row.level === 'error') return false;
  const status = String(data(row).status ?? '');
  return status !== 'failed';
}

function reason(row: Row | undefined): string | null {
  const payload = data(row);
  for (const key of ['reason', 'error', 'message', 'failed_stage']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  }
  return row ? String(row.event) : null;
}

export function classifyRuntimeIncidents(
  rows: readonly Row[],
  definitions: readonly RuntimeIncidentDefinition[] = DEFINITIONS,
): RuntimeIncidentSignal[] {
  return definitions.map((definition) => {
    const relevant = rows
      .filter((row) =>
        definition.failureEvents.includes(String(row.event))
        || definition.successEvents.includes(String(row.event)),
      )
      .sort((left, right) => time(right) - time(left));
    const latestFailure = relevant.find((row) => failure(row, definition));
    const latestSuccess = relevant.find((row) => success(row, definition));
    const active = Boolean(latestFailure) && time(latestFailure) > time(latestSuccess);
    let consecutiveFailures = 0;
    if (active) {
      for (const row of relevant) {
        if (success(row, definition)) break;
        if (failure(row, definition)) consecutiveFailures += 1;
      }
    }
    return {
      definition,
      active,
      consecutiveFailures,
      latestFailureAt: latestFailure?.created_at ?? null,
      latestSuccessAt: latestSuccess?.created_at ?? null,
      reason: active ? reason(latestFailure) : null,
    };
  });
}

export async function syncRuntimeIncidentLoops(args: {
  readonly db: Db;
  readonly now?: Date;
  readonly lookbackHours?: number;
}): Promise<{ opened: number; escalated: number; resolved: number; active: number }> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - (args.lookbackHours ?? 72) * 3_600_000).toISOString();
  const { data: rows, error } = await args.db
    .from('app_logs')
    .select('event,level,created_at,data')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2_000);
  if (error) return { opened: 0, escalated: 0, resolved: 0, active: 0 };

  const signals = classifyRuntimeIncidents(rows ?? []);
  let opened = 0;
  let escalated = 0;
  let resolved = 0;
  for (const signal of signals) {
    const { data: existing } = await args.db
      .from('agent_work_loops')
      .select('id,state,attempt_count,max_attempts,last_attempted_at')
      .eq('source_type', 'runtime_incident')
      .eq('source_key', signal.definition.key)
      .maybeSingle();

    if (!signal.active) {
      if (
        existing?.id
        && !['completed', 'dismissed'].includes(String(existing.state))
        && signal.latestSuccessAt
      ) {
        const { error: closeError } = await args.db.from('agent_work_loops').update({
          state: 'completed',
          evidence: {
            verification: 'replacement_success_signal_observed',
            success_at: signal.latestSuccessAt,
          },
          verified_at: signal.latestSuccessAt,
          resolved_at: now.toISOString(),
          founder_required: false,
          blocker: null,
        }).eq('id', existing.id);
        if (!closeError) resolved += 1;
      }
      continue;
    }

    const maxAttempts = Number(existing?.max_attempts ?? 3);
    const observedAttempts = Math.max(
      Number(existing?.attempt_count ?? 0),
      Math.min(maxAttempts, signal.consecutiveFailures),
    );
    const exhausted = observedAttempts >= maxAttempts;
    const founderRequired = exhausted;
    const payload = {
      lane: signal.definition.lane,
      owner: signal.definition.owner,
      state: exhausted ? 'blocked' : 'executing',
      severity: exhausted ? 'urgent' : 'today',
      title: signal.definition.title,
      detail: signal.reason ?? 'A production runtime failed.',
      next_action: exhausted
        ? 'Open a Codex engineering repair task from this incident; deploy the fix and wait for the replacement success signal.'
        : signal.definition.nextAction,
      due_at: new Date(now.getTime() + (exhausted ? 2 : 6) * 3_600_000).toISOString(),
      attempt_count: observedAttempts,
      last_attempted_at: signal.latestFailureAt,
      founder_required: founderRequired,
      blocker: exhausted
        ? 'Automatic runtime retries were exhausted; the repair requires an engineering change.'
        : null,
      evidence: {
        verification: 'replacement_success_pending',
        latest_failure_at: signal.latestFailureAt,
        latest_success_at: signal.latestSuccessAt,
        consecutive_failures: signal.consecutiveFailures,
        reason: signal.reason,
      },
      metadata: {
        campaign_lane: signal.definition.campaignLane,
        failure_events: signal.definition.failureEvents,
        success_events: signal.definition.successEvents,
        repair_requires_git_when_exhausted: true,
      },
      verified_at: null,
      resolved_at: null,
    };
    if (existing?.id) {
      const { error: updateError } = await args.db
        .from('agent_work_loops')
        .update(payload)
        .eq('id', existing.id);
      if (!updateError && exhausted) escalated += 1;
    } else {
      const { error: insertError } = await args.db.from('agent_work_loops').insert({
        source_type: 'runtime_incident',
        source_key: signal.definition.key,
        ...payload,
      });
      if (!insertError) {
        opened += 1;
        if (exhausted) escalated += 1;
      }
    }
  }
  return {
    opened,
    escalated,
    resolved,
    active: signals.filter((signal) => signal.active).length,
  };
}
