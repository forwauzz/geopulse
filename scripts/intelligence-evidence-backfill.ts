import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  EVIDENCE_CATALOG_CONTRACT_VERSION,
  evidenceContentHash,
  evidenceSourceKey,
  stableEvidenceId,
  validateEvidenceCandidates,
  type EvidenceCandidate,
} from '../lib/intelligence/evidence';

const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 250;
const APPLY_CONFIRMATION = '--confirm=INT-005';
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
function json(row: Row, field: string): Record<string, unknown> {
  const value = row[field];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableJsonValue(child)])
    );
  }
  return value;
}
function serialized(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(stableJsonValue(value));
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
function privacy(
  row: Row,
  fallback: EvidenceCandidate['privacy'] = 'internal'
): Pick<EvidenceCandidate, 'privacy' | 'tenantType' | 'tenantId'> {
  for (const [field, tenantType] of [
    ['startup_workspace_id', 'startup_workspace'],
    ['agency_client_id', 'agency_client'],
    ['agency_account_id', 'agency_account'],
    ['user_id', 'user'],
  ] as const) {
    const tenantId = text(row, field);
    if (tenantId) return { privacy: 'private_tenant', tenantType, tenantId };
  }
  return { privacy: fallback, tenantType: null, tenantId: null };
}
function presentArtifact(
  input: Omit<EvidenceCandidate, 'status' | 'storageKind'> & { artifactRef: string | null }
): EvidenceCandidate {
  return input.artifactRef
    ? { ...input, status: 'unverified', storageKind: 'r2' }
    : { ...input, artifactRef: null, status: 'missing', storageKind: 'missing' };
}

async function buildCandidates(client: Client): Promise<EvidenceCandidate[]> {
  const [queryRuns, citations, pages, reports, reportEvals, retrievalEvals, recommendations, tasks] =
    await Promise.all([
      fetchAll(client, 'query_runs', 'id,response_text,response_metadata,created_at,executed_at'),
      fetchAll(client, 'query_citations', 'id,query_run_id,cited_domain,cited_url,grounding_evidence_id,grounding_page_url,citation_type,confidence,metadata,created_at'),
      fetchAll(client, 'scan_pages', 'id,run_id,url,normalized_url,issues_json,status,created_at'),
      fetchAll(client, 'reports', 'id,scan_id,pdf_url,markdown_url,report_payload_version,created_at,pdf_generated_at,user_id,agency_account_id,agency_client_id'),
      fetchAll(client, 'report_eval_runs', 'id,report_id,scan_id,metrics,overall_score,rubric_version,generator_version,created_at'),
      fetchAll(client, 'retrieval_eval_runs', 'id,report_id,scan_run_id,metrics,overall_score,rubric_version,generator_version,prompt_set_name,notes,created_at'),
      fetchAll(client, 'startup_recommendations', 'id,startup_workspace_id,scan_id,report_id,source_kind,source_ref,evidence,confidence,created_at'),
      fetchAll(client, 'startup_implementation_plan_tasks', 'id,plan_id,recommendation_id,startup_workspace_id,task_kind,status,evidence,metadata,created_at,updated_at'),
    ]);
  const candidates: EvidenceCandidate[] = [];

  for (const row of queryRuns) {
    const content = text(row, 'response_text');
    candidates.push({
      sourceKind: 'benchmark_query_run', sourceTable: 'query_runs', sourceId: String(row['id']),
      evidenceKind: 'raw_model_response', objectClass: 'original',
      storageKind: content ? 'postgres_source' : 'missing', status: content ? 'present' : 'missing',
      content, collectedAt: text(row, 'executed_at'), sourceCreatedAt: text(row, 'created_at'),
      parserVersion: null, extractorVersion: null, privacy: 'internal',
      retentionClass: 'measurement_history',
      metadata: { responseMetadataPresent: Object.keys(json(row, 'response_metadata')).length > 0 },
    });
  }
  for (const row of citations) {
    const content = serialized({
      citedDomain: text(row, 'cited_domain'), citedUrl: text(row, 'cited_url'),
      groundingEvidenceId: text(row, 'grounding_evidence_id'),
      groundingPageUrl: text(row, 'grounding_page_url'), citationType: text(row, 'citation_type'),
      confidence: row['confidence'] ?? null,
    });
    candidates.push({
      sourceKind: 'citation_parse', sourceTable: 'query_citations', sourceId: String(row['id']),
      evidenceKind: 'parsed_citation', objectClass: 'parsed',
      storageKind: 'postgres_source', status: 'present', content,
      parentSourceKind: 'benchmark_query_run', parentSourceId: String(row['query_run_id']),
      sourceCreatedAt: text(row, 'created_at'),
      parserVersion: text(json(row, 'metadata'), 'parser_version'), privacy: 'internal',
      retentionClass: 'measurement_history',
    });
  }
  for (const row of pages) {
    const content = serialized(row['issues_json']);
    candidates.push({
      sourceKind: 'page_scan', sourceTable: 'scan_pages', sourceId: String(row['id']),
      evidenceKind: 'page_signal_snapshot', objectClass: 'extracted',
      storageKind: content ? 'postgres_source' : 'missing', status: content ? 'present' : 'missing',
      content, sourceCreatedAt: text(row, 'created_at'), privacy: 'internal',
      retentionClass: 'measurement_history',
      metadata: { url: text(row, 'normalized_url') ?? text(row, 'url'), sourceStatus: text(row, 'status') },
    });
  }
  for (const row of reports) {
    const access = privacy(row);
    for (const [evidenceKind, field] of [['report_pdf', 'pdf_url'], ['report_markdown', 'markdown_url']] as const) {
      candidates.push(presentArtifact({
        sourceKind: 'report_delivery', sourceTable: 'reports', sourceId: String(row['id']),
        evidenceKind, objectClass: 'generated', artifactRef: text(row, field),
        sourceCreatedAt: text(row, 'created_at'), collectedAt: text(row, 'pdf_generated_at'),
        retentionClass: 'generated_artifact', ...access,
        metadata: { reportPayloadVersion: row['report_payload_version'] ?? null },
      }));
    }
  }
  for (const row of reportEvals) {
    candidates.push({
      sourceKind: 'report_eval', sourceTable: 'report_eval_runs', sourceId: String(row['id']),
      evidenceKind: 'report_eval_result', objectClass: 'computed',
      storageKind: 'postgres_source', status: 'present', content: serialized(row['metrics']),
      sourceCreatedAt: text(row, 'created_at'), privacy: 'internal', retentionClass: 'measurement_history',
      metadata: { overallScore: row['overall_score'] ?? null, rubricVersion: text(row, 'rubric_version'), generatorVersion: text(row, 'generator_version') },
    });
  }
  for (const row of retrievalEvals) {
    candidates.push({
      sourceKind: 'retrieval_eval', sourceTable: 'retrieval_eval_runs', sourceId: String(row['id']),
      evidenceKind: 'retrieval_eval_result', objectClass: 'computed',
      storageKind: 'postgres_source', status: 'present', content: serialized(row['metrics']),
      sourceCreatedAt: text(row, 'created_at'), privacy: 'internal', retentionClass: 'measurement_history',
      metadata: { overallScore: row['overall_score'] ?? null, rubricVersion: text(row, 'rubric_version'), generatorVersion: text(row, 'generator_version') },
    });
  }
  for (const row of recommendations) {
    candidates.push({
      sourceKind: 'startup_recommendation', sourceTable: 'startup_recommendations', sourceId: String(row['id']),
      evidenceKind: 'recommendation_support', objectClass: 'generated',
      storageKind: 'postgres_source', status: 'present', content: serialized(row['evidence']),
      artifactRef: text(row, 'source_ref'), sourceCreatedAt: text(row, 'created_at'),
      retentionClass: 'product_record', ...privacy(row),
    });
  }
  for (const row of tasks) {
    candidates.push({
      sourceKind: text(row, 'task_kind') === 'verification' ? 'implementation_verification' : 'implementation_task',
      sourceTable: 'startup_implementation_plan_tasks', sourceId: String(row['id']),
      evidenceKind: text(row, 'task_kind') === 'verification' ? 'verification_evidence' : 'implementation_evidence',
      objectClass: 'generated', storageKind: 'postgres_source', status: 'present',
      content: serialized(row['evidence']), sourceCreatedAt: text(row, 'created_at'),
      collectedAt: text(row, 'updated_at'), retentionClass: 'product_record', ...privacy(row),
    });
  }
  return candidates;
}

function aggregateSnapshot(candidates: readonly EvidenceCandidate[]): string {
  return createHash('sha256').update(candidates.map((candidate) =>
    `${evidenceSourceKey(candidate)}=${evidenceContentHash(candidate.content) ?? candidate.artifactRef ?? 'missing'}`
  ).sort().join('\n')).digest('hex');
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) throw new Error(`Apply requires ${APPLY_CONFIRMATION}.`);
  const client = createServiceRoleClient(url, key);
  const candidates = await buildCandidates(client);
  const validation = validateEvidenceCandidates(candidates);
  const hashes = new Map<string, number>();
  for (const candidate of candidates) {
    const hash = evidenceContentHash(candidate.content);
    if (hash) hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
  }
  const byKind = candidates.reduce<Record<string, number>>((result, candidate) => {
    result[candidate.evidenceKind] = (result[candidate.evidenceKind] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    contractVersion: EVIDENCE_CATALOG_CONTRACT_VERSION,
    sourceCount: candidates.length,
    sourceSnapshot: aggregateSnapshot(candidates),
    byKind,
    missingCount: candidates.filter((candidate) => candidate.status === 'missing').length,
    unverifiedArtifactCount: candidates.filter((candidate) => candidate.status === 'unverified').length,
    duplicateContentGroupCount: [...hashes.values()].filter((count) => count > 1).length,
    duplicateSourceCount: validation.duplicates.length,
    invalidCount: validation.invalid.length,
    invalidSample: validation.invalid.slice(0, 25),
  }, null, 2));
  if (!apply) return;
  if (validation.duplicates.length || validation.invalid.length) {
    throw new Error('Evidence catalog validation failed; apply refused.');
  }

  const indexedRuns = await fetchAll(client, 'intelligence_runs', 'id,source_kind,source_id,canonical_domain_id,canonical_page_id');
  const runs = new Map(indexedRuns.map((row) => [`${row['source_kind']}:${row['source_id']}`, row]));
  const records = candidates.map((candidate) => {
    const run = runs.get(`${candidate.sourceKind}:${candidate.sourceId}`);
    return {
      contract_version: EVIDENCE_CATALOG_CONTRACT_VERSION,
      stable_evidence_id: stableEvidenceId(candidate),
      evidence_kind: candidate.evidenceKind,
      object_class: candidate.objectClass,
      source_kind: candidate.sourceKind,
      source_table: candidate.sourceTable,
      source_id: candidate.sourceId,
      content_hash: evidenceContentHash(candidate.content),
      storage_kind: candidate.storageKind,
      artifact_status: candidate.status,
      inline_excerpt: candidate.content?.slice(0, 500) ?? null,
      artifact_ref: candidate.artifactRef ?? null,
      r2_key: candidate.storageKind === 'r2' ? candidate.artifactRef : null,
      run_id: run?.['id'] ?? null,
      canonical_domain_id: run?.['canonical_domain_id'] ?? null,
      canonical_page_id: run?.['canonical_page_id'] ?? null,
      collected_at: candidate.collectedAt ?? null,
      source_created_at: candidate.sourceCreatedAt ?? null,
      parser_version: candidate.parserVersion ?? null,
      extractor_version: candidate.extractorVersion ?? null,
      privacy: candidate.privacy,
      tenant_type: candidate.tenantType ?? null,
      tenant_id: candidate.tenantId ?? null,
      retention_class: candidate.retentionClass,
      metadata: candidate.metadata ?? {},
    };
  });
  for (let offset = 0; offset < records.length; offset += WRITE_BATCH_SIZE) {
    await upsertBatch(
      client,
      'intelligence_evidence_objects',
      records.slice(offset, offset + WRITE_BATCH_SIZE),
      'source_kind,source_id,evidence_kind',
      offset
    );
  }

  const evidenceRows = await fetchAll(client, 'intelligence_evidence_objects', 'id,source_kind,source_id,evidence_kind');
  const bySource = new Map<string, Row[]>();
  for (const row of evidenceRows) {
    const key = `${row['source_kind']}:${row['source_id']}`;
    bySource.set(key, [...(bySource.get(key) ?? []), row]);
  }
  const edges: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    if (!candidate.parentSourceKind || !candidate.parentSourceId) continue;
    const child = bySource.get(`${candidate.sourceKind}:${candidate.sourceId}`)?.find(
      (row) => row['evidence_kind'] === candidate.evidenceKind
    );
    const parents = bySource.get(`${candidate.parentSourceKind}:${candidate.parentSourceId}`) ?? [];
    for (const parent of parents) {
      if (child) edges.push({ from_evidence_id: child['id'], to_evidence_id: parent['id'], relation: 'parsed_from' });
    }
  }
  for (let offset = 0; offset < edges.length; offset += WRITE_BATCH_SIZE) {
    await upsertBatch(
      client,
      'intelligence_evidence_edges',
      edges.slice(offset, offset + WRITE_BATCH_SIZE),
      'from_evidence_id,to_evidence_id,relation',
      offset
    );
  }
  console.log(`Evidence catalog applied: ${records.length} objects, ${edges.length} lineage edges.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
