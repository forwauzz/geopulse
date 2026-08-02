import { getCitationEvidence, type EngineEvidence } from './citation-evidence';
import { loadClientOutcomeEngine, type OutcomeEngineView } from './client-outcome-engine';
import { resolveGeoPerformanceCaps } from './geo-performance-entitlements';
import {
  getBrandSettingsView,
  type BrandScope,
  type BrandSettingsView,
} from './report-branding-settings';
import { getTrackedPromptPanel, type TrackedPromptPanel } from './tracked-prompts';
import { isClientReportSharingHeld, isReportQuarantined } from './report-quarantine';
import type { ClientMeasurementScope } from './client-measurement-scope';

type SupabaseLike = { from(table: string): any };

export type VisibilityScorecardSubject =
  | { readonly kind: 'startup_workspace'; readonly id: string }
  | { readonly kind: 'agency_client'; readonly id: string };

export type VisibilityReportSummary = {
  readonly id: string;
  readonly platform: string;
  readonly windowDate: string;
  readonly pdfUrl: string | null;
  readonly generatedAt: string;
};

export type VisibilityScorecardData = {
  readonly subject: VisibilityScorecardSubject;
  readonly displayName: string;
  readonly domain: string;
  readonly location: string | null;
  readonly preparedByName: string;
  readonly brand: BrandSettingsView | null;
  readonly readinessScore: number | null;
  readonly readinessChange: number | null;
  readonly outcome: OutcomeEngineView;
  readonly prompts: TrackedPromptPanel;
  readonly evidence: readonly EngineEvidence[];
  readonly competitors: readonly string[];
  readonly reports: readonly VisibilityReportSummary[];
  readonly preparedAt: string;
};

export type VisibilityScorecardSharingResult =
  | { readonly ok: true; readonly token: string | null }
  | { readonly ok: false; readonly code: 'forbidden' | 'not_found' | 'write_failed' | 'held' };

const SHARE_TOKEN_KEY = 'visibility_scorecard_share_token';
const LEGACY_AGENCY_SHARE_TOKEN_KEY = 'client_summary_share_token';

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

export function readVisibilityScorecardShareToken(
  metadata: unknown,
  subjectKind: VisibilityScorecardSubject['kind']
): string | null {
  const record = objectRecord(metadata);
  const current = record[SHARE_TOKEN_KEY];
  if (typeof current === 'string' && current.length >= 24) return current;
  if (subjectKind === 'agency_client') {
    const legacy = record[LEGACY_AGENCY_SHARE_TOKEN_KEY];
    if (typeof legacy === 'string' && legacy.length >= 24) return legacy;
  }
  return null;
}

function subjectTable(subject: VisibilityScorecardSubject): 'startup_workspaces' | 'agency_clients' {
  return subject.kind === 'startup_workspace' ? 'startup_workspaces' : 'agency_clients';
}

async function loadSubjectRow(
  supabase: SupabaseLike,
  subject: VisibilityScorecardSubject
): Promise<Record<string, unknown> | null> {
  const columns = subject.kind === 'startup_workspace'
    ? 'id,name,canonical_domain,metadata'
    : 'id,agency_account_id,name,display_name,canonical_domain,metadata';
  const { data } = await supabase
    .from(subjectTable(subject))
    .select(columns)
    .eq('id', subject.id)
    .maybeSingle();
  return data ? (data as Record<string, unknown>) : null;
}

