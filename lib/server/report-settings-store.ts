/**
 * Persistence for report contents settings.
 *
 * Mirrors `report-branding-settings.ts`: values live under `metadata.report` on the owning row and
 * are addressed by the same scope union, so a business workspace, an agency, and an individual
 * client all store settings the same way.
 *
 * The store only ever writes the sparse override it is handed. Clearing a scope removes the
 * `report` key rather than writing an empty object, so "following the level above" and "explicitly
 * set to the same values" stay distinguishable on read.
 */
import {
  parseReportSettings,
  resolveReportSettings,
  type PartialReportSettings,
  type ReportSettings,
} from './report-settings';

export type ReportScopeTable = 'startup_workspaces' | 'agency_accounts' | 'agency_clients';

export type ReportScope = {
  readonly table: ReportScopeTable;
  readonly id: string;
};

const ALLOWED_TABLES: readonly ReportScopeTable[] = [
  'startup_workspaces',
  'agency_accounts',
  'agency_clients',
];

type SupabaseLike = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): { maybeSingle(): Promise<{ data: { metadata: unknown } | null; error: unknown }> };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
};

function assertScope(scope: ReportScope): void {
  if (!ALLOWED_TABLES.includes(scope.table)) throw new Error('report_settings_scope_invalid');
  if (!scope.id) throw new Error('report_settings_scope_invalid');
}

async function readMetadata(
  supabase: SupabaseLike,
  scope: ReportScope
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from(scope.table)
    .select('metadata')
    .eq('id', scope.id)
    .maybeSingle();
  if (error) throw new Error('report_settings_read_failed');
  const metadata = data?.metadata;
  return metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
}

/** The sparse override stored at this scope. Empty when the scope follows the level above. */
export async function getReportOverride(args: {
  readonly supabase: SupabaseLike;
  readonly scope: ReportScope;
}): Promise<PartialReportSettings> {
  assertScope(args.scope);
  const metadata = await readMetadata(args.supabase, args.scope);
  return parseReportSettings(metadata['report']);
}

/**
 * Replace the override at this scope. Passing an empty override clears the key entirely — that is
 * what "reset to the default" writes.
 */
export async function saveReportOverride(args: {
  readonly supabase: SupabaseLike;
  readonly scope: ReportScope;
  readonly override: PartialReportSettings;
}): Promise<void> {
  assertScope(args.scope);
  const metadata = await readMetadata(args.supabase, args.scope);

  const isEmpty =
    !args.override.layout &&
    !args.override.engines &&
    !args.override.sections;

  const next = { ...metadata };
  if (isEmpty) delete next['report'];
  else next['report'] = args.override;

  const { error } = await args.supabase
    .from(args.scope.table)
    .update({ metadata: next })
    .eq('id', args.scope.id);
  if (error) throw new Error('report_settings_write_failed');

  // An UPDATE that row-level security filters out returns no error and affects no rows, so a
  // caller using a user-scoped client would report success having written nothing. Read back and
  // confirm rather than trusting the absence of an error.
  const confirmed = await readMetadata(args.supabase, args.scope);
  const landed = parseReportSettings(confirmed['report']);
  const expected = isEmpty ? {} : args.override;
  if (JSON.stringify(landed) !== JSON.stringify(expected)) {
    throw new Error('report_settings_write_not_applied');
  }
}

/** Convenience for a client: the effective settings, plus each level for showing inheritance. */
export async function resolveForClient(args: {
  readonly supabase: SupabaseLike;
  readonly agency: ReportScope;
  readonly client: ReportScope;
}): Promise<{
  readonly effective: ReportSettings;
  readonly inherited: ReportSettings;
  readonly agencyOverride: PartialReportSettings;
  readonly clientOverride: PartialReportSettings;
}> {
  const agencyOverride = await getReportOverride({ supabase: args.supabase, scope: args.agency });
  const clientOverride = await getReportOverride({ supabase: args.supabase, scope: args.client });
  return {
    effective: resolveReportSettings(agencyOverride, clientOverride),
    // What this client would get if its own override were removed — the "following the default" state.
    inherited: resolveReportSettings(agencyOverride),
    agencyOverride,
    clientOverride,
  };
}
