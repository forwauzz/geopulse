import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { METRIC_DICTIONARY_VERSION, ratioMetric } from '../lib/intelligence/metrics';

const PAGE_SIZE = 1_000;
type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function text(row: Row, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}
function object(row: Row, field: string): Record<string, unknown> {
  const value = row[field];
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function normalizedHost(value: string | null): string | null {
  return value?.trim().toLowerCase().replace(/^www\./, '') ?? null;
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

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const client = createServiceRoleClient(url, key);
  const [groups, runs, citations, domains, pages, recommendations, prRuns, tasks, assessments] = await Promise.all([
    fetchAll(client, 'benchmark_run_groups', 'id,query_set_id,model_set_version,metadata,created_at'),
    fetchAll(client, 'query_runs', 'id,run_group_id,domain_id,query_id,model_id,status,response_text,response_metadata,error_message,created_at,executed_at'),
    fetchAll(client, 'query_citations', 'id,query_run_id,cited_domain,cited_url'),
    fetchAll(client, 'benchmark_domains', 'id,canonical_domain'),
    fetchAll(client, 'scan_pages', 'id,run_id,status,issues_json,created_at'),
    fetchAll(client, 'startup_recommendations', 'id,startup_workspace_id,status,created_at'),
    fetchAll(client, 'startup_agent_pr_runs', 'id,recommendation_id,status,completed_at'),
    fetchAll(client, 'startup_implementation_plan_tasks', 'id,recommendation_id,task_kind,status,updated_at'),
    fetchAll(client, 'intelligence_window_quality_assessments', 'source_kind,source_id,eligible,anomaly_codes,assessed_at'),
  ]);
  const groupsById = new Map(groups.map((group) => [String(group['id']), group]));
  const citationsByRun = new Map<string, Row[]>();
  for (const citation of citations) {
    const key = String(citation['query_run_id']);
    citationsByRun.set(key, [...(citationsByRun.get(key) ?? []), citation]);
  }
  const domainById = new Map(domains.map((domain) => [
    String(domain['id']), normalizedHost(text(domain, 'canonical_domain')),
  ]));
  const windowRuns = new Map<string, Row[]>();
  for (const run of runs) {
    const group = groupsById.get(String(run['run_group_id']));
    if (!group) continue;
    const metadata = object(group, 'metadata');
    const domainId = String(metadata['domain_id'] ?? run['domain_id']);
    const querySetId = String(group['query_set_id']);
    const modelId = String(metadata['model_id'] ?? group['model_set_version']);
    const seriesKey = `${domainId}:${querySetId}:${modelId}`;
    const windowKey = `${metadata['schedule_window_utc'] ?? `legacy:${group['id']}`}:${seriesKey}`;
    windowRuns.set(windowKey, [...(windowRuns.get(windowKey) ?? []), run]);
  }
  const latestAssessments = new Map<string, Row>();
  for (const assessment of assessments
    .filter((row) => text(row, 'source_kind') === 'benchmark_measurement_window')
    .sort((left, right) => (text(left, 'assessed_at') ?? '').localeCompare(text(right, 'assessed_at') ?? ''))) {
    latestAssessments.set(String(assessment['source_id']), assessment);
  }
  const eligibleWindows = new Set(
    [...latestAssessments.entries()]
      .filter(([key, row]) => row['eligible'] === true && windowRuns.has(key))
      .map(([key]) => key)
  );
  const anomalousCompleteWindowCount = [...latestAssessments.values()].filter((row) => {
    const anomalies = row['anomaly_codes'];
    return Array.isArray(anomalies) && anomalies.length > 0;
  }).length;
  const qualifyingRuns = [...eligibleWindows].flatMap((key) => windowRuns.get(key) ?? []).filter(
    (run) => text(run, 'status') === 'completed' && Boolean(text(run, 'response_text')) && !text(run, 'error_message')
  );
  const citedRuns = qualifyingRuns.filter((run) => (citationsByRun.get(String(run['id']))?.length ?? 0) > 0);
  const allCitations = qualifyingRuns.flatMap((run) => citationsByRun.get(String(run['id'])) ?? []);
  let selfCitations = 0;
  for (const run of qualifyingRuns) {
    const canonical = domainById.get(String(run['domain_id']));
    if (!canonical) continue;
    selfCitations += (citationsByRun.get(String(run['id'])) ?? []).filter((citation) =>
      normalizedHost(text(citation, 'cited_domain')) === canonical
    ).length;
  }
  const uniqueDomains = new Set(qualifyingRuns.map((run) => String(run['domain_id'])));
  const featureSnapshots = pages.filter((page) => page['issues_json'] !== null && page['issues_json'] !== undefined);
  const mergedRecommendationIds = new Set(prRuns.filter((run) => run['status'] === 'merged').map((run) => String(run['recommendation_id'])));
  const verifiedRecommendationIds = new Set(tasks.filter((task) =>
    task['task_kind'] === 'verification' && task['status'] === 'done'
  ).map((task) => String(task['recommendation_id'])));
  const snapshot = createHash('sha256').update(JSON.stringify({
    qualifyingRunIds: qualifyingRuns.map((run) => run['id']).sort(),
    citationIds: allCitations.map((citation) => citation['id']).sort(),
    pageIds: featureSnapshots.map((page) => page['id']).sort(),
  })).digest('hex');
  console.log(JSON.stringify({
    mode: 'preview',
    metricDictionaryVersion: METRIC_DICTIONARY_VERSION,
    sourceSnapshot: snapshot,
    raw: {
      runGroupCount: groups.length,
      queryRunCount: runs.length,
      citationCount: citations.length,
      scanPageCount: pages.length,
      recommendationCount: recommendations.length,
    },
    qualifying: {
      eligibleWindowCount: eligibleWindows.size,
      anomalousCompleteWindowCount,
      queryRunCount: qualifyingRuns.length,
      uniqueDomainCount: uniqueDomains.size,
      pageFeatureSnapshotCount: featureSnapshots.length,
    },
    metrics: {
      citationRate: ratioMetric(citedRuns.length, qualifyingRuns.length),
      responseCoverage: ratioMetric(qualifyingRuns.length, runs.length),
      shareOfVoice: ratioMetric(selfCitations, allCitations.length),
    },
    interventionCoverage: {
      recommendationCount: recommendations.length,
      mergedRecommendationCount: mergedRecommendationIds.size,
      verifiedRecommendationCount: verifiedRecommendationIds.size,
      compatibleOutcomePairCount: 0,
      compatibleOutcomePairStatus: 'not_available',
      reason: recommendations.length === 0
        ? 'no_recommendations_available'
        : 'use_intelligence_mart_intervention_outcomes_for_materialized_pairs',
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
