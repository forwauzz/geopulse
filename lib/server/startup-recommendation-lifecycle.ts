import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export const STARTUP_RECOMMENDATION_STATUSES = [
  'suggested',
  'approved',
  'in_progress',
  'shipped',
  'validated',
  'failed',
] as const;

export type StartupRecommendationStatus = (typeof STARTUP_RECOMMENDATION_STATUSES)[number];

export type StartupRecommendationPriority = 'low' | 'medium' | 'high' | 'critical';
export type StartupRecommendationTeamLane = 'founder' | 'dev' | 'content' | 'ops' | 'cross_functional';

export type StartupRecommendationRecord = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly scanId: string | null;
  readonly reportId: string | null;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly teamLane: StartupRecommendationTeamLane;
  readonly priority: StartupRecommendationPriority;
  readonly status: StartupRecommendationStatus;
  readonly statusChangedAt: string;
  readonly statusReason: string | null;
  readonly statusUpdatedByUserId: string | null;
  readonly confidence: number | null;
  readonly evidence: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type StartupRecommendationStatusSummary = {
  suggested: number;
  approved: number;
  inProgress: number;
  shipped: number;
  validated: number;
  failed: number;
  total: number;
  open: number;
};

const TRANSITIONS: Record<StartupRecommendationStatus, readonly StartupRecommendationStatus[]> = {
  suggested: ['approved', 'failed'],
  approved: ['in_progress', 'failed'],
  in_progress: ['shipped', 'failed'],
  shipped: ['validated', 'failed'],
  validated: [],
  failed: ['approved'],
};

function fromRow(row: {
  id: string;
  startup_workspace_id: string;
  scan_id: string | null;
  report_id: string | null;
  source_kind: 'markdown_audit' | 'manual' | 'agent';
  source_ref: string | null;
  title: string;
  summary: string | null;
  team_lane: StartupRecommendationTeamLane;
  priority: StartupRecommendationPriority;
  status: StartupRecommendationStatus;
  status_changed_at: string;
  status_reason: string | null;
  status_updated_by_user_id: string | null;
  confidence: number | null;
  evidence: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}): StartupRecommendationRecord {
  return {
    id: row.id,
    startupWorkspaceId: row.startup_workspace_id,
    scanId: row.scan_id,
    reportId: row.report_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    title: row.title,
    summary: row.summary,
    teamLane: row.team_lane,
    priority: row.priority,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    statusReason: row.status_reason,
    statusUpdatedByUserId: row.status_updated_by_user_id,
    confidence: row.confidence,
    evidence: row.evidence ?? {},
    metadata: row.metadata ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function canTransitionRecommendationStatus(args: {
  readonly from: StartupRecommendationStatus;
  readonly to: StartupRecommendationStatus;
}): boolean {
  if (args.from === args.to) return true;
  return TRANSITIONS[args.from].includes(args.to);
}

export async function listStartupRecommendations(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly limit?: number;
}): Promise<StartupRecommendationRecord[]> {
  const { data, error } = await args.supabase
    .from('startup_recommendations')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'title',
        'summary',
        'team_lane',
        'priority',
        'status',
        'status_changed_at',
        'status_reason',
        'status_updated_by_user_id',
        'confidence',
        'evidence',
        'metadata',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(args.limit ?? 200, 500)));

  if (error) throw error;

  return ((data ?? []) as Array<Parameters<typeof fromRow>[0]>).map(fromRow);
}

