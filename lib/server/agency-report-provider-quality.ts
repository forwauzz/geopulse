import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classifyRunQuality,
  type QualityReasonCode,
} from '../intelligence/quality-policy';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import type { GpmReportPlatform } from './agency-report-snapshot';

export const AGENCY_REPORT_PROVIDER_QUALITY_VERSION = 'provider-quality-v1';

type ProviderRun = {
  readonly platform: GpmReportPlatform;
  readonly runGroupId: string;
};

type RunGroupRow = {
  readonly id: string;
  readonly query_set_id: string | null;
  readonly status: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly startup_workspace_id: string | null;
  readonly agency_account_id: string | null;
};

type QueryRunRow = {
  readonly id: string;
  readonly query_id: string | null;
  readonly model_id: string | null;
  readonly status: string | null;
  readonly response_text: string | null;
  readonly response_metadata: Record<string, unknown> | null;
  readonly error_message: string | null;
  readonly executed_at: string | null;
  readonly created_at: string | null;
};

type CitationRow = {
  readonly query_run_id: string;
  readonly cited_domain: string | null;
  readonly cited_url: string | null;
};

export type AgencyReportProviderQualityReason =
  | QualityReasonCode
  | 'run_group_missing'
  | 'run_group_incomplete'
  | 'query_set_mismatch'
  | 'tenant_mismatch'
  | 'expected_query_set_empty'
  | 'query_coverage_incomplete'
  | 'unexpected_query'
  | 'duplicate_query_measurement';

