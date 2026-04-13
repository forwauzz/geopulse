import { structuredLog } from './structured-log';
import {
  parseStartupOrchestratorDbReviewOutput,
  STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION,
  type StartupOrchestratorDbReviewOutput,
} from './startup-orchestrator-db-review-contract';
import {
  parseStartupOrchestratorRepoReviewOutput,
  STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION,
  type StartupOrchestratorRepoReviewOutput,
} from './startup-orchestrator-repo-review-contract';
import {
  parseStartupOrchestratorRiskReviewOutput,
  STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION,
  type StartupOrchestratorRiskReviewOutput,
} from './startup-orchestrator-risk-review-contract';

type SupabaseLike = {
  from(table: string): any;
};

export const STARTUP_AUDIT_EXECUTION_STATUSES = [
  'received',
  'planning',
  'plan_ready',
  'executing',
  'waiting_manual',
  'completed',
  'failed',
  'cancelled',
] as const;

export type StartupAuditExecutionStatus = (typeof STARTUP_AUDIT_EXECUTION_STATUSES)[number];

export const STARTUP_AUDIT_EXECUTION_APPROVAL_STATUSES = [
  'draft',
  'ready_for_review',
  'approved_for_execution',
  'rejected',
] as const;

export type StartupAuditExecutionApprovalStatus =
  (typeof STARTUP_AUDIT_EXECUTION_APPROVAL_STATUSES)[number];

export type StartupAuditExecutionApproval = {
  readonly status: StartupAuditExecutionApprovalStatus;
  readonly requestedAt: string | null;
  readonly requestedByUserId: string | null;
  readonly approvedAt: string | null;
  readonly approvedByUserId: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedByUserId: string | null;
  readonly rejectionReason: string | null;
  readonly note: string | null;
};

