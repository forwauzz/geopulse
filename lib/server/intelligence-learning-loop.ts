type Db = { from(table: string): any };

type InterventionOutcome = {
  recommendation_id: string;
  startup_workspace_id: string;
  lane_id: string;
  citation_rate_delta: number;
  sample_size: number;
  source_run_ids: string[];
  source_evidence_ids: string[];
  comparison_label: 'exact_lane_version';
  causality_label: 'observational_association_not_causation';
};

export type IntelligenceLearningLoopResult = {
  readonly patternsCreated: number;
  readonly criticalQuarantined: number;
  readonly alertsResolved: number;
  readonly incidentsOpened: number;
};

export function observationalConfidence(sampleSize: number): number {
  return Math.min(0.9, Math.max(0.1, Math.sqrt(Math.max(sampleSize, 1)) / 10));
}

async function materializePatterns(db: Db): Promise<number> {
  const { data, error } = await db
    .from('intelligence_mart_intervention_outcomes')
    .select(
      'recommendation_id,startup_workspace_id,lane_id,citation_rate_delta,sample_size,source_run_ids,source_evidence_ids,comparison_label,causality_label',
    )
    .eq('eligible', true)
    .eq('metric_status', 'available')
    .order('after_observed_at', { ascending: false })
    .limit(100);
  if (error) return 0;
  let created = 0;
  for (const row of (data ?? []) as InterventionOutcome[]) {
    if (
      !row.recommendation_id
      || !row.lane_id
      || !Number.isFinite(Number(row.citation_rate_delta))
      || Number(row.sample_size) <= 0
      || (row.source_evidence_ids ?? []).length === 0
      || (row.source_run_ids ?? []).length < 2
    ) continue;
    const { error: upsertError } = await db.from('intelligence_learning_patterns').upsert({
      pattern_key: `recommendation:${row.recommendation_id}:citation-rate`,
      metric_key: 'intervention_delta',
      status: 'candidate',
      effect_size: Number(row.citation_rate_delta),
      sample_size: Number(row.sample_size),
      cohort_definition: {
        startup_workspace_id: row.startup_workspace_id,
        recommendation_id: row.recommendation_id,
      },
      lane_ids: [row.lane_id],
      confidence: observationalConfidence(Number(row.sample_size)),
      limitations: [
        'This is an observational before/after association, not a causal guarantee.',
        'The pattern applies only to the compatible lane and measured cohort.',
      ],
      evidence_ids: row.source_evidence_ids,
      compatible_run_ids: row.source_run_ids,
      quality_states: ['valid'],
      compatibility_label: row.comparison_label,
      causality_label: row.causality_label,
      created_by: 'elena_learning_loop',
    }, { onConflict: 'pattern_key' });
    if (!upsertError) created += 1;
  }
  return created;
}

async function reconcileQualityDebt(db: Db, now: Date): Promise<{
  criticalQuarantined: number;
  alertsResolved: number;
  incidentsOpened: number;
}> {
  const { data, error } = await db
    .from('intelligence_quality_alerts')
    .select('id,severity,source_kind,source_id,reason_code,evidence_refs,observed_at')
    .is('resolved_at', null)
    .order('severity', { ascending: true })
    .order('observed_at', { ascending: true })
    .limit(250);
  if (error) return { criticalQuarantined: 0, alertsResolved: 0, incidentsOpened: 0 };

  let criticalQuarantined = 0;
  let alertsResolved = 0;
  let incidentsOpened = 0;
  for (const alert of data ?? []) {
    const reason = String(alert.reason_code ?? '');
    const expectedInsufficient = /insufficient|no_compatible|coverage_pending|not_available/i.test(reason);
    if (expectedInsufficient) {
      const { error: resolveError } = await db.from('intelligence_quality_alerts').update({
        resolved_at: now.toISOString(),
        resolution_note: 'Classified as an expected insufficient-data state; no corrupted fact was admitted.',
      }).eq('id', alert.id);
      if (!resolveError) alertsResolved += 1;
      continue;
    }

    const sourceId = String(alert.source_id ?? '');
    const { data: run } = sourceId
      ? await db
          .from('intelligence_runs')
          .select('id,quality_state')
          .eq('source_kind', alert.source_kind)
          .eq('source_id', sourceId)
          .maybeSingle()
      : { data: null };
    if (run?.quality_state === 'valid' || run?.quality_state === 'valid_partial') {
      const { error: resolveError } = await db.from('intelligence_quality_alerts').update({
        resolved_at: now.toISOString(),
        resolution_note: 'A replacement source run passed the active quality gate.',
      }).eq('id', alert.id);
      if (!resolveError) alertsResolved += 1;
      continue;
    }

    if (alert.severity === 'critical' && run?.id) {
      const { error: quarantineError } = await db.from('intelligence_quarantine_events').insert({
        run_id: run.id,
        source_kind: alert.source_kind,
        source_id: sourceId,
        action: 'quarantine',
        reason_code: reason || 'critical_quality_alert',
        evidence_refs: alert.evidence_refs ?? [],
        actor_type: 'system',
        actor_id: 'elena_quality_loop',
      });
      if (!quarantineError) criticalQuarantined += 1;
    }

    const { error: loopError } = await db.from('agent_work_loops').upsert({
      source_type: 'intelligence_quality_alert',
      source_key: alert.id,
      lane: 'intelligence',
      owner: 'Marcus',
      state: 'blocked',
      severity: alert.severity === 'critical' ? 'urgent' : 'today',
      title: `Resolve intelligence quality: ${reason || alert.source_kind}`,
      detail: `Source ${alert.source_kind}:${sourceId || 'unknown'} is excluded from customer claims.`,
      next_action: 'Repair or replace the source measurement, rerun classification, and verify eligibility.',
      due_at: new Date(now.getTime() + (alert.severity === 'critical' ? 4 : 24) * 3_600_000).toISOString(),
      founder_required: false,
      blocker: reason || 'quality_gate_failed',
      evidence: {
        alert_id: alert.id,
        source_kind: alert.source_kind,
        source_id: sourceId || null,
        quarantined: alert.severity === 'critical',
      },
      metadata: { retryable: true, quality_alert: true },
    }, { onConflict: 'source_type,source_key' });
    if (!loopError) incidentsOpened += 1;
  }
  return { criticalQuarantined, alertsResolved, incidentsOpened };
}

export async function runIntelligenceLearningLoop(
  db: Db,
  now = new Date(),
): Promise<IntelligenceLearningLoopResult> {
  const [patternsCreated, quality] = await Promise.all([
    materializePatterns(db),
    reconcileQualityDebt(db, now),
  ]);
  return { patternsCreated, ...quality };
}