export type AgencyReportProviderQuality = {
  readonly platform: GpmReportPlatform;
  readonly runGroupId: string;
  readonly status: 'measured' | 'unavailable';
  readonly expectedQueryCount: number;
  readonly validQueryCount: number;
  readonly reasonCodes: readonly AgencyReportProviderQualityReason[];
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function runMode(run: QueryRunRow, group: RunGroupRow): string | null {
  return text(run.response_metadata?.['run_mode']) ?? text(group.metadata?.['run_mode']);
}

function tenantMatches(group: RunGroupRow, config: ClientBenchmarkConfigRow): boolean {
  return group.agency_account_id === (config.agency_account_id ?? null)
    && group.startup_workspace_id === (config.startup_workspace_id ?? null);
}

export function assessAgencyReportProviderQuality(args: {
  readonly platformRun: ProviderRun;
  readonly config: ClientBenchmarkConfigRow;
  readonly group: RunGroupRow | null;
  readonly expectedQueryIds: readonly string[];
  readonly runs: readonly QueryRunRow[];
  readonly citations: readonly CitationRow[];
}): AgencyReportProviderQuality {
  const reasons = new Set<AgencyReportProviderQualityReason>();
  const expected = new Set(args.expectedQueryIds);
  const citationsByRun = new Map<string, CitationRow[]>();
  for (const citation of args.citations) {
    citationsByRun.set(citation.query_run_id, [
      ...(citationsByRun.get(citation.query_run_id) ?? []),
      citation,
    ]);
  }

  if (!args.group) reasons.add('run_group_missing');
  if (!args.config.query_set_id || expected.size === 0) reasons.add('expected_query_set_empty');
  if (args.group?.status !== 'completed') reasons.add('run_group_incomplete');
  if (args.group && args.group.query_set_id !== args.config.query_set_id) reasons.add('query_set_mismatch');
  if (args.group && !tenantMatches(args.group, args.config)) reasons.add('tenant_mismatch');

  const runsByQuery = new Map<string, QueryRunRow[]>();
  for (const run of args.runs) {
    const queryId = text(run.query_id);
    if (!queryId || !expected.has(queryId)) {
      reasons.add('unexpected_query');
      continue;
    }
    runsByQuery.set(queryId, [...(runsByQuery.get(queryId) ?? []), run]);
  }

  let validQueryCount = 0;
  for (const queryId of expected) {
    const candidates = runsByQuery.get(queryId) ?? [];
    if (candidates.length !== 1) {
      reasons.add(candidates.length > 1 ? 'duplicate_query_measurement' : 'query_coverage_incomplete');
      continue;
    }
    const run = candidates[0]!;
    const runCitations = citationsByRun.get(run.id) ?? [];
    const classification = classifyRunQuality({
      sourceKind: 'benchmark_query_run',
      sourceId: run.id,
      sourceStatus: run.status,
      startedAt: run.executed_at ?? run.created_at,
      completedAt: run.executed_at,
      responsePresent: Boolean(text(run.response_text)),
      providerErrorPresent: Boolean(text(run.error_message)),
      citationCount: runCitations.length,
      invalidCitationCount: runCitations.filter((citation) =>
        !text(citation.cited_domain) && !text(citation.cited_url)
      ).length,
      parentPresent: Boolean(args.group),
      protocolComplete: Boolean(queryId && text(run.model_id) && args.group && runMode(run, args.group)),
      duplicate: false,
    });
    if (classification.state === 'valid' || classification.state === 'valid_partial') {
      validQueryCount += 1;
    } else {
      for (const reason of classification.reasonCodes) reasons.add(reason);
    }
  }

  if (validQueryCount !== expected.size) reasons.add('query_coverage_incomplete');
  return {
    platform: args.platformRun.platform,
    runGroupId: args.platformRun.runGroupId,
    status: reasons.size === 0 ? 'measured' : 'unavailable',
    expectedQueryCount: expected.size,
    validQueryCount,
    reasonCodes: [...reasons].sort(),
  };
}

export async function loadAgencyReportProviderQuality(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
  readonly platformRuns: readonly ProviderRun[];
}): Promise<readonly AgencyReportProviderQuality[]> {
  if (!args.config.query_set_id) {
    return args.platformRuns.map((platformRun) => assessAgencyReportProviderQuality({
      platformRun,
      config: args.config,
      group: null,
      expectedQueryIds: [],
      runs: [],
      citations: [],
    }));
  }

  const { data: queryRows, error: queryError } = await args.supabase
    .from('benchmark_queries')
    .select('id')
    .eq('query_set_id', args.config.query_set_id);
  if (queryError) throw new Error(`agency_report_quality_queries_failed:${queryError.message}`);
  const expectedQueryIds = (queryRows ?? []).map((row: { id: string }) => String(row.id));

  return Promise.all(args.platformRuns.map(async (platformRun) => {
    const { data: groupData, error: groupError } = await args.supabase
      .from('benchmark_run_groups')
      .select('id,query_set_id,status,metadata,startup_workspace_id,agency_account_id')
      .eq('id', platformRun.runGroupId)
      .maybeSingle();
    if (groupError) throw new Error(`agency_report_quality_group_failed:${groupError.message}`);
    const group = groupData as RunGroupRow | null;

    const { data: runData, error: runError } = await args.supabase
      .from('query_runs')
      .select('id,query_id,model_id,status,response_text,response_metadata,error_message,executed_at,created_at')
      .eq('run_group_id', platformRun.runGroupId)
      .eq('domain_id', args.config.benchmark_domain_id);
    if (runError) throw new Error(`agency_report_quality_runs_failed:${runError.message}`);
    const runs = (runData ?? []) as QueryRunRow[];
    const runIds = runs.map((run) => run.id);
    let citations: CitationRow[] = [];
    if (runIds.length > 0) {
      const { data: citationData, error: citationError } = await args.supabase
        .from('query_citations')
        .select('query_run_id,cited_domain,cited_url')
        .in('query_run_id', runIds);
      if (citationError) throw new Error(`agency_report_quality_citations_failed:${citationError.message}`);
      citations = (citationData ?? []) as CitationRow[];
    }
    return assessAgencyReportProviderQuality({
      platformRun,
      config: args.config,
      group,
      expectedQueryIds,
      runs,
      citations,
    });
  }));
}
