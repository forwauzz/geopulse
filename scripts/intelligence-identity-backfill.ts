import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  IDENTITY_NORMALIZATION_VERSION,
  findIdentityCollisions,
  planIdentity,
  type IdentityCandidate,
  type IdentityPlan,
} from '../lib/intelligence/identity';

const PAGE_SIZE = 1_000;
const APPLY_CONFIRMATION = '--confirm=INT-002';

type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
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

function text(row: Row, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function id(row: Row, field = 'id'): string {
  return String(row[field] ?? '');
}

function inheritedCandidate(
  sourceKind: string,
  sourceTable: string,
  row: Row,
  host: string | null
): IdentityCandidate {
  return {
    sourceKind,
    sourceId: id(row),
    sourceTable,
    domainInput: host,
  };
}

async function buildCandidates(client: Client): Promise<IdentityCandidate[]> {
  const [
    scans,
    benchmarkDomains,
    scanPages,
    queryRuns,
    reports,
    recommendations,
    reportEvals,
    retrievalEvals,
    recurringSchedules,
    monitoringSubscriptions,
  ] = await Promise.all([
    fetchAll(client, 'scans', 'id,domain,url,user_id,agency_account_id,agency_client_id,startup_workspace_id,run_source'),
    fetchAll(client, 'benchmark_domains', 'id,canonical_domain,site_url'),
    fetchAll(client, 'scan_pages', 'id,run_id,url,normalized_url'),
    fetchAll(client, 'query_runs', 'id,domain_id'),
    fetchAll(client, 'reports', 'id,scan_id'),
    fetchAll(client, 'startup_recommendations', 'id,scan_id,report_id'),
    fetchAll(client, 'report_eval_runs', 'id,domain,site_url,scan_id,report_id'),
    fetchAll(client, 'retrieval_eval_runs', 'id,domain,site_url'),
    fetchAll(client, 'recurring_audit_schedules', 'id,url,user_id,startup_workspace_id'),
    fetchAll(client, 'monitoring_subscriptions', 'id,domain,origin_scan_id'),
  ]);

  const scanHost = new Map(scans.map((row) => [id(row), text(row, 'domain')]));
  const benchmarkHost = new Map(
    benchmarkDomains.map((row) => [id(row), text(row, 'canonical_domain')])
  );
  const reportHost = new Map(
    reports.map((row) => [id(row), scanHost.get(id(row, 'scan_id')) ?? null])
  );

  const candidates: IdentityCandidate[] = [];
  for (const row of scans) {
    const ownerType =
      text(row, 'startup_workspace_id') ? 'startup_workspace'
      : text(row, 'agency_client_id') ? 'agency_client'
      : text(row, 'agency_account_id') ? 'agency_account'
      : text(row, 'user_id') ? 'user'
      : text(row, 'run_source') === 'internal_benchmark' ? 'internal_benchmark'
      : undefined;
    const ownerId =
      text(row, 'startup_workspace_id') ??
      text(row, 'agency_client_id') ??
      text(row, 'agency_account_id') ??
      text(row, 'user_id');
    candidates.push({
      sourceKind: 'scan',
      sourceId: id(row),
      sourceTable: 'scans',
      domainInput: text(row, 'domain'),
      pageInput: text(row, 'url'),
      ownerType,
      ownerId,
    });
  }
  for (const row of benchmarkDomains) {
    candidates.push({
      sourceKind: 'benchmark_domain',
      sourceId: id(row),
      sourceTable: 'benchmark_domains',
      domainInput: text(row, 'canonical_domain'),
      pageInput: text(row, 'site_url'),
      ownerType: 'internal_benchmark',
      ownerId: null,
    });
  }
  for (const row of scanPages) {
    candidates.push({
      sourceKind: 'scan_page',
      sourceId: id(row),
      sourceTable: 'scan_pages',
      pageInput: text(row, 'normalized_url') ?? text(row, 'url'),
    });
  }
  for (const row of queryRuns) {
    candidates.push(inheritedCandidate(
      'query_run',
      'query_runs',
      row,
      benchmarkHost.get(id(row, 'domain_id')) ?? null
    ));
  }
  for (const row of reports) {
    candidates.push(inheritedCandidate(
      'report',
      'reports',
      row,
      scanHost.get(id(row, 'scan_id')) ?? null
    ));
  }
  for (const row of recommendations) {
    const host =
      scanHost.get(id(row, 'scan_id')) ??
      reportHost.get(id(row, 'report_id')) ??
      null;
    candidates.push(inheritedCandidate('recommendation', 'startup_recommendations', row, host));
  }
  for (const row of reportEvals) {
    const host =
      text(row, 'domain') ??
      scanHost.get(id(row, 'scan_id')) ??
      reportHost.get(id(row, 'report_id')) ??
      null;
    candidates.push({
      ...inheritedCandidate('report_eval', 'report_eval_runs', row, host),
      pageInput: text(row, 'site_url'),
    });
  }
  for (const row of retrievalEvals) {
    candidates.push({
      ...inheritedCandidate('retrieval_eval', 'retrieval_eval_runs', row, text(row, 'domain')),
      pageInput: text(row, 'site_url'),
    });
  }
  for (const row of recurringSchedules) {
    candidates.push({
      sourceKind: 'recurring_schedule',
      sourceId: id(row),
      sourceTable: 'recurring_audit_schedules',
      pageInput: text(row, 'url'),
      ownerType: text(row, 'startup_workspace_id') ? 'startup_workspace' : 'user',
      ownerId: text(row, 'startup_workspace_id') ?? text(row, 'user_id'),
    });
  }
  for (const row of monitoringSubscriptions) {
    candidates.push({
      sourceKind: 'monitoring_subscription',
      sourceId: id(row),
      sourceTable: 'monitoring_subscriptions',
      domainInput: text(row, 'domain') ?? scanHost.get(id(row, 'origin_scan_id')) ?? null,
    });
  }
  return candidates;
}

async function applyPlans(client: Client, plans: readonly IdentityPlan[]): Promise<void> {
  const mapped = plans.filter((plan) => plan.status === 'mapped');
  const domainRows = [...new Map(mapped.map((plan) => [
    plan.domain.normalizedHost,
    {
      normalized_host: plan.domain.normalizedHost,
      normalization_version: IDENTITY_NORMALIZATION_VERSION,
    },
  ])).values()];
  if (domainRows.length > 0) {
    const result = await client.from('intelligence_domains').upsert(domainRows, {
      onConflict: 'normalized_host',
    });
    if (result.error) throw result.error;
  }

  const domainResult = await client
    .from('intelligence_domains')
    .select('id,normalized_host')
    .in('normalized_host', domainRows.map((row) => row.normalized_host));
  if (domainResult.error) throw domainResult.error;
  const domainIds = new Map(
    ((domainResult.data ?? []) as unknown as Row[]).map((row) => [text(row, 'normalized_host')!, id(row)])
  );

  const aliasRows = [...new Map(mapped.flatMap((plan) => {
    const domainId = domainIds.get(plan.domain.normalizedHost)!;
    const canonical = {
      domain_id: domainId,
      alias_host: plan.domain.normalizedHost,
      relationship: 'canonical',
      review_state: 'verified',
      observed_from: `${plan.candidate.sourceKind}:${plan.candidate.sourceId}`,
      normalization_version: IDENTITY_NORMALIZATION_VERSION,
    };
    const observed = {
      ...canonical,
      alias_host: plan.domain.observedHost,
      relationship: plan.domain.observedHost === plan.domain.normalizedHost ? 'canonical' : 'observed_alias',
    };
    return [
      [`${domainId}:${canonical.alias_host}`, canonical] as const,
      [`${domainId}:${observed.alias_host}`, observed] as const,
    ];
  })).values()];
  if (aliasRows.length > 0) {
    const result = await client.from('intelligence_domain_aliases').upsert(aliasRows, {
      onConflict: 'domain_id,alias_host',
    });
    if (result.error) throw result.error;
  }

  const pageRows = [...new Map(mapped.flatMap((plan) => plan.page ? [[
    plan.page.normalizedUrl,
    {
      domain_id: domainIds.get(plan.domain.normalizedHost)!,
      normalized_url: plan.page.normalizedUrl,
      original_url: plan.page.originalUrl,
      normalization_version: IDENTITY_NORMALIZATION_VERSION,
    },
  ]] : [])).values()];
  if (pageRows.length > 0) {
    const result = await client.from('intelligence_pages').upsert(pageRows, {
      onConflict: 'normalized_url',
      ignoreDuplicates: true,
    });
    if (result.error) throw result.error;
  }

  const pageResult = pageRows.length === 0
    ? { data: [], error: null }
    : await client
        .from('intelligence_pages')
        .select('id,normalized_url')
        .in('normalized_url', pageRows.map((row) => row.normalized_url));
  if (pageResult.error) throw pageResult.error;
  const pageIds = new Map(
    ((pageResult.data ?? []) as unknown as Row[]).map((row) => [text(row, 'normalized_url')!, id(row)])
  );

  const ownerRows = [...new Map(mapped.flatMap((plan) => {
    if (!plan.candidate.ownerType) return [];
    const domainId = domainIds.get(plan.domain.normalizedHost)!;
    const ownerId = plan.candidate.ownerId ?? null;
    return [[`${domainId}:${plan.candidate.ownerType}:${ownerId ?? 'internal'}`, {
      domain_id: domainId,
      owner_type: plan.candidate.ownerType,
      owner_id: ownerId,
      visibility: plan.candidate.ownerType === 'internal_benchmark' ? 'internal' : 'tenant',
    }]];
  })).values()];
  if (ownerRows.length > 0) {
    const result = await client.from('intelligence_domain_owners').upsert(ownerRows, {
      onConflict: 'domain_id,owner_type,owner_id',
      ignoreDuplicates: true,
    });
    if (result.error) throw result.error;
  }

  const mappingRows = plans.map((plan) => {
    if (plan.status === 'unmapped') {
      return {
        source_kind: plan.candidate.sourceKind,
        source_id: plan.candidate.sourceId,
        source_table: plan.candidate.sourceTable,
        mapping_status: 'unmapped',
        unmapped_reason: plan.reason,
        observed_host: null,
        observed_url: plan.candidate.pageInput ?? null,
        canonical_domain_id: null,
        canonical_page_id: null,
        normalization_version: IDENTITY_NORMALIZATION_VERSION,
      };
    }
    return {
      source_kind: plan.candidate.sourceKind,
      source_id: plan.candidate.sourceId,
      source_table: plan.candidate.sourceTable,
      mapping_status: 'mapped',
      unmapped_reason: null,
      observed_host: plan.domain.observedHost,
      observed_url: plan.candidate.pageInput ?? null,
      canonical_domain_id: domainIds.get(plan.domain.normalizedHost)!,
      canonical_page_id: plan.page ? pageIds.get(plan.page.normalizedUrl) ?? null : null,
      normalization_version: IDENTITY_NORMALIZATION_VERSION,
    };
  });
  for (let offset = 0; offset < mappingRows.length; offset += PAGE_SIZE) {
    const result = await client
      .from('intelligence_source_identity_maps')
      .upsert(mappingRows.slice(offset, offset + PAGE_SIZE), {
        onConflict: 'source_kind,source_id',
      });
    if (result.error) throw result.error;
  }
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) {
    throw new Error(`Apply requires the explicit safety flag ${APPLY_CONFIRMATION}.`);
  }

  const client = createServiceRoleClient(url, key);
  const candidates = await buildCandidates(client);
  const plans = candidates.map(planIdentity);
  const mapped = plans.filter((plan) => plan.status === 'mapped');
  const unmapped = plans.filter((plan) => plan.status === 'unmapped');
  const collisionGroups = findIdentityCollisions(plans);
  const summary = {
    mode: apply ? 'apply' : 'preview',
    normalizationVersion: IDENTITY_NORMALIZATION_VERSION,
    candidates: plans.length,
    mapped: mapped.length,
    unmapped: unmapped.length,
    uniqueDomains: new Set(mapped.map((plan) => plan.domain.normalizedHost)).size,
    uniquePages: new Set(mapped.flatMap((plan) => plan.page ? [plan.page.normalizedUrl] : [])).size,
    normalizationCollisionGroups: collisionGroups.size,
    bySource: Object.fromEntries(
      [...new Set(plans.map((plan) => plan.candidate.sourceKind))].sort().map((sourceKind) => [
        sourceKind,
        {
          total: plans.filter((plan) => plan.candidate.sourceKind === sourceKind).length,
          unmapped: unmapped.filter((plan) => plan.candidate.sourceKind === sourceKind).length,
        },
      ])
    ),
    unmappedReasons: unmapped.reduce<Record<string, number>>((result, plan) => {
      result[plan.reason] = (result[plan.reason] ?? 0) + 1;
      return result;
    }, {}),
    collisions: Object.fromEntries([...collisionGroups.entries()].slice(0, 100)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (apply) {
    await applyPlans(client, plans);
    console.log('Canonical identity backfill applied idempotently.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
