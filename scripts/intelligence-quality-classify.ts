import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  QUALITY_POLICY_VERSION,
  STALE_RUNNING_HOURS,
  assessMeasurementWindow,
  classifyRunQuality,
  qualityClassificationId,
  type QualityClassification,
  type QualityRunInput,
  type WindowRun,
} from '../lib/intelligence/quality-policy';

const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 250;
const APPLY_CONFIRMATION = '--confirm=INT-006';
const HISTORY_START = '2026-04-01T00:00:00.000Z';
const REQUIRED_PAIRED_MODES = ['grounded_site', 'ungrounded_inference'] as const;
type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function upsertBatch(
  client: Client,
  table: string,
  rows: readonly Record<string, unknown>[],
  onConflict: string,
  offset: number
): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await client.from(table).upsert(rows, { onConflict });
    if (!result.error) return;
    const retryable = /fetch failed|bad gateway|timeout|temporar/i.test(result.error.message);
    if (!retryable || attempt === 5) {
      throw new Error(`${table} upsert failed at row ${offset}: ${result.error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}
function text(row: Row, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}
function object(row: Row, field: string): Record<string, unknown> {
  const value = row[field];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function metaText(row: Row, field: string): string | null {
  const value = object(row, 'response_metadata')[field];
  return typeof value === 'string' && value.trim() ? value : null;
}
async function fetchAll(client: Client, table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
function snapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
type Classified = {
  sourceKind: string;
  sourceId: string;
  sourceSnapshot: string;
  originalStatus: string | null;
  evidenceRefs: string[];
  classification: QualityClassification;
};

async function buildClassification(client: Client, quarantinedSources = new Set<string>()): Promise<{
  classifications: Classified[];
  assessments: Array<{
    sourceKind: string;
    sourceId: string;
    sourceSnapshot: string;
    assessment: ReturnType<typeof assessMeasurementWindow>;
  }>;
}> {
  const [groups, runs, citations] = await Promise.all([
    fetchAll(client, 'benchmark_run_groups', 'id,query_set_id,status,created_at,started_at,completed_at,model_set_version,metadata'),
    fetchAll(client, 'query_runs', 'id,run_group_id,query_id,model_id,status,response_text,response_metadata,error_message,created_at,executed_at'),
    fetchAll(client, 'query_citations', 'id,query_run_id,cited_domain,cited_url,citation_type,created_at'),
  ]);
  const groupIds = new Set(groups.map((row) => String(row['id'])));
  const citationsByRun = new Map<string, Row[]>();
  for (const citation of citations) {
    const key = String(citation['query_run_id']);
    citationsByRun.set(key, [...(citationsByRun.get(key) ?? []), citation]);
  }
  const duplicateKeys = new Map<string, string[]>();
  for (const run of runs) {
    const key = [
      run['run_group_id'], run['query_id'], run['model_id'],
      metaText(run, 'run_mode') ?? '<missing>',
    ].join(':');
    duplicateKeys.set(key, [...(duplicateKeys.get(key) ?? []), String(run['id'])]);
  }
  const duplicateIds = new Set(
    [...duplicateKeys.values()].flatMap((ids) => ids.length > 1 ? ids.slice(1) : [])
  );
  const classifications: Classified[] = [];
  const classificationByRun = new Map<string, QualityClassification>();
  for (const run of runs) {
    const sourceId = String(run['id']);
    const runCitations = citationsByRun.get(sourceId) ?? [];
    const input: QualityRunInput = {
      sourceKind: 'benchmark_query_run',
      sourceId,
      sourceStatus: text(run, 'status'),
      startedAt: text(run, 'executed_at') ?? text(run, 'created_at'),
      completedAt: text(run, 'executed_at'),
      responsePresent: Boolean(text(run, 'response_text')),
      providerErrorPresent: Boolean(text(run, 'error_message')),
      citationCount: runCitations.length,
      invalidCitationCount: runCitations.filter((citation) =>
        !text(citation, 'cited_domain') && !text(citation, 'cited_url')
      ).length,
      parentPresent: groupIds.has(String(run['run_group_id'])),
      protocolComplete: Boolean(text(run, 'query_id') && text(run, 'model_id') && metaText(run, 'run_mode')),
      duplicate: duplicateIds.has(sourceId),
      quarantined: quarantinedSources.has(`benchmark_query_run:${sourceId}`),
    };
    const classification = classifyRunQuality(input);
    classificationByRun.set(sourceId, classification);
    const sourceSnapshot = snapshot({
      status: input.sourceStatus, responsePresent: input.responsePresent,
      providerErrorPresent: input.providerErrorPresent, citationIds: runCitations.map((row) => row['id']).sort(),
      runMode: metaText(run, 'run_mode'), queryId: run['query_id'], modelId: run['model_id'],
    });
    classifications.push({
      sourceKind: 'benchmark_query_run', sourceId, sourceSnapshot,
      originalStatus: input.sourceStatus, classification,
      evidenceRefs: [`query_runs:${sourceId}`, ...runCitations.map((row) => `query_citations:${row['id']}`)],
    });
  }

  const runsByGroup = new Map<string, Row[]>();
  for (const run of runs) {
    const key = String(run['run_group_id']);
    runsByGroup.set(key, [...(runsByGroup.get(key) ?? []), run]);
  }
  type WindowCandidate = {
    sourceId: string;
    seriesKey: string;
    observedAt: string;
    groupIds: string[];
    runs: WindowRun[];
  };
  const windowCandidates = new Map<string, WindowCandidate>();
  for (const group of groups) {
    const groupId = String(group['id']);
    const metadata = object(group, 'metadata');
    const scheduleWindow = typeof metadata['schedule_window_utc'] === 'string'
      ? metadata['schedule_window_utc'] : `legacy:${groupId}`;
    const domainId = typeof metadata['domain_id'] === 'string' ? metadata['domain_id'] : '<unknown-domain>';
    const querySetId = String(group['query_set_id'] ?? '<unknown-query-set>');
    const modelId = String(metadata['model_id'] ?? group['model_set_version'] ?? '<unknown-model>');
    const seriesKey = `${domainId}:${querySetId}:${modelId}`;
    const sourceId = `${scheduleWindow}:${seriesKey}`;
    const candidate = windowCandidates.get(sourceId) ?? {
      sourceId, seriesKey, observedAt: text(group, 'created_at') ?? scheduleWindow,
      groupIds: [], runs: [],
    };
    candidate.groupIds.push(groupId);
    const groupMode = typeof metadata['run_mode'] === 'string' ? metadata['run_mode'] : '<missing>';
    for (const run of runsByGroup.get(groupId) ?? []) {
      candidate.runs.push({
        queryId: String(run['query_id'] ?? '<missing>'),
        modelId: String(run['model_id'] ?? modelId),
        runMode: metaText(run, 'run_mode') ?? groupMode,
        qualityState: classificationByRun.get(String(run['id']))?.state ?? 'incomplete',
        citationCount: citationsByRun.get(String(run['id']))?.length ?? 0,
      });
    }
    windowCandidates.set(sourceId, candidate);
  }
  const previousRateBySeries = new Map<string, number>();
  const assessments = [...windowCandidates.values()]
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .map((window) => {
      const previousRate = previousRateBySeries.get(window.seriesKey) ?? null;
      const assessment = assessMeasurementWindow(window.runs, REQUIRED_PAIRED_MODES, previousRate);
      const validRuns = window.runs.filter((run) =>
        run.qualityState === 'valid' || run.qualityState === 'valid_partial'
      );
      if (validRuns.length) {
        previousRateBySeries.set(
          window.seriesKey,
          validRuns.filter((run) => run.citationCount > 0).length / validRuns.length
        );
      }
      return {
        sourceKind: 'benchmark_measurement_window',
        sourceId: window.sourceId,
        sourceSnapshot: snapshot({
          groupIds: window.groupIds.sort(),
          childStates: window.runs.map((row) => row.qualityState),
          pairedModes: REQUIRED_PAIRED_MODES,
        }),
        assessment,
      };
    });

  for (const group of groups) {
    const sourceId = String(group['id']);
    const status = text(group, 'status');
    if (!['running', 'queued'].includes(status ?? '')) continue;
    const input: QualityRunInput = {
      sourceKind: 'benchmark_run_group', sourceId, sourceStatus: status,
      startedAt: text(group, 'started_at') ?? text(group, 'created_at'),
      completedAt: text(group, 'completed_at'), responsePresent: false,
      providerErrorPresent: false, citationCount: 0, invalidCitationCount: 0,
      parentPresent: true, protocolComplete: true, duplicate: false,
      quarantined: quarantinedSources.has(`benchmark_run_group:${sourceId}`),
    };
    classifications.push({
      sourceKind: 'benchmark_run_group', sourceId,
      sourceSnapshot: snapshot({ status, startedAt: input.startedAt, completedAt: input.completedAt }),
      originalStatus: status, classification: classifyRunQuality(input),
      evidenceRefs: [`benchmark_run_groups:${sourceId}`],
    });
  }
  return { classifications, assessments };
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) throw new Error(`Apply requires ${APPLY_CONFIRMATION}.`);
  const client = createServiceRoleClient(url, key);
  const quarantinedSources = new Set<string>();
  if (apply) {
    const events = await fetchAll(
      client,
      'intelligence_quarantine_events',
      'source_kind,source_id,action,created_at'
    );
    const latest = new Map<string, Row>();
    for (const event of events.sort((left, right) =>
      String(left['created_at']).localeCompare(String(right['created_at']))
    )) {
      latest.set(`${event['source_kind']}:${event['source_id']}`, event);
    }
    for (const [source, event] of latest) {
      if (event['action'] === 'quarantine') quarantinedSources.add(source);
    }
  }
  const result = await buildClassification(client, quarantinedSources);
  const states = result.classifications.reduce<Record<string, number>>((counts, item) => {
    counts[item.classification.state] = (counts[item.classification.state] ?? 0) + 1;
    return counts;
  }, {});
  const stale = result.classifications.filter((item) =>
    item.classification.reasonCodes.includes('stale_running') &&
    item.classification.ageHours !== null &&
    item.classification.ageHours >= STALE_RUNNING_HOURS
  );
  const aprilToPresentStale = stale.filter((item) => {
    const evidenceDate = item.classification.ageHours === null
      ? null
      : new Date(Date.now() - item.classification.ageHours * 3_600_000).toISOString();
    return evidenceDate !== null && evidenceDate >= HISTORY_START;
  });
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    policyVersion: QUALITY_POLICY_VERSION,
    classificationCount: result.classifications.length,
    states,
    staleRunningCount: stale.length,
    aprilToPresentStaleCount: aprilToPresentStale.length,
    staleSample: stale
      .sort((left, right) => (right.classification.ageHours ?? 0) - (left.classification.ageHours ?? 0))
      .slice(0, 25)
      .map((item) => ({
        source: `${item.sourceKind}:${item.sourceId}`,
        originalStatus: item.originalStatus,
        ageHours: Math.round(item.classification.ageHours ?? 0),
        evidenceRefs: item.evidenceRefs,
      })),
    windowCount: result.assessments.length,
    eligibleWindowCount: result.assessments.filter((item) => item.assessment.eligible).length,
    incompleteWindowCount: result.assessments.filter((item) => item.assessment.missingCells.length > 0).length,
    anomalousWindowCount: result.assessments.filter((item) => item.assessment.anomalyCodes.length > 0).length,
  }, null, 2));
  if (!apply) return;

  const indexedRuns = await fetchAll(client, 'intelligence_runs', 'id,source_kind,source_id,lane_id,window_id');
  const runIndex = new Map(indexedRuns.map((row) => [`${row['source_kind']}:${row['source_id']}`, row]));
  const rows = result.classifications.map((item) => {
    const indexed = runIndex.get(`${item.sourceKind}:${item.sourceId}`);
    return {
      stable_classification_id: qualityClassificationId(
        item.sourceKind, item.sourceId, item.sourceSnapshot,
        item.classification.state, item.classification.reasonCodes
      ),
      policy_version: QUALITY_POLICY_VERSION,
      run_id: indexed?.['id'] ?? null,
      source_kind: item.sourceKind,
      source_id: item.sourceId,
      source_snapshot: item.sourceSnapshot,
      original_status: item.originalStatus,
      quality_state: item.classification.state,
      reason_codes: item.classification.reasonCodes,
      age_hours: item.classification.ageHours,
      evidence_refs: item.evidenceRefs,
    };
  });
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    await upsertBatch(
      client,
      'intelligence_run_quality_classifications',
      rows.slice(offset, offset + WRITE_BATCH_SIZE),
      'stable_classification_id',
      offset
    );
  }
  const windowRows = result.assessments.map((item) => {
    const indexed = runIndex.get(`${item.sourceKind}:${item.sourceId}`);
    return {
      policy_version: QUALITY_POLICY_VERSION,
      source_kind: item.sourceKind,
      source_id: item.sourceId,
      lane_id: indexed?.['lane_id'] ?? null,
      window_id: indexed?.['window_id'] ?? null,
      eligible: item.assessment.eligible,
      coverage_ratio: item.assessment.coverageRatio,
      expected_cell_count: item.assessment.expectedCellCount,
      valid_cell_count: item.assessment.validCellCount,
      missing_cells: item.assessment.missingCells,
      anomaly_codes: item.assessment.anomalyCodes,
      source_snapshot: item.sourceSnapshot,
    };
  });
  for (let offset = 0; offset < windowRows.length; offset += WRITE_BATCH_SIZE) {
    await upsertBatch(
      client,
      'intelligence_window_quality_assessments',
      windowRows.slice(offset, offset + WRITE_BATCH_SIZE),
      'policy_version,source_kind,source_id,source_snapshot',
      offset
    );
  }
  const observedAt = new Date().toISOString();
  const alerts = [
    ...stale.map((item) => ({
      policy_version: QUALITY_POLICY_VERSION,
      alert_key: `stale:${item.sourceKind}:${item.sourceId}`,
      severity: 'warning', source_kind: item.sourceKind, source_id: item.sourceId,
      reason_code: 'stale_running', evidence_refs: item.evidenceRefs, observed_at: observedAt,
    })),
    ...result.assessments.filter((item) => item.assessment.anomalyCodes.length).map((item) => ({
      policy_version: QUALITY_POLICY_VERSION,
      alert_key: `window:${item.sourceId}`,
      severity: 'critical', source_kind: item.sourceKind, source_id: item.sourceId,
      reason_code: item.assessment.anomalyCodes[0]!, evidence_refs: [`benchmark_run_groups:${item.sourceId}`],
      observed_at: observedAt,
    })),
  ];
  for (let offset = 0; offset < alerts.length; offset += WRITE_BATCH_SIZE) {
    await upsertBatch(
      client,
      'intelligence_quality_alerts',
      alerts.slice(offset, offset + WRITE_BATCH_SIZE),
      'policy_version,alert_key,observed_at',
      offset
    );
  }
  console.log(`Applied ${rows.length} classifications, ${windowRows.length} window gates, and ${alerts.length} alerts.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
