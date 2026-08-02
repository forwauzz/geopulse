import { loadClientOutcomeEngine, type OutcomeEngineView } from './client-outcome-engine';
import type { ClientMeasurementScope } from './client-measurement-scope';
import {
  canManageVisibilityScorecard,
  listVisibilityReports,
  readVisibilityScorecardShareToken,
  type VisibilityReportSummary,
} from './visibility-scorecard-service';

type SupabaseLike = { from(table: string): any };

export type CustomerVisibilityView = {
  readonly workspaceId: string;
  readonly companyName: string;
  readonly domain: string | null;
  readonly readinessScore: number | null;
  readonly configId: string | null;
  readonly status: 'not_configured' | 'queued' | 'running' | 'measured' | 'failed';
  readonly statusMessage: string | null;
  readonly prompts: readonly string[];
  readonly competitors: readonly string[];
  readonly canShareScorecard: boolean;
  readonly shareToken: string | null;
  readonly reports: readonly VisibilityReportSummary[];
  readonly outcome: OutcomeEngineView;
};

const EMPTY_OUTCOME: OutcomeEngineView = {
  measured: false,
  visibilityPct: null,
  previousVisibilityPct: null,
  deltaPct: null,
  trend: 'baseline',
  measuredAt: null,
  previousMeasuredAt: null,
  engines: [],
  actions: [],
  executiveSummary: 'Your first visibility baseline is being prepared.',
  methodology: 'No AI visibility result is shown until a real blind provider run has completed.',
};

function baselineStatus(metadata: Record<string, unknown> | null): CustomerVisibilityView['status'] {
  const value = metadata?.['baseline_status'];
  return value === 'queued' || value === 'running' || value === 'measured' || value === 'failed'
    ? value
    : 'queued';
}

export async function loadCustomerVisibilityView(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
}): Promise<CustomerVisibilityView | null> {
  const { data: membership } = await args.supabase
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership?.startup_workspace_id) return null;

  const { data: workspace } = await args.supabase
    .from('startup_workspaces')
    .select('id,name,canonical_domain,metadata')
    .eq('id', membership.startup_workspace_id)
    .maybeSingle();
  if (!workspace?.id) return null;

  const { data: workspaceDomain } = await args.supabase
    .from('startup_workspace_domains')
    .select('canonical_domain')
    .eq('startup_workspace_id', workspace.id)
    .eq('is_primary', true)
    .maybeSingle();
  const domain = workspaceDomain?.canonical_domain ?? workspace.canonical_domain ?? null;
  if (!domain) {
    return {
      workspaceId: workspace.id,
      companyName: workspace.name,
      domain: null,
      readinessScore: null,
      configId: null,
      status: 'not_configured',
      statusMessage: null,
      prompts: [],
      competitors: [],
      canShareScorecard: false,
      shareToken: null,
      reports: [],
      outcome: EMPTY_OUTCOME,
    };
  }

  const [{ data: domainRow }, { data: latestScan }] = await Promise.all([
    args.supabase.from('benchmark_domains').select('id').eq('canonical_domain', domain).maybeSingle(),
    args.supabase
      .from('scans')
      .select('score,issues_json,full_results_json')
      .eq('domain', domain)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { data: config } = domainRow?.id
    ? await args.supabase
        .from('client_benchmark_configs')
        .select('id,query_set_id,competitor_list,platforms_enabled,metadata')
        .eq('startup_workspace_id', workspace.id)
        .eq('benchmark_domain_id', domainRow.id)
        .maybeSingle()
    : { data: null };
  const metadata =
    config?.metadata && typeof config.metadata === 'object'
      ? config.metadata as Record<string, unknown>
      : null;
  const subject = { kind: 'startup_workspace' as const, id: workspace.id };
  const measurementScope: ClientMeasurementScope | undefined = typeof config?.query_set_id === 'string'
    ? {
        querySetId: config.query_set_id,
        contextVersion: typeof metadata?.['organization_context_version'] === 'string'
          ? String(metadata['organization_context_version'])
          : `unbound-context:${String(config.query_set_id)}`,
        startupWorkspaceId: workspace.id,
        enabledPlatforms: Array.isArray(config.platforms_enabled) ? config.platforms_enabled : [],
      }
    : undefined;
  const [queryResult, outcome, canShareScorecard, reports] = await Promise.all([
    config?.query_set_id
      ? args.supabase
          .from('benchmark_queries')
          .select('query_text')
          .eq('query_set_id', config.query_set_id)
          .order('query_key', { ascending: true })
          .limit(12)
      : Promise.resolve({ data: [] }),
    loadClientOutcomeEngine({
      supabase: args.supabase,
      domain,
      configMetadata: metadata,
      latestScan,
      measurementScope,
    }),
    canManageVisibilityScorecard({ supabase: args.supabase, userId: args.userId, subject }),
    config?.id
      ? listVisibilityReports({ supabase: args.supabase, subject, configId: config.id })
      : Promise.resolve([]),
  ]);
  const queryRows = queryResult.data;

  return {
    workspaceId: workspace.id,
    companyName: workspace.name,
    domain,
    readinessScore: typeof latestScan?.score === 'number' ? latestScan.score : null,
    configId: config?.id ?? null,
    status: outcome.measured ? 'measured' : config ? baselineStatus(metadata) : 'not_configured',
    statusMessage: typeof metadata?.['baseline_error'] === 'string' ? metadata['baseline_error'] : null,
    prompts: ((queryRows ?? []) as Array<{ query_text: string }>).map((row) => row.query_text),
    competitors: Array.isArray(config?.competitor_list) ? config.competitor_list : [],
    canShareScorecard,
    shareToken: readVisibilityScorecardShareToken(workspace.metadata, 'startup_workspace'),
    reports,
    outcome,
  };
}
