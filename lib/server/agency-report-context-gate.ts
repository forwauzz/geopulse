import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assessAgencyReportCandidate,
  type AgencyReportCandidateAssessment,
  type AgencyReportSourceRun,
} from '../intelligence/agency-report-integrity';
import type { OrganizationContext } from '../intelligence/organization-context';
import type { OrganizationMeasurementBinding } from '../intelligence/organization-measurement-context';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import type { AgencyReportProviderQuality } from './agency-report-provider-quality';
import { loadActiveOrganizationMeasurementContext } from './organization-measurement-context';

type AgencyReportPlatformRun = {
  readonly platform: 'chatgpt' | 'gemini' | 'perplexity';
  readonly runGroupId: string;
};

export type AgencyReportContextGateResult =
  | {
      readonly status: 'compatible';
      readonly context: OrganizationContext;
      readonly binding: OrganizationMeasurementBinding;
      readonly querySet: { readonly id: string; readonly version: string; readonly metadata: Record<string, unknown> };
      readonly sourceRuns: readonly AgencyReportSourceRun[];
    }
  | {
      readonly status: 'quarantined';
      readonly reasons: readonly string[];
    };

function candidateId(args: {
  readonly configId: string;
  readonly windowDate: string;
  readonly platformRuns: readonly AgencyReportPlatformRun[];
}): string {
  const sources = [...args.platformRuns]
    .sort((left, right) => left.platform.localeCompare(right.platform))
    .map((run) => `${run.platform}:${run.runGroupId}`)
    .join('|');
  return `${args.configId}:${args.windowDate}:${sources}`;
}

export async function appendAgencyReportCandidateQuarantine(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly configId: string;
  readonly windowDate: string;
  readonly platformRuns: readonly AgencyReportPlatformRun[];
  readonly reasons: readonly string[];
}): Promise<void> {
  const sourceId = candidateId(args);
  const uniqueReasons = [...new Set(args.reasons)];
  if (uniqueReasons.length === 0) return;
  const { data: existing, error: readError } = await args.supabase
    .from('intelligence_quarantine_events')
    .select('reason_code')
    .eq('source_kind', 'agency_report_candidate')
    .eq('source_id', sourceId)
    .eq('action', 'quarantine')
    .in('reason_code', uniqueReasons);
  if (readError) throw new Error(`agency_report_quarantine_read_failed:${readError.message}`);
  const existingReasons = new Set((existing ?? []).map((row: { reason_code: string }) => row.reason_code));
  const rows = uniqueReasons.filter((reason) => !existingReasons.has(reason)).map((reason) => ({
    run_id: null,
    source_kind: 'agency_report_candidate',
    source_id: sourceId,
    action: 'quarantine',
    reason_code: reason,
    evidence_refs: [{
      config_id: args.configId,
      window_date: args.windowDate,
      source_run_group_ids: Object.fromEntries(args.platformRuns.map((run) => [run.platform, run.runGroupId])),
      next_action: 'Repair the source context and generate a new immutable artifact; do not rewrite this candidate.',
    }],
    actor_type: 'policy',
    actor_id: 'agency_report_integrity_v1',
  }));
  if (rows.length === 0) return;
  const { error } = await args.supabase.from('intelligence_quarantine_events').insert(rows);
  if (error) throw new Error(`agency_report_quarantine_failed:${error.message}`);
}

export async function loadAgencyReportContextGate(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
  readonly platformRuns: readonly AgencyReportPlatformRun[];
  readonly providerQuality: readonly AgencyReportProviderQuality[];
  readonly windowDate: string;
  readonly measuredCanonicalDomain: string;
}): Promise<AgencyReportContextGateResult> {
  const active = await loadActiveOrganizationMeasurementContext({
    supabase: args.supabase,
    config: args.config,
  });
  if (active.status === 'blocked') return { status: 'quarantined', reasons: active.reasons };
  if (!args.config.query_set_id) return { status: 'quarantined', reasons: ['query_set_unbound'] };

  const { data: querySetData, error: querySetError } = await args.supabase
    .from('benchmark_query_sets')
    .select('id,version,metadata')
    .eq('id', args.config.query_set_id)
    .maybeSingle();
  if (querySetError) throw new Error(`agency_report_query_set_failed:${querySetError.message}`);
  const querySet = querySetData && typeof querySetData.id === 'string'
    && typeof querySetData.version === 'string'
    ? {
        id: querySetData.id,
        version: querySetData.version,
        metadata: querySetData.metadata && typeof querySetData.metadata === 'object'
          ? querySetData.metadata as Record<string, unknown>
          : {},
      }
    : null;

  const sourceRuns = await Promise.all(args.platformRuns.map(async (platformRun): Promise<AgencyReportSourceRun> => {
    const { data, error } = await args.supabase
      .from('benchmark_run_groups')
      .select('id,query_set_id,status,metadata,startup_workspace_id,agency_account_id')
      .eq('id', platformRun.runGroupId)
      .maybeSingle();
    if (error) throw new Error(`agency_report_context_group_failed:${error.message}`);
    const quality = args.providerQuality.find((item) =>
      item.platform === platformRun.platform && item.runGroupId === platformRun.runGroupId
    );
    return {
      platform: platformRun.platform,
      runGroupId: platformRun.runGroupId,
      querySetId: typeof data?.query_set_id === 'string' ? data.query_set_id : null,
      status: typeof data?.status === 'string' ? data.status : null,
      agencyAccountId: typeof data?.agency_account_id === 'string' ? data.agency_account_id : null,
      startupWorkspaceId: typeof data?.startup_workspace_id === 'string' ? data.startup_workspace_id : null,
      metadata: data?.metadata ?? null,
      qualityStatus: quality?.status ?? 'unavailable',
    };
  }));
  const assessment: AgencyReportCandidateAssessment = assessAgencyReportCandidate({
    binding: active.binding,
    canonicalDomain: args.measuredCanonicalDomain,
    windowDate: args.windowDate,
    config: {
      id: args.config.id,
      querySetId: args.config.query_set_id,
      agencyAccountId: args.config.agency_account_id,
      startupWorkspaceId: args.config.startup_workspace_id,
      metadata: args.config.metadata,
      competitorList: args.config.competitor_list,
    },
    querySet,
    sourceRuns,
  });
  return assessment.compatible && querySet
    ? { status: 'compatible', context: active.context, binding: active.binding, querySet, sourceRuns }
    : { status: 'quarantined', reasons: assessment.reasons };
}