export type StartupAuditExecutionRecord = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly scanId: string | null;
  readonly reportId: string | null;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef: string | null;
  readonly status: StartupAuditExecutionStatus;
  readonly summary: string | null;
  readonly errorMessage: string | null;
  readonly createdByUserId: string | null;
  readonly completedAt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly approval: StartupAuditExecutionApproval;
  readonly repoReviewArtifact: StartupOrchestratorRepoReviewOutput | null;
  readonly dbReviewArtifact: StartupOrchestratorDbReviewOutput | null;
  readonly riskReviewArtifact: StartupOrchestratorRiskReviewOutput | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const TRANSITIONS: Record<StartupAuditExecutionStatus, readonly StartupAuditExecutionStatus[]> = {
  received: ['planning', 'failed', 'cancelled'],
  planning: ['plan_ready', 'failed', 'cancelled'],
  plan_ready: ['executing', 'cancelled', 'failed'],
  executing: ['waiting_manual', 'completed', 'failed', 'cancelled'],
  waiting_manual: ['executing', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['planning', 'cancelled'],
  cancelled: [],
};

const APPROVAL_TRANSITIONS: Record<
  StartupAuditExecutionApprovalStatus,
  readonly StartupAuditExecutionApprovalStatus[]
> = {
  draft: ['ready_for_review', 'rejected'],
  ready_for_review: ['approved_for_execution', 'rejected', 'draft'],
  approved_for_execution: ['ready_for_review', 'rejected'],
  rejected: ['ready_for_review', 'draft'],
};

function parseApprovalStatus(value: unknown): StartupAuditExecutionApprovalStatus | null {
  if (value === 'draft') return 'draft';
  if (value === 'ready_for_review') return 'ready_for_review';
  if (value === 'approved_for_execution') return 'approved_for_execution';
  if (value === 'rejected') return 'rejected';
  return null;
}

function parseStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildApproval(
  status: StartupAuditExecutionStatus,
  metadata: Record<string, unknown>
): StartupAuditExecutionApproval {
  const storedStatus = parseApprovalStatus(metadata['approval_status']);
  const derivedStatus =
    storedStatus ??
    (status === 'plan_ready'
      ? 'ready_for_review'
      : status === 'executing' || status === 'waiting_manual' || status === 'completed'
        ? 'approved_for_execution'
        : 'draft');

  return {
    status: derivedStatus,
    requestedAt: parseStringOrNull(metadata['approval_requested_at']),
    requestedByUserId: parseStringOrNull(metadata['approval_requested_by_user_id']),
    approvedAt: parseStringOrNull(metadata['approval_approved_at']),
    approvedByUserId: parseStringOrNull(metadata['approval_approved_by_user_id']),
    rejectedAt: parseStringOrNull(metadata['approval_rejected_at']),
    rejectedByUserId: parseStringOrNull(metadata['approval_rejected_by_user_id']),
    rejectionReason: parseStringOrNull(metadata['approval_rejection_reason']),
    note: parseStringOrNull(metadata['approval_note']),
  };
}

function fromRow(row: {
  id: string;
  startup_workspace_id: string;
  scan_id: string | null;
  report_id: string | null;
  source_kind: 'markdown_audit' | 'manual' | 'agent';
  source_ref: string | null;
  status: StartupAuditExecutionStatus;
  summary: string | null;
  error_message: string | null;
  created_by_user_id: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}): StartupAuditExecutionRecord {
  const metadata = row.metadata ?? {};
  const repoReviewArtifact = (() => {
    const artifact = metadata['repo_review_artifact'];
    if (!artifact || typeof artifact !== 'object') return null;
    try {
      return parseStartupOrchestratorRepoReviewOutput(artifact);
    } catch {
      return null;
    }
  })();
  const dbReviewArtifact = (() => {
    const artifact = metadata['db_review_artifact'];
    if (!artifact || typeof artifact !== 'object') return null;
    try {
      return parseStartupOrchestratorDbReviewOutput(artifact);
    } catch {
      return null;
    }
  })();
  const riskReviewArtifact = (() => {
    const artifact = metadata['risk_review_artifact'];
    if (!artifact || typeof artifact !== 'object') return null;
    try {
      return parseStartupOrchestratorRiskReviewOutput(artifact);
    } catch {
      return null;
    }
  })();

  return {
    id: row.id,
    startupWorkspaceId: row.startup_workspace_id,
    scanId: row.scan_id,
    reportId: row.report_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    status: row.status,
    summary: row.summary,
    errorMessage: row.error_message,
    createdByUserId: row.created_by_user_id,
    completedAt: row.completed_at,
    metadata,
    approval: buildApproval(row.status, metadata),
    repoReviewArtifact,
    dbReviewArtifact,
    riskReviewArtifact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function canTransitionStartupAuditExecutionStatus(args: {
  readonly from: StartupAuditExecutionStatus;
  readonly to: StartupAuditExecutionStatus;
}): boolean {
  if (args.from === args.to) return true;
  return TRANSITIONS[args.from].includes(args.to);
}

export function canTransitionStartupAuditExecutionApprovalStatus(args: {
  readonly from: StartupAuditExecutionApprovalStatus;
  readonly to: StartupAuditExecutionApprovalStatus;
}): boolean {
  if (args.from === args.to) return true;
  return APPROVAL_TRANSITIONS[args.from].includes(args.to);
}

export function isStartupAuditExecutionApprovedForExecution(
  execution: Pick<StartupAuditExecutionRecord, 'approval'>
): boolean {
  return execution.approval.status === 'approved_for_execution';
}

export async function listStartupAuditExecutions(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly limit?: number;
}): Promise<StartupAuditExecutionRecord[]> {
  const { data, error } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
  if (error) throw error;
  return ((data ?? []) as Array<Parameters<typeof fromRow>[0]>).map(fromRow);
}

export async function getStartupAuditExecution(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
}): Promise<StartupAuditExecutionRecord> {
  const { data, error } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Startup audit execution not found.');
  const execution = fromRow(data as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && execution.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }
  return execution;
}

export async function createStartupAuditExecution(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef?: string | null;
  readonly scanId?: string | null;
  readonly reportId?: string | null;
  readonly summary?: string | null;
  readonly createdByUserId?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<StartupAuditExecutionRecord> {
  const { data: rows, error } = await args.supabase
    .from('startup_audit_executions')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      scan_id: args.scanId ?? null,
      report_id: args.reportId ?? null,
      source_kind: args.sourceKind,
      source_ref: args.sourceRef ?? null,
      status: 'received',
      summary: args.summary ?? null,
      created_by_user_id: args.createdByUserId ?? null,
      metadata: args.metadata ?? {},
    })
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (error) throw error;
  const row = (rows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!row) throw new Error('Could not create startup audit execution.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: args.startupWorkspaceId,
    execution_id: row.id,
    from_status: null,
    to_status: 'received',
    changed_by_user_id: args.createdByUserId ?? null,
    note: 'Created startup audit execution',
    metadata: args.metadata ?? {},
  });

  structuredLog(
    'startup_audit_execution_created',
    {
      startup_workspace_id: args.startupWorkspaceId,
      execution_id: row.id,
      source_kind: args.sourceKind,
      source_ref: args.sourceRef ?? null,
      created_by_user_id: args.createdByUserId ?? null,
    },
    'info'
  );

  return fromRow(row);
}