async function hasActivePaidScope(args: {
  readonly supabase: SupabaseLike;
  readonly subject: VisibilityScorecardSubject;
  readonly subjectRow: Record<string, unknown>;
}): Promise<boolean> {
  const column = args.subject.kind === 'startup_workspace'
    ? 'startup_workspace_id'
    : 'agency_account_id';
  const scopeId = args.subject.kind === 'startup_workspace'
    ? args.subject.id
    : String(args.subjectRow['agency_account_id'] ?? '');
  if (!scopeId) return false;
  const { data } = await args.supabase
    .from('user_subscriptions')
    .select('bundle_key')
    .eq(column, scopeId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return resolveGeoPerformanceCaps(
    typeof data?.bundle_key === 'string' ? data.bundle_key : null
  ) !== null;
}

export async function canManageVisibilityScorecard(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly subject: VisibilityScorecardSubject;
}): Promise<boolean> {
  const subjectRow = await loadSubjectRow(args.supabase, args.subject);
  if (!subjectRow) return false;

  if (args.subject.kind === 'startup_workspace') {
    const { data: membership } = await args.supabase
      .from('startup_workspace_users')
      .select('role')
      .eq('startup_workspace_id', args.subject.id)
      .eq('user_id', args.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (membership?.role !== 'founder' && membership?.role !== 'admin') return false;
  } else {
    const accountId = String(subjectRow['agency_account_id'] ?? '');
    if (!accountId) return false;
    const { data: membership } = await args.supabase
      .from('agency_users')
      .select('role')
      .eq('agency_account_id', accountId)
      .eq('user_id', args.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership || membership.role === 'viewer') return false;
  }

  return hasActivePaidScope({ ...args, subjectRow });
}

export async function updateVisibilityScorecardSharing(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly subject: VisibilityScorecardSubject;
  readonly mode: 'enable' | 'rotate' | 'disable';
}): Promise<VisibilityScorecardSharingResult> {
  if (!(await canManageVisibilityScorecard(args))) return { ok: false, code: 'forbidden' };
  const row = await loadSubjectRow(args.supabase, args.subject);
  if (!row) return { ok: false, code: 'not_found' };
  const metadata = objectRecord(row['metadata']);
  if (
    args.subject.kind === 'agency_client'
    && args.mode !== 'disable'
    && isClientReportSharingHeld(metadata)
  ) {
    return { ok: false, code: 'held' };
  }
  const existing = readVisibilityScorecardShareToken(metadata, args.subject.kind);
  const now = new Date().toISOString();
  const token = args.mode === 'disable'
    ? null
    : args.mode === 'enable' && existing
      ? existing
      : crypto.randomUUID().replaceAll('-', '');
  const nextMetadata = { ...metadata };

  if (token) {
    nextMetadata[SHARE_TOKEN_KEY] = token;
    nextMetadata['visibility_scorecard_shared_at'] = now;
    nextMetadata['visibility_scorecard_shared_by_user_id'] = args.userId;
    if (args.subject.kind === 'agency_client') {
      nextMetadata[LEGACY_AGENCY_SHARE_TOKEN_KEY] = token;
    }
  } else {
    delete nextMetadata[SHARE_TOKEN_KEY];
    if (args.subject.kind === 'agency_client') delete nextMetadata[LEGACY_AGENCY_SHARE_TOKEN_KEY];
    nextMetadata['visibility_scorecard_disabled_at'] = now;
    nextMetadata['visibility_scorecard_disabled_by_user_id'] = args.userId;
  }

  const { error } = await args.supabase
    .from(subjectTable(args.subject))
    .update({ metadata: nextMetadata, updated_at: now })
    .eq('id', args.subject.id);
  return error ? { ok: false, code: 'write_failed' } : { ok: true, token };
}

export async function listVisibilityReports(args: {
  readonly supabase: SupabaseLike;
  readonly subject: VisibilityScorecardSubject;
  readonly configId: string;
  readonly agencyAccountId?: string | null;
  readonly limit?: number;
}): Promise<VisibilityReportSummary[]> {
  let query = args.supabase
    .from('gpm_reports')
    .select('id,platform,window_date,pdf_url,generated_at,metadata')
    .eq('config_id', args.configId);
  query = args.subject.kind === 'startup_workspace'
    ? query.eq('startup_workspace_id', args.subject.id)
    : query.eq('agency_account_id', args.agencyAccountId ?? '');
  const { data } = await query
    .order('generated_at', { ascending: false })
    .limit(100);
  const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
  return ((data ?? []) as Array<{
    id: string;
    platform: string;
    window_date: string;
    pdf_url: string | null;
    generated_at: string;
    metadata: unknown;
  }>).filter((row) => !isReportQuarantined(row.metadata)).slice(0, limit).map((row) => ({
    id: row.id,
    platform: row.platform,
    windowDate: row.window_date,
    pdfUrl: row.pdf_url,
    generatedAt: row.generated_at,
  }));
}

