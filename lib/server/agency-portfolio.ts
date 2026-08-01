import type { AgencyDashboardAccount, AgencyDashboardData } from './agency-dashboard-data';
import { loadClientOutcomeEngine } from './client-outcome-engine';

type SupabaseLike = { from(table: string): any };

export type AgencyPortfolioRow = {
  readonly clientId: string;
  readonly clientName: string;
  readonly domain: string | null;
  readonly readinessScore: number | null;
  readonly readinessChange: number | null;
  readonly visibilityPct: number | null;
  readonly visibilityChange: number | null;
  readonly leadingCompetitor: string | null;
  readonly nextAction: string;
  readonly reportStatus: 'ready' | 'scheduled' | 'not_started';
  readonly reportUrl: string | null;
  readonly measuredAt: string | null;
};

type ConfigRow = {
  readonly id: string;
  readonly metadata: Record<string, unknown> | null;
  readonly competitor_list: string[];
};

type ReportRow = {
  readonly pdf_url: string | null;
  readonly generated_at: string;
};

async function leadingCompetitorForRun(args: {
  readonly supabase: SupabaseLike;
  readonly runGroupId: string;
  readonly measuredDomain: string;
}): Promise<string | null> {
  const { data: runs } = await args.supabase
    .from('query_runs')
    .select('id')
    .eq('run_group_id', args.runGroupId)
    .eq('status', 'completed');
  const runIds = ((runs ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (runIds.length === 0) return null;
  const { data: citations } = await args.supabase
    .from('query_citations')
    .select('cited_domain,metadata')
    .in('query_run_id', runIds);
  const counts = new Map<string, number>();
  for (const citation of (citations ?? []) as Array<{
    cited_domain: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    const metadata = citation.metadata ?? {};
    const candidate = typeof metadata['competitor_name'] === 'string'
      ? metadata['competitor_name']
      : citation.cited_domain;
    if (!candidate || candidate.toLowerCase().replace(/^www\./, '') === args.measuredDomain) continue;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export async function loadAgencyPortfolio(args: {
  readonly supabase: SupabaseLike;
  readonly data: AgencyDashboardData;
  readonly account: AgencyDashboardAccount;
}): Promise<AgencyPortfolioRow[]> {
  return Promise.all(args.account.clients.map(async (client) => {
    const clientScans = args.data.scans.filter((scan) => scan.agencyClientId === client.id);
    const latestScan = clientScans[0] ?? null;
    const previousScan = clientScans[1] ?? null;
    const domain = client.canonicalDomain ?? latestScan?.domain ?? null;
    const latestReport = args.data.reports.find((report) => report.agencyClientId === client.id) ?? null;
    if (!domain) {
      return {
        clientId: client.id,
        clientName: client.name,
        domain: null,
        readinessScore: latestScan?.score ?? null,
        readinessChange: null,
        visibilityPct: null,
        visibilityChange: null,
        leadingCompetitor: null,
        nextAction: 'Add the client website',
        reportStatus: latestReport ? 'ready' : 'not_started',
        reportUrl: latestReport?.pdfUrl ?? null,
        measuredAt: latestScan?.createdAt ?? null,
      };
    }

    const canonical = domain.toLowerCase().replace(/^www\./, '');
    const { data: domainRow } = await args.supabase
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    let config: ConfigRow | null = null;
    if (domainRow?.id) {
      const { data } = await args.supabase
        .from('client_benchmark_configs')
        .select('id,metadata,competitor_list')
        .eq('agency_account_id', args.account.id)
        .eq('benchmark_domain_id', domainRow.id)
        .maybeSingle();
      config = data
        ? {
            id: String(data.id),
            metadata: data.metadata && typeof data.metadata === 'object'
              ? data.metadata as Record<string, unknown>
              : null,
            competitor_list: Array.isArray(data.competitor_list) ? data.competitor_list : [],
          }
        : null;
    }

    const { data: scanDetail } = latestScan
      ? await args.supabase
          .from('scans')
          .select('issues_json,full_results_json')
          .eq('id', latestScan.id)
          .maybeSingle()
      : { data: null };
    const outcome = await loadClientOutcomeEngine({
      supabase: args.supabase,
      domain: canonical,
      configMetadata: config?.metadata,
      latestScan: scanDetail,
    });

    let gpmReport: ReportRow | null = null;
    let leadingCompetitor: string | null = null;
    if (config?.id) {
      const [{ data: report }, { data: group }] = await Promise.all([
        args.supabase
          .from('gpm_reports')
          .select('pdf_url,generated_at')
          .eq('config_id', config.id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        args.supabase
          .from('benchmark_run_groups')
          .select('id')
          .eq('metadata->>gpm_config_id', config.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      gpmReport = report
        ? {
            pdf_url: typeof report.pdf_url === 'string' ? report.pdf_url : null,
            generated_at: String(report.generated_at),
          }
        : null;
      if (group?.id) {
        leadingCompetitor = await leadingCompetitorForRun({
          supabase: args.supabase,
          runGroupId: group.id,
          measuredDomain: canonical,
        });
      }
    }

    return {
      clientId: client.id,
      clientName: client.name,
      domain: canonical,
      readinessScore: latestScan?.score ?? null,
      readinessChange: latestScan?.score !== null && latestScan?.score !== undefined
        && previousScan?.score !== null && previousScan?.score !== undefined
        ? latestScan.score - previousScan.score
        : null,
      visibilityPct: outcome.visibilityPct,
      visibilityChange: outcome.deltaPct,
      leadingCompetitor: leadingCompetitor ?? config?.competitor_list?.[0] ?? null,
      nextAction: outcome.actions.find((action) => action.status === 'pending')?.nextStep
        ?? (config ? 'Review the latest client report' : 'Start AI visibility tracking'),
      reportStatus: gpmReport || latestReport ? 'ready' : config ? 'scheduled' : 'not_started',
      reportUrl: gpmReport?.pdf_url ?? latestReport?.pdfUrl ?? null,
      measuredAt: outcome.measuredAt ?? latestScan?.createdAt ?? null,
    };
  }));
}