export async function updateStartupAuditExecutionStatus(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly toStatus: StartupAuditExecutionStatus;
  readonly changedByUserId?: string | null;
  readonly note?: string | null;
  readonly summary?: string | null;
  readonly errorMessage?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<StartupAuditExecutionRecord> {
  const { data: existing, error: existingError } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Startup audit execution not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }
  if (!canTransitionStartupAuditExecutionStatus({ from: current.status, to: args.toStatus })) {
    throw new Error(`Invalid startup audit execution transition: ${current.status} -> ${args.toStatus}`);
  }

  const completedAt =
    args.toStatus === 'completed' || args.toStatus === 'failed' || args.toStatus === 'cancelled'
      ? new Date().toISOString()
      : null;

  const nextMetadata =
    args.metadata && Object.keys(args.metadata).length > 0
      ? { ...(current.metadata ?? {}), ...args.metadata }
      : current.metadata;

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_audit_executions')
    .update({
      status: args.toStatus,
      summary: args.summary ?? current.summary,
      error_message: args.errorMessage ?? (args.toStatus === 'failed' ? current.errorMessage : null),
      completed_at: completedAt,
      metadata: nextMetadata ?? {},
    })
    .eq('id', args.executionId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Startup audit execution status update failed.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: current.startupWorkspaceId,
    execution_id: current.id,
    from_status: current.status,
    to_status: args.toStatus,
    changed_by_user_id: args.changedByUserId ?? null,
    note: args.note ?? null,
    metadata: args.metadata ?? {},
  });

  structuredLog(
    'startup_audit_execution_status_transitioned',
    {
      startup_workspace_id: current.startupWorkspaceId,
      execution_id: current.id,
      from_status: current.status,
      to_status: args.toStatus,
      changed_by_user_id: args.changedByUserId ?? null,
      note: args.note ?? null,
    },
    'info'
  );

  return fromRow(updated);
}

export async function updateStartupAuditExecutionApproval(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly toStatus: StartupAuditExecutionApprovalStatus;
  readonly changedByUserId?: string | null;
  readonly note?: string | null;
  readonly rejectionReason?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<StartupAuditExecutionRecord> {
  const { data: existing, error: existingError } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Startup audit execution not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }
  if (current.status !== 'plan_ready') {
    throw new Error('Startup audit execution approval can only be updated after planning is complete.');
  }
  if (
    !canTransitionStartupAuditExecutionApprovalStatus({
      from: current.approval.status,
      to: args.toStatus,
    })
  ) {
    throw new Error(
      `Invalid startup audit execution approval transition: ${current.approval.status} -> ${args.toStatus}`
    );
  }

  const now = new Date().toISOString();
  const nextMetadata: Record<string, unknown> = {
    ...(current.metadata ?? {}),
    ...(args.metadata ?? {}),
    approval_status: args.toStatus,
    approval_note: args.note ?? current.approval.note,
  };

  if (args.toStatus === 'ready_for_review') {
    nextMetadata['approval_requested_at'] =
      current.approval.requestedAt ?? now;
    nextMetadata['approval_requested_by_user_id'] =
      current.approval.requestedByUserId ?? args.changedByUserId ?? null;
    nextMetadata['approval_approved_at'] = null;
    nextMetadata['approval_approved_by_user_id'] = null;
    nextMetadata['approval_rejected_at'] = null;
    nextMetadata['approval_rejected_by_user_id'] = null;
    nextMetadata['approval_rejection_reason'] = null;
  } else if (args.toStatus === 'approved_for_execution') {
    nextMetadata['approval_requested_at'] =
      current.approval.requestedAt ?? now;
    nextMetadata['approval_requested_by_user_id'] =
      current.approval.requestedByUserId ?? args.changedByUserId ?? null;
    nextMetadata['approval_approved_at'] = now;
    nextMetadata['approval_approved_by_user_id'] = args.changedByUserId ?? null;
    nextMetadata['approval_rejected_at'] = null;
    nextMetadata['approval_rejected_by_user_id'] = null;
    nextMetadata['approval_rejection_reason'] = null;
  } else if (args.toStatus === 'rejected') {
    nextMetadata['approval_requested_at'] =
      current.approval.requestedAt ?? now;
    nextMetadata['approval_requested_by_user_id'] =
      current.approval.requestedByUserId ?? args.changedByUserId ?? null;
    nextMetadata['approval_approved_at'] = null;
    nextMetadata['approval_approved_by_user_id'] = null;
    nextMetadata['approval_rejected_at'] = now;
    nextMetadata['approval_rejected_by_user_id'] = args.changedByUserId ?? null;
    nextMetadata['approval_rejection_reason'] =
      args.rejectionReason ?? current.approval.rejectionReason ?? 'Rejected from startup dashboard';
  } else {
    nextMetadata['approval_approved_at'] = null;
    nextMetadata['approval_approved_by_user_id'] = null;
    nextMetadata['approval_rejected_at'] = null;
    nextMetadata['approval_rejected_by_user_id'] = null;
    nextMetadata['approval_rejection_reason'] = null;
  }

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_audit_executions')
    .update({
      metadata: nextMetadata,
    })
    .eq('id', args.executionId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Startup audit execution approval update failed.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: current.startupWorkspaceId,
    execution_id: current.id,
    from_status: current.status,
    to_status: current.status,
    changed_by_user_id: args.changedByUserId ?? null,
    note: args.note ?? `Execution approval marked ${args.toStatus}`,
    metadata: {
      ...(args.metadata ?? {}),
      approval_from_status: current.approval.status,
      approval_to_status: args.toStatus,
      approval_rejection_reason: args.rejectionReason ?? null,
    },
  });

  structuredLog(
    'startup_audit_execution_approval_updated',
    {
      startup_workspace_id: current.startupWorkspaceId,
      execution_id: current.id,
      execution_status: current.status,
      approval_from_status: current.approval.status,
      approval_to_status: args.toStatus,
      changed_by_user_id: args.changedByUserId ?? null,
    },
    'info'
  );

  return fromRow(updated);
}