export async function loadVisibilityScorecard(args: {
  readonly supabase: SupabaseLike;
  readonly subject: VisibilityScorecardSubject;
  readonly shareToken: string;
  readonly reportFilesPublicBase: string | null;
}): Promise<VisibilityScorecardData | null> {
  const row = await loadSubjectRow(args.supabase, args.subject);
  if (!row) return null;
  const storedToken = readVisibilityScorecardShareToken(row['metadata'], args.subject.kind);
  if (!storedToken || storedToken !== args.shareToken) return null;
  if (!(await hasActivePaidScope({ supabase: args.supabase, subject: args.subject, subjectRow: row }))) return null;

  let domain = typeof row['canonical_domain'] === 'string' ? row['canonical_domain'] : null;
  let displayName = String(row['display_name'] || row['name'] || 'Business');
  let agencyAccountId: string | null = null;
  let preparedByFallback = 'GEO-Pulse';
  let brandScope: BrandScope;

  if (args.subject.kind === 'startup_workspace') {
    const { data: primaryDomain } = await args.supabase
      .from('startup_workspace_domains')
      .select('canonical_domain')
      .eq('startup_workspace_id', args.subject.id)
      .eq('is_primary', true)
      .maybeSingle();
    domain = primaryDomain?.canonical_domain ?? domain;
    brandScope = { table: 'startup_workspaces', id: args.subject.id };
  } else {
    agencyAccountId = String(row['agency_account_id'] ?? '') || null;
    if (!agencyAccountId) return null;
    const { data: account } = await args.supabase
      .from('agency_accounts')
      .select('name')
      .eq('id', agencyAccountId)
      .maybeSingle();
    preparedByFallback = typeof account?.name === 'string' ? account.name : 'Your marketing partner';
    brandScope = { table: 'agency_accounts', id: agencyAccountId };
  }
  if (!domain) return null;

  const canonicalDomain = domain.toLowerCase().replace(/^www\./, '');
  const { data: domainRow } = await args.supabase
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', canonicalDomain)
    .maybeSingle();
  let configQuery = domainRow?.id
    ? args.supabase
        .from('client_benchmark_configs')
        .select('id,query_set_id,location,competitor_list,platforms_enabled,metadata')
        .eq('benchmark_domain_id', domainRow.id)
    : null;
  if (configQuery) {
    configQuery = args.subject.kind === 'startup_workspace'
      ? configQuery.eq('startup_workspace_id', args.subject.id)
      : configQuery.eq('agency_account_id', agencyAccountId);
  }
  const { data: config } = configQuery
    ? await configQuery.maybeSingle()
    : { data: null };

  let scanQuery = args.supabase
    .from('scans')
    .select('id,score,letter_grade,created_at,issues_json,full_results_json')
    .eq('status', 'complete');
  scanQuery = args.subject.kind === 'startup_workspace'
    ? scanQuery.eq('startup_workspace_id', args.subject.id)
    : scanQuery.eq('agency_client_id', args.subject.id);
  const { data: scans } = await scanQuery
    .order('created_at', { ascending: false })
    .limit(10);
  const scanRows = (scans ?? []) as Array<{
    id: string;
    score: number | null;
    letter_grade: string | null;
    created_at: string;
    issues_json: unknown;
    full_results_json: unknown;
  }>;
  const latestScan = scanRows[0] ?? null;
  const previousScan = scanRows[1] ?? null;
  const configMetadata = objectRecord(config?.metadata);
  const measurementScope: ClientMeasurementScope | undefined = typeof config?.query_set_id === 'string'
    ? args.subject.kind === 'startup_workspace'
      ? {
          querySetId: config.query_set_id,
          startupWorkspaceId: args.subject.id,
          enabledPlatforms: Array.isArray(config.platforms_enabled) ? config.platforms_enabled : [],
        }
      : {
          querySetId: config.query_set_id,
          agencyAccountId: agencyAccountId!,
          enabledPlatforms: Array.isArray(config.platforms_enabled) ? config.platforms_enabled : [],
        }
    : undefined;
  const [brand, outcome, prompts, evidence, reports] = await Promise.all([
    getBrandSettingsView({
      supabase: args.supabase as never,
      scope: brandScope,
      publicBase: args.reportFilesPublicBase,
    }).catch(() => null),
    loadClientOutcomeEngine({
      supabase: args.supabase,
      domain: canonicalDomain,
      configMetadata,
      latestScan,
      measurementScope,
    }),
    getTrackedPromptPanel({ supabase: args.supabase, domain: canonicalDomain, measurementScope }),
    getCitationEvidence({ supabase: args.supabase, domain: canonicalDomain, maxRowsPerEngine: 3, measurementScope }),
    config?.id
      ? listVisibilityReports({
          supabase: args.supabase,
          subject: args.subject,
          configId: config.id,
          agencyAccountId,
        })
      : Promise.resolve([]),
  ]);
  const readinessScore = typeof latestScan?.score === 'number' ? latestScan.score : null;
  const readinessChange = typeof latestScan?.score === 'number' && typeof previousScan?.score === 'number'
    ? latestScan.score - previousScan.score
    : null;
  const scorecardBrand = brand && args.subject.kind === 'startup_workspace'
    ? { ...brand, showPoweredBy: true }
    : brand;
  const preparedByName = scorecardBrand?.companyName || preparedByFallback;
  const preparedAt = reports[0]?.generatedAt
    ?? outcome.measuredAt
    ?? latestScan?.created_at
    ?? new Date().toISOString();

  return {
    subject: args.subject,
    displayName,
    domain: canonicalDomain,
    location: typeof config?.location === 'string' ? config.location : null,
    preparedByName,
    brand: scorecardBrand,
    readinessScore,
    readinessChange,
    outcome,
    prompts,
    evidence,
    competitors: Array.isArray(config?.competitor_list) ? config.competitor_list : [],
    reports,
    preparedAt,
  };
}