export async function getStartupRecommendationStatusSummary(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupRecommendationStatusSummary> {
  const { data, error } = await args.supabase
    .from('startup_recommendations')
    .select('status')
    .eq('startup_workspace_id', args.startupWorkspaceId);
  if (error) throw error;

  const counts: StartupRecommendationStatusSummary = {
    suggested: 0,
    approved: 0,
    inProgress: 0,
    shipped: 0,
    validated: 0,
    failed: 0,
    total: 0,
    open: 0,
  };

  for (const row of (data ?? []) as Array<{ status: StartupRecommendationStatus | null }>) {
    const status = row.status;
    if (!status || !STARTUP_RECOMMENDATION_STATUSES.includes(status)) continue;
    if (status === 'in_progress') counts.inProgress += 1;
    if (status === 'suggested') counts.suggested += 1;
    if (status === 'approved') counts.approved += 1;
    if (status === 'shipped') counts.shipped += 1;
    if (status === 'validated') counts.validated += 1;
    if (status === 'failed') counts.failed += 1;
    counts.total += 1;
  }

  counts.open = counts.suggested + counts.approved + counts.inProgress + counts.shipped;
  return counts;
}

export async function transitionStartupRecommendationStatus(args: {
  readonly supabase: SupabaseLike;
  readonly recommendationId: string;
  readonly toStatus: StartupRecommendationStatus;
  readonly changedByUserId?: string | null;
  readonly reason?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly expectedWorkspaceId?: string | null;
}): Promise<StartupRecommendationRecord> {
  const { data: existing, error: existingError } = await args.supabase
    .from('startup_recommendations')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'title',
        'summary',
        'team_lane',
        'priority',
        'status',
        'status_changed_at',
        'status_reason',
        'status_updated_by_user_id',
        'confidence',
        'evidence',
        'metadata',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.recommendationId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Recommendation not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Recommendation is outside the expected startup workspace.');
  }
  if (!canTransitionRecommendationStatus({ from: current.status, to: args.toStatus })) {
    throw new Error(`Invalid status transition: ${current.status} -> ${args.toStatus}`);
  }

  const nowIso = new Date().toISOString();
  const nextMetadata =
    args.metadata && Object.keys(args.metadata).length > 0
      ? { ...(current.metadata ?? {}), ...args.metadata }
      : current.metadata;

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_recommendations')
    .update({
      status: args.toStatus,
      status_changed_at: nowIso,
      status_reason: args.reason ?? null,
      status_updated_by_user_id: args.changedByUserId ?? null,
      metadata: nextMetadata ?? {},
    })
    .eq('id', args.recommendationId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'title',
        'summary',
        'team_lane',
        'priority',
        'status',
        'status_changed_at',
        'status_reason',
        'status_updated_by_user_id',
        'confidence',
        'evidence',
        'metadata',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Recommendation status update failed.');

  const { error: eventError } = await args.supabase.from('startup_recommendation_status_events').insert({
    recommendation_id: current.id,
    startup_workspace_id: current.startupWorkspaceId,
    from_status: current.status,
    to_status: args.toStatus,
    changed_by_user_id: args.changedByUserId ?? null,
    change_note: args.reason ?? null,
    metadata: args.metadata ?? {},
  });
  if (eventError) throw eventError;

  structuredLog(
    'startup_recommendation_status_transitioned',
    {
      startup_workspace_id: current.startupWorkspaceId,
      recommendation_id: current.id,
      from_status: current.status,
      to_status: args.toStatus,
      changed_by_user_id: args.changedByUserId ?? null,
      reason: args.reason ?? null,
    },
    'info'
  );

  return fromRow(updated);
}

export async function createStartupRecommendationsFromMarkdownAudit(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly markdownAuditRef: string;
  readonly scanId?: string | null;
  readonly reportId?: string | null;
  readonly createdByUserId?: string | null;
  readonly items: ReadonlyArray<{
    readonly title: string;
    readonly summary?: string | null;
    readonly teamLane?: StartupRecommendationTeamLane;
    readonly priority?: StartupRecommendationPriority;
    readonly confidence?: number | null;
    readonly evidence?: Record<string, unknown> | null;
    readonly metadata?: Record<string, unknown> | null;
  }>;
}): Promise<{ readonly inserted: number }> {
  const rows = args.items
    .map((item) => ({
      startup_workspace_id: args.startupWorkspaceId,
      scan_id: args.scanId ?? null,
      report_id: args.reportId ?? null,
      source_kind: 'markdown_audit' as const,
      source_ref: args.markdownAuditRef,
      title: item.title.trim(),
      summary: item.summary?.trim() || null,
      team_lane: item.teamLane ?? 'dev',
      priority: item.priority ?? 'medium',
      status: 'suggested' as const,
      confidence: item.confidence ?? null,
      evidence: item.evidence ?? {},
      metadata: item.metadata ?? {},
      created_by_user_id: args.createdByUserId ?? null,
    }))
    .filter((row) => row.title.length > 0);

  if (rows.length === 0) return { inserted: 0 };

  const { error } = await args.supabase.from('startup_recommendations').insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}