export async function persistStartupAuditExecutionRepoReview(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly repoReview: unknown;
  readonly changedByUserId?: string | null;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<{
  readonly execution: StartupAuditExecutionRecord;
  readonly repoReview: StartupOrchestratorRepoReviewOutput;
}> {
  const repoReview = parseStartupOrchestratorRepoReviewOutput(args.repoReview);

  const { data: existing, error: existingError } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Startup audit execution not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }

  const nextMetadata: Record<string, unknown> = {
    ...(current.metadata ?? {}),
    ...(args.metadata ?? {}),
    repo_review_artifact: repoReview,
    repo_review_contract_version: STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION,
  };

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_audit_executions')
    .update({
      metadata: nextMetadata,
      summary: current.summary ?? repoReview.summary,
    })
    .eq('id', args.executionId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Could not persist startup audit repo review artifact.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: current.startupWorkspaceId,
    execution_id: current.id,
    from_status: current.status,
    to_status: current.status,
    changed_by_user_id: args.changedByUserId ?? null,
    note: args.note ?? 'Persisted startup audit repo review artifact',
    metadata: {
      ...(args.metadata ?? {}),
      repo_review_contract_version: STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION,
      touched_area_count: repoReview.touchedAreas.length,
      likely_file_count: repoReview.likelyFiles.length,
    },
  });

  structuredLog(
    'startup_audit_repo_review_persisted',
    {
      startup_workspace_id: current.startupWorkspaceId,
      execution_id: current.id,
      status: current.status,
      changed_by_user_id: args.changedByUserId ?? null,
      repo_review_contract_version: STARTUP_ORCHESTRATOR_REPO_REVIEW_CONTRACT_VERSION,
      touched_area_count: repoReview.touchedAreas.length,
      likely_file_count: repoReview.likelyFiles.length,
      recommended_lane_count: repoReview.recommendedLanes.length,
    },
    'info'
  );

  return {
    execution: fromRow(updated),
    repoReview,
  };
}

