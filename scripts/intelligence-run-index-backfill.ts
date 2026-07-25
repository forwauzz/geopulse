import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  RUN_INDEX_CONTRACT_VERSION,
  classifyScanSource,
  runSourceKey,
  runSourceSnapshot,
  validateRunIndexCandidates,
  type RunIndexCandidate,
  type RunVisibility,
} from '../lib/intelligence/run-index';
import { inferProvider } from '../lib/intelligence/measurement-lane';

const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 250;
const APPLY_CONFIRMATION = '--confirm=INT-004';
type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function upsertRunBatch(
  client: Client,
  rows: readonly Row[],
  offset: number,
  stage: string
): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await client.from('intelligence_runs').upsert(rows, {
      onConflict: 'source_kind,source_id',
    });
    if (!result.error) return;
    const retryable = /fetch failed|bad gateway|timeout|temporar/i.test(result.error.message);
    if (!retryable || attempt === 5) {
      throw new Error(`${stage} failed at row ${offset}: ${result.error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}
function text(row: Row, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}
function metadata(row: Row, field = 'metadata'): Record<string, unknown> {
  const value = row[field];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function metaText(row: Row, field: string, container = 'metadata'): string | null {
  const value = metadata(row, container)[field];
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
function quality(status: string | null): string {
  if (!status) return 'unknown';
  if (['complete', 'completed', 'fetched', 'delivered', 'validated', 'merged'].includes(status)) return 'complete';
  if (['failed', 'error', 'cancelled'].includes(status)) return 'failed';
  if (['running', 'queued', 'generating', 'planning', 'executing'].includes(status)) return 'running';
  if (['skipped', 'partial'].includes(status)) return 'partial';
  return 'unknown';
}
function tenant(row: Row): { tenantType: string | null; tenantId: string | null; visibility: RunVisibility } {
  for (const [field, type] of [
    ['startup_workspace_id', 'startup_workspace'],
    ['agency_client_id', 'agency_client'],
    ['agency_account_id', 'agency_account'],
    ['user_id', 'user'],
  ] as const) {
    const value = text(row, field);
    if (value) return { tenantType: type, tenantId: value, visibility: 'tenant' };
  }
  return { tenantType: null, tenantId: null, visibility: 'internal' };
}
function base(input: Partial<RunIndexCandidate> & Pick<RunIndexCandidate, 'sourceKind' | 'sourceTable' | 'sourceId'>): RunIndexCandidate {
  return {
    sourceStatus: null,
    qualityState: 'unknown',
    startedAt: null,
    completedAt: null,
    observedAt: null,
    provider: null,
    modelId: null,
    runMode: null,
    versions: {},
    artifactRef: null,
    tenantType: null,
    tenantId: null,
    visibility: 'internal',
    ...input,
  };
}

async function buildCandidates(client: Client): Promise<RunIndexCandidate[]> {
  const [
    scans, deepRuns, pages, groups, queryRuns, citations, reports,
    reportEvals, retrievalEvals, plans, tasks,
  ] = await Promise.all([
    fetchAll(client, 'scans', 'id,status,run_source,created_at,user_id,agency_account_id,agency_client_id,startup_workspace_id,effective_model'),
    fetchAll(client, 'scan_runs', 'id,scan_id,version,started_at,completed_at,created_at,config'),
    fetchAll(client, 'scan_pages', 'id,run_id,status,created_at,http_status,url,normalized_url,issues_json'),
    fetchAll(client, 'benchmark_run_groups', 'id,status,created_at,started_at,completed_at,model_set_version,run_scope,metadata,startup_workspace_id,agency_account_id'),
    fetchAll(client, 'query_runs', 'id,run_group_id,status,created_at,executed_at,model_id,auditor_model_id,response_metadata'),
    fetchAll(client, 'query_citations', 'id,query_run_id,created_at,citation_type,metadata'),
    fetchAll(client, 'reports', 'id,scan_id,type,created_at,pdf_generated_at,email_delivered_at,pdf_url,markdown_url,report_payload_version,user_id,agency_account_id,agency_client_id'),
    fetchAll(client, 'report_eval_runs', 'id,report_id,scan_id,created_at,framework,rubric_version,generator_version,prompt_set_name,metadata'),
    fetchAll(client, 'retrieval_eval_runs', 'id,scan_run_id,report_id,created_at,framework,rubric_version,generator_version,prompt_set_name,metadata'),
    fetchAll(client, 'startup_implementation_plans', 'id,startup_workspace_id,status,created_at,updated_at,scan_id,report_id,source_ref'),
    fetchAll(client, 'startup_implementation_plan_tasks', 'id,plan_id,startup_workspace_id,status,task_kind,created_at,updated_at,evidence'),
  ]);
  const scanKind = new Map(scans.map((row) => [String(row['id']), classifyScanSource(text(row, 'run_source'))]));
  const candidates: RunIndexCandidate[] = [];
  for (const row of scans) {
    const sourceKind = classifyScanSource(text(row, 'run_source'));
    candidates.push(base({
      sourceKind, sourceTable: 'scans', sourceId: String(row['id']),
      identitySourceKind: 'scan', identitySourceId: String(row['id']),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')),
      observedAt: text(row, 'created_at'), modelId: text(row, 'effective_model'),
      provider: inferProvider(text(row, 'effective_model')),
      versions: { checkCatalog: null, scanner: null },
      ...tenant(row),
    }));
  }
  for (const row of deepRuns) {
    const parentKind = scanKind.get(String(row['scan_id'])) ?? 'scan_unknown';
    candidates.push(base({
      sourceKind: 'deep_audit_run', sourceTable: 'scan_runs', sourceId: String(row['id']),
      parentSourceKind: parentKind, parentSourceId: String(row['scan_id']),
      identitySourceKind: 'scan', identitySourceId: String(row['scan_id']),
      sourceStatus: metaText(row, 'crawl_pending', 'config') ? 'running' : null,
      startedAt: text(row, 'started_at'), completedAt: text(row, 'completed_at'),
      observedAt: text(row, 'created_at'), versions: { scanner: String(row['version'] ?? '') || null },
    }));
  }
  for (const row of pages) {
    candidates.push(base({
      sourceKind: 'page_scan', sourceTable: 'scan_pages', sourceId: String(row['id']),
      parentSourceKind: 'deep_audit_run', parentSourceId: String(row['run_id']),
      identitySourceKind: 'scan_page', identitySourceId: String(row['id']),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')),
      observedAt: text(row, 'created_at'), artifactRef: text(row, 'normalized_url') ?? text(row, 'url'),
      versions: { checkCatalog: metaText(row, 'checkCatalogVersion', 'issues_json') },
    }));
  }
  for (const row of groups) {
    const modelId = text(row, 'model_set_version');
    candidates.push(base({
      sourceKind: 'benchmark_run_group', sourceTable: 'benchmark_run_groups', sourceId: String(row['id']),
      laneSourceKind: 'benchmark_run_group', laneSourceId: String(row['id']),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')),
      startedAt: text(row, 'started_at'), completedAt: text(row, 'completed_at'), observedAt: text(row, 'created_at'),
      provider: inferProvider(modelId), modelId, runMode: metaText(row, 'run_mode'),
      versions: {
        schedule: metaText(row, 'schedule_version'),
        prompt: metaText(row, 'prompt_version'),
        citationParser: metaText(row, 'citation_parser_version'),
        metricDefinition: metaText(row, 'metric_definition_version'),
      },
      ...tenant(row),
    }));
  }
  for (const row of queryRuns) {
    const modelId = text(row, 'model_id');
    candidates.push(base({
      sourceKind: 'benchmark_query_run', sourceTable: 'query_runs', sourceId: String(row['id']),
      parentSourceKind: 'benchmark_run_group', parentSourceId: String(row['run_group_id']),
      identitySourceKind: 'query_run', identitySourceId: String(row['id']),
      laneSourceKind: 'benchmark_run_group', laneSourceId: String(row['run_group_id']),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')),
      startedAt: text(row, 'executed_at'), completedAt: text(row, 'executed_at'), observedAt: text(row, 'created_at'),
      provider: inferProvider(modelId), modelId, runMode: metaText(row, 'run_mode', 'response_metadata'),
      versions: { responseProtocol: metaText(row, 'protocol_version', 'response_metadata') },
    }));
  }
  for (const row of citations) {
    candidates.push(base({
      sourceKind: 'citation_parse', sourceTable: 'query_citations', sourceId: String(row['id']),
      parentSourceKind: 'benchmark_query_run', parentSourceId: String(row['query_run_id']),
      sourceStatus: text(row, 'citation_type'), qualityState: 'complete', observedAt: text(row, 'created_at'),
      versions: { citationParser: metaText(row, 'parser_version') },
    }));
  }
  for (const row of reports) {
    const parentKind = scanKind.get(String(row['scan_id'])) ?? 'scan_unknown';
    candidates.push(base({
      sourceKind: 'report_delivery', sourceTable: 'reports', sourceId: String(row['id']),
      parentSourceKind: parentKind, parentSourceId: String(row['scan_id']),
      identitySourceKind: 'report', identitySourceId: String(row['id']),
      sourceStatus: text(row, 'type'), qualityState: text(row, 'email_delivered_at') ? 'complete' : 'unknown',
      completedAt: text(row, 'pdf_generated_at') ?? text(row, 'email_delivered_at'), observedAt: text(row, 'created_at'),
      artifactRef: text(row, 'pdf_url') ?? text(row, 'markdown_url'),
      versions: { reportPayload: String(row['report_payload_version'] ?? '') || null },
      ...tenant(row),
    }));
  }
  for (const row of reportEvals) {
    candidates.push(base({
      sourceKind: 'report_eval', sourceTable: 'report_eval_runs', sourceId: String(row['id']),
      parentSourceKind: text(row, 'report_id') ? 'report_delivery' : null,
      parentSourceId: text(row, 'report_id'),
      identitySourceKind: 'report_eval', identitySourceId: String(row['id']),
      sourceStatus: text(row, 'framework'), qualityState: 'complete', observedAt: text(row, 'created_at'),
      versions: { rubric: text(row, 'rubric_version'), generator: text(row, 'generator_version'), prompt: text(row, 'prompt_set_name') },
    }));
  }
  for (const row of retrievalEvals) {
    candidates.push(base({
      sourceKind: 'retrieval_eval', sourceTable: 'retrieval_eval_runs', sourceId: String(row['id']),
      parentSourceKind: text(row, 'report_id') ? 'report_delivery' : text(row, 'scan_run_id') ? 'deep_audit_run' : null,
      parentSourceId: text(row, 'report_id') ?? text(row, 'scan_run_id'),
      identitySourceKind: 'retrieval_eval', identitySourceId: String(row['id']),
      sourceStatus: text(row, 'framework'), qualityState: 'complete', observedAt: text(row, 'created_at'),
      versions: { rubric: text(row, 'rubric_version'), generator: text(row, 'generator_version'), prompt: text(row, 'prompt_set_name') },
    }));
  }
  for (const row of plans) {
    candidates.push(base({
      sourceKind: 'implementation_plan', sourceTable: 'startup_implementation_plans', sourceId: String(row['id']),
      identitySourceKind: text(row, 'scan_id') ? 'scan' : text(row, 'report_id') ? 'report' : null,
      identitySourceId: text(row, 'scan_id') ?? text(row, 'report_id'),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')), observedAt: text(row, 'created_at'),
      artifactRef: text(row, 'source_ref'),
      tenantType: 'startup_workspace', tenantId: text(row, 'startup_workspace_id'), visibility: 'tenant',
    }));
  }
  for (const row of tasks) {
    const verification = text(row, 'task_kind') === 'verification';
    candidates.push(base({
      sourceKind: verification ? 'implementation_verification' : 'implementation_task',
      sourceTable: 'startup_implementation_plan_tasks', sourceId: String(row['id']),
      parentSourceKind: 'implementation_plan', parentSourceId: String(row['plan_id']),
      sourceStatus: text(row, 'status'), qualityState: quality(text(row, 'status')), observedAt: text(row, 'created_at'),
      tenantType: 'startup_workspace', tenantId: text(row, 'startup_workspace_id'), visibility: 'tenant',
    }));
  }
  return candidates;
}

function aggregateSnapshot(candidates: readonly RunIndexCandidate[]): string {
  return createHash('sha256')
    .update(candidates.map((candidate) => `${runSourceKey(candidate)}=${runSourceSnapshot(candidate)}`).sort().join('\n'))
    .digest('hex');
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) throw new Error(`Apply requires ${APPLY_CONFIRMATION}.`);
  const client = createServiceRoleClient(url, key);
  const candidates = await buildCandidates(client);
  const validation = validateRunIndexCandidates(candidates);
  const sourceSnapshot = aggregateSnapshot(candidates);
  const byKind = candidates.reduce<Record<string, number>>((result, candidate) => {
    result[candidate.sourceKind] = (result[candidate.sourceKind] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    contractVersion: RUN_INDEX_CONTRACT_VERSION,
    sourceCount: candidates.length,
    sourceSnapshot,
    byKind,
    duplicateCount: validation.duplicates.length,
    orphanCount: validation.missingParents.length,
    unsupportedCount: validation.unsupported.length,
    orphanSample: validation.missingParents.slice(0, 25),
  }, null, 2));
  if (!apply) return;

  const [identityMaps, laneMaps] = await Promise.all([
    fetchAll(client, 'intelligence_source_identity_maps', 'source_kind,source_id,canonical_domain_id,canonical_page_id,mapping_status'),
    fetchAll(client, 'intelligence_measurement_run_mappings', 'source_kind,source_id,lane_id,window_id'),
  ]);
  const identities = new Map(identityMaps.map((row) => [`${row['source_kind']}:${row['source_id']}`, row]));
  const lanes = new Map(laneMaps.map((row) => [`${row['source_kind']}:${row['source_id']}`, row]));
  const rows = candidates.map((candidate) => {
    const identity = candidate.identitySourceKind && candidate.identitySourceId
      ? identities.get(`${candidate.identitySourceKind}:${candidate.identitySourceId}`)
      : undefined;
    const lane = candidate.laneSourceKind && candidate.laneSourceId
      ? lanes.get(`${candidate.laneSourceKind}:${candidate.laneSourceId}`)
      : undefined;
    return {
      contract_version: RUN_INDEX_CONTRACT_VERSION,
      source_kind: candidate.sourceKind,
      source_table: candidate.sourceTable,
      source_id: candidate.sourceId,
      source_snapshot: runSourceSnapshot(candidate),
      canonical_domain_id: identity?.['canonical_domain_id'] ?? null,
      canonical_page_id: identity?.['canonical_page_id'] ?? null,
      lane_id: lane?.['lane_id'] ?? null,
      window_id: lane?.['window_id'] ?? null,
      parent_run_id: null,
      source_status: candidate.sourceStatus,
      quality_state: candidate.qualityState,
      started_at: candidate.startedAt,
      completed_at: candidate.completedAt,
      observed_at: candidate.observedAt,
      provider: candidate.provider,
      model_id: candidate.modelId,
      run_mode: candidate.runMode,
      versions: candidate.versions,
      artifact_ref: candidate.artifactRef,
      tenant_type: candidate.tenantType,
      tenant_id: candidate.tenantId,
      visibility: candidate.visibility,
      metadata: candidate.metadata ?? {},
    };
  });
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    await upsertRunBatch(
      client,
      rows.slice(offset, offset + WRITE_BATCH_SIZE),
      offset,
      'Run index upsert'
    );
  }
  const indexed = await fetchAll(client, 'intelligence_runs', 'id,source_kind,source_id,source_snapshot');
  const indexedByKey = new Map(indexed.map((row) => [`${row['source_kind']}:${row['source_id']}`, row]));
  const rowsWithParents = rows.map((row, index) => {
    const candidate = candidates[index]!;
    const parent = candidate.parentSourceKind && candidate.parentSourceId
      ? indexedByKey.get(`${candidate.parentSourceKind}:${candidate.parentSourceId}`)
      : undefined;
    return { ...row, parent_run_id: parent?.['id'] ?? null };
  });
  for (let offset = 0; offset < rowsWithParents.length; offset += WRITE_BATCH_SIZE) {
    await upsertRunBatch(
      client,
      rowsWithParents.slice(offset, offset + WRITE_BATCH_SIZE),
      offset,
      'Run parent-link upsert'
    );
  }
  const afterCandidates = await buildCandidates(client);
  if (aggregateSnapshot(afterCandidates) !== sourceSnapshot) {
    throw new Error('Source reconciliation failed: source envelope changed during backfill.');
  }
  const checkpoint = await client.from('intelligence_backfill_checkpoints').upsert({
    backfill_key: 'intelligence-runs-v1',
    contract_version: RUN_INDEX_CONTRACT_VERSION,
    last_source_key: candidates.length ? runSourceKey(candidates[candidates.length - 1]!) : null,
    source_count: candidates.length,
    indexed_count: rows.length,
    duplicate_count: validation.duplicates.length,
    orphan_count: validation.missingParents.length,
    source_snapshot: sourceSnapshot,
    status: validation.unsupported.length || validation.missingParents.length ? 'needs_review' : 'complete',
  }, { onConflict: 'backfill_key' });
  if (checkpoint.error) throw checkpoint.error;
  console.log('Canonical run index applied; source reconciliation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
