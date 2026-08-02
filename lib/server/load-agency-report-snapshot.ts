import { readAgencyReportSnapshot, type AgencyReportSnapshotV2 } from './agency-report-snapshot';
import { isReportQuarantined } from './report-quarantine';
import { evaluateStoredAgencyReportIntegrity } from '../intelligence/agency-report-integrity';

type SupabaseLike = { from(table: string): any };

export type StoredAgencyReport = {
  readonly reportId: string;
  readonly agencyClientId: string;
  readonly pdfR2Key: string | null;
  readonly generatedAt: string;
  readonly snapshot: AgencyReportSnapshotV2;
};

export async function loadLatestAgencyReport(args: {
  readonly supabase: SupabaseLike;
  readonly agencyClientId: string;
}): Promise<StoredAgencyReport | null> {
  const { data: client } = await args.supabase
    .from('agency_clients')
    .select('id,agency_account_id,canonical_domain')
    .eq('id', args.agencyClientId)
    .maybeSingle();
  if (!client?.canonical_domain) return null;

  const canonical = String(client.canonical_domain).trim().toLowerCase().replace(/^www\./, '');
  const { data: domain } = await args.supabase
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', canonical)
    .maybeSingle();
  if (!domain?.id) return null;

  const { data: config } = await args.supabase
    .from('client_benchmark_configs')
    .select('id,query_set_id,startup_workspace_id,agency_account_id,metadata')
    .eq('agency_account_id', client.agency_account_id)
    .eq('benchmark_domain_id', domain.id)
    .maybeSingle();
  const contextVersion = typeof config?.metadata?.['organization_context_version'] === 'string'
    ? String(config.metadata['organization_context_version'])
    : null;
  const querySetVersion = typeof config?.metadata?.['query_set_version'] === 'string'
    ? String(config.metadata['query_set_version'])
    : null;
  const competitorCohortVersion = typeof config?.metadata?.['competitor_cohort_version'] === 'string'
    ? String(config.metadata['competitor_cohort_version'])
    : null;
  const agencyClientOwnerId = typeof config?.metadata?.['agency_client_id'] === 'string'
    ? String(config.metadata['agency_client_id'])
    : null;
  if (!config?.id || !config.query_set_id || !contextVersion || !querySetVersion || !competitorCohortVersion) return null;

  const { data: activeGroups } = await args.supabase
    .from('benchmark_run_groups')
    .select('id')
    .eq('query_set_id', config.query_set_id)
    .eq('agency_account_id', client.agency_account_id)
    .eq('metadata->>domain_id', domain.id)
    .eq('metadata->>organization_context_version', contextVersion)
    .order('started_at', { ascending: false })
    .limit(80);
  const activeGroupIds = ((activeGroups ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (activeGroupIds.length === 0) return null;

  const { data: reports } = await args.supabase
    .from('gpm_reports')
    .select('id,agency_client_id,pdf_r2_key,generated_at,metadata')
    .eq('config_id', config.id)
    .eq('agency_client_id', args.agencyClientId)
    .eq('platform', 'combined')
    .eq('report_payload_version', '2')
    .in('run_group_id', activeGroupIds)
    .order('generated_at', { ascending: false })
    .limit(25);
  const candidates = ((reports ?? []) as Array<{
    id?: unknown;
    agency_client_id?: unknown;
    pdf_r2_key?: unknown;
    generated_at?: unknown;
    metadata?: unknown;
  }>);
  let report: typeof candidates[number] | null = null;
  let snapshot: AgencyReportSnapshotV2 | null = null;
  for (const candidate of candidates) {
    if (isReportQuarantined(candidate.metadata)) continue;
    const metadata = candidate.metadata && typeof candidate.metadata === 'object'
      ? candidate.metadata as Record<string, unknown>
      : null;
    const parsed = readAgencyReportSnapshot(metadata?.['snapshot']);
    if (!parsed) continue;
    const allSourcesCurrent = Object.values(parsed.integrity.sourceRunGroupIds)
      .every((runGroupId) => activeGroupIds.includes(runGroupId));
    const decision = evaluateStoredAgencyReportIntegrity({
      integrity: metadata?.['integrity'],
      snapshot: parsed,
      expected: {
        configId: String(config.id),
        clientId: args.agencyClientId,
        canonicalDomain: canonical,
        ownerType: agencyClientOwnerId
          ? 'agency_client'
          : typeof config.startup_workspace_id === 'string' ? 'startup_workspace' : 'agency_account',
        ownerId: agencyClientOwnerId
          ?? (typeof config.startup_workspace_id === 'string' ? config.startup_workspace_id : null)
          ?? (typeof config.agency_account_id === 'string' ? config.agency_account_id : null),
        querySetId: String(config.query_set_id),
        contextVersion,
        querySetVersion,
        competitorCohortVersion,
      },
    });
    if (!decision.compatible || !allSourcesCurrent) continue;
    report = candidate;
    snapshot = parsed;
    break;
  }
  if (!report?.id || !snapshot) return null;
  return {
    reportId: String(report.id),
    agencyClientId: typeof report.agency_client_id === 'string' ? report.agency_client_id : args.agencyClientId,
    pdfR2Key: typeof report.pdf_r2_key === 'string' ? report.pdf_r2_key : null,
    generatedAt: String(report.generated_at),
    snapshot,
  };
}