export async function persistStartupAuditExecutionDbReview(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly dbReview: unknown;
  readonly changedByUserId?: string | null;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<{
  readonly execution: StartupAuditExecutionRecord;
  readonly dbReview: StartupOrchestratorDbReviewOutput;
}> {
  const dbReview = parseStartupOrchestratorDbReviewOutput(args.dbReview);

  const { data: existing, error: existingError } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Startup audit execution not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }

  const nextMetadata: Record<string, unknown> = {
    ...(current.metadata ?? {}),
    ...(args.metadata ?? {}),
    db_review_artifact: dbReview,
    db_review_contract_version: STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION,
  };

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_audit_executions')
    .update({
      metadata: nextMetadata,
      summary: current.summary ?? dbReview.summary,
    })
    .eq('id', args.executionId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Could not persist startup audit DB review artifact.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: current.startupWorkspaceId,
    execution_id: current.id,
    from_status: current.status,
    to_status: current.status,
    changed_by_user_id: args.changedByUserId ?? null,
    note: args.note ?? 'Persisted startup audit DB review artifact',
    metadata: {
      ...(args.metadata ?? {}),
      db_review_contract_version: STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION,
      migration_required: dbReview.migrationRequired,
      backfill_required: dbReview.backfillRequired,
      affected_table_count: dbReview.affectedTables.length,
    },
  });

  structuredLog(
    'startup_audit_db_review_persisted',
    {
      startup_workspace_id: current.startupWorkspaceId,
      execution_id: current.id,
      status: current.status,
      changed_by_user_id: args.changedByUserId ?? null,
      db_review_contract_version: STARTUP_ORCHESTRATOR_DB_REVIEW_CONTRACT_VERSION,
      migration_required: dbReview.migrationRequired,
      backfill_required: dbReview.backfillRequired,
      affected_table_count: dbReview.affectedTables.length,
      manual_action_count: dbReview.manualActions.length,
    },
    'info'
  );

  return {
    execution: fromRow(updated),
    dbReview,
  };
}

export async function persistStartupAuditExecutionRiskReview(args: {
  readonly supabase: SupabaseLike;
  readonly executionId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly riskReview: unknown;
  readonly changedByUserId?: string | null;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<{
  readonly execution: StartupAuditExecutionRecord;
  readonly riskReview: StartupOrchestratorRiskReviewOutput;
}> {
  const riskReview = parseStartupOrchestratorRiskReviewOutput(args.riskReview);

  const { data: existing, error: existingError } = await args.supabase
    .from('startup_audit_executions')
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .eq('id', args.executionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Startup audit execution not found.');

  const current = fromRow(existing as Parameters<typeof fromRow>[0]);
  if (args.expectedWorkspaceId && current.startupWorkspaceId !== args.expectedWorkspaceId) {
    throw new Error('Startup audit execution is outside the expected workspace.');
  }

  const nextMetadata: Record<string, unknown> = {
    ...(current.metadata ?? {}),
    ...(args.metadata ?? {}),
    risk_review_artifact: riskReview,
    risk_review_contract_version: STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION,
  };

  const { data: updatedRows, error: updateError } = await args.supabase
    .from('startup_audit_executions')
    .update({
      metadata: nextMetadata,
      summary: current.summary ?? riskReview.summary,
    })
    .eq('id', args.executionId)
    .select(
      [
        'id',
        'startup_workspace_id',
        'scan_id',
        'report_id',
        'source_kind',
        'source_ref',
        'status',
        'summary',
        'error_message',
        'created_by_user_id',
        'completed_at',
        'metadata',
        'created_at',
        'updated_at',
      ].join(',')
    )
    .limit(1);
  if (updateError) throw updateError;
  const updated = (updatedRows?.[0] ?? null) as Parameters<typeof fromRow>[0] | null;
  if (!updated) throw new Error('Could not persist startup audit risk review artifact.');

  await args.supabase.from('startup_audit_execution_events').insert({
    startup_workspace_id: current.startupWorkspaceId,
    execution_id: current.id,
    from_status: current.status,
    to_status: current.status,
    changed_by_user_id: args.changedByUserId ?? null,
    note: args.note ?? 'Persisted startup audit risk review artifact',
    metadata: {
      ...(args.metadata ?? {}),
      risk_review_contract_version: STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION,
      release_risk: riskReview.releaseRisk,
      blocker_count: riskReview.blockers.length,
      manual_check_count: riskReview.manualChecks.length,
    },
  });

  structuredLog(
    'startup_audit_risk_review_persisted',
    {
      startup_workspace_id: current.startupWorkspaceId,
      execution_id: current.id,
      status: current.status,
      changed_by_user_id: args.changedByUserId ?? null,
      risk_review_contract_version: STARTUP_ORCHESTRATOR_RISK_REVIEW_CONTRACT_VERSION,
      release_risk: riskReview.releaseRisk,
      blocker_count: riskReview.blockers.length,
      regression_area_count: riskReview.regressionAreas.length,
      external_dependency_count: riskReview.externalDependencies.length,
    },
    'info'
  );

  return {
    execution: fromRow(updated),
    riskReview,
  };
}
