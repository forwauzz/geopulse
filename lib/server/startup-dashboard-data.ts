import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupWorkspaceSummary = {
  readonly id: string;
  readonly workspaceKey: string;
  readonly name: string;
  readonly canonicalDomain: string | null;
  readonly role: string;
  readonly status: string;
};

export type StartupWorkspaceScan = {
  readonly id: string;
  readonly startupWorkspaceId: string | null;
  readonly url: string;
  readonly domain: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly createdAt: string;
  readonly runSource: string;
};

export type StartupWorkspaceReport = {
  readonly id: string;
  readonly scanId: string | null;
  readonly startupWorkspaceId: string | null;
  readonly type: string;
  readonly emailDeliveredAt: string | null;
  readonly pdfGeneratedAt: string | null;
  readonly pdfUrl: string | null;
  readonly createdAt: string;
};

export type StartupWorkspaceRecommendation = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly scanId: string | null;
  readonly reportId: string | null;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly teamLane: 'founder' | 'dev' | 'content' | 'ops' | 'cross_functional';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly status: 'suggested' | 'approved' | 'in_progress' | 'shipped' | 'validated' | 'failed';
  readonly statusChangedAt: string;
  readonly statusReason: string | null;
  readonly statusUpdatedByUserId: string | null;
  readonly createdAt: string;
};

export type StartupWorkspaceAuditExecution = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly scanId: string | null;
  readonly reportId: string | null;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef: string | null;
  readonly status:
    | 'received'
    | 'planning'
    | 'plan_ready'
    | 'executing'
    | 'waiting_manual'
    | 'completed'
    | 'failed'
    | 'cancelled';
  readonly summary: string | null;
  readonly errorMessage: string | null;
  readonly approvalStatus:
    | 'draft'
    | 'ready_for_review'
    | 'approved_for_execution'
    | 'rejected';
  readonly approvalRequestedAt: string | null;
  readonly approvalApprovedAt: string | null;
  readonly approvalRejectedAt: string | null;
  readonly approvalRejectionReason: string | null;
  readonly planId: string | null;
  readonly planTaskCount: number | null;
  readonly manualWaitTaskId: string | null;
  readonly manualWaitReason: string | null;
  readonly plannerModel: string | null;
  readonly repoReviewModel: string | null;
  readonly dbReviewModel: string | null;
  readonly riskReviewModel: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type StartupDashboardData = {
  readonly workspaces: StartupWorkspaceSummary[];
  readonly selectedWorkspaceId: string | null;
  readonly scans: StartupWorkspaceScan[];
  readonly reports: StartupWorkspaceReport[];
  readonly recommendations: StartupWorkspaceRecommendation[];
  readonly executions: StartupWorkspaceAuditExecution[];
};

function parseStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseModelName(
  metadata: Record<string, unknown> | null,
  role: 'planner' | 'repoReview' | 'dbReview' | 'riskReview'
): string | null {
  const policies = metadata?.['planning_model_policies'];
  if (!policies || typeof policies !== 'object') return null;
  const policy = (policies as Record<string, unknown>)[role];
  if (!policy || typeof policy !== 'object') return null;
  return parseStringOrNull((policy as Record<string, unknown>)['effectiveModel']);
}

function parseStartupExecutionApprovalStatus(args: {
  readonly executionStatus: StartupWorkspaceAuditExecution['status'];
  readonly metadata: Record<string, unknown> | null;
}): StartupWorkspaceAuditExecution['approvalStatus'] {
  const raw = args.metadata?.['approval_status'];
  if (
    raw === 'draft' ||
    raw === 'ready_for_review' ||
    raw === 'approved_for_execution' ||
    raw === 'rejected'
  ) {
    return raw;
  }
  if (args.executionStatus === 'plan_ready') return 'ready_for_review';
  if (
    args.executionStatus === 'executing' ||
    args.executionStatus === 'waiting_manual' ||
    args.executionStatus === 'completed'
  ) {
    return 'approved_for_execution';
  }
  return 'draft';
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim().length > 0 ? code : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return String(error ?? 'unknown_error');
}

function isMissingOptionalStartupFeatureError(error: unknown, table: string): boolean {
  const code = readErrorCode(error);
  if (code === '42P01' || code === '42703') return true;
  const message = readErrorMessage(error).toLowerCase();
  return message.includes(table.toLowerCase()) && (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('column') ||
    message.includes('relation')
  );
}

export async function getStartupDashboardData(args: {
  readonly supabase: SupabaseLike;
  readonly userId: string;
  readonly selectedWorkspaceId?: string | null;
}): Promise<StartupDashboardData> {
  const { supabase, userId } = args;

  const { data: memberships, error: membershipError } = await supabase
    .from('startup_workspace_users')
    .select('startup_workspace_id,role,status')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (membershipError) throw membershipError;

  const membershipRows = (memberships ?? []) as Array<{
    startup_workspace_id: string;
    role: string;
    status: string;
  }>;

  const workspaceIds = Array.from(new Set(membershipRows.map((row) => row.startup_workspace_id)));
  if (workspaceIds.length === 0) {
    return {
      workspaces: [],
      selectedWorkspaceId: null,
      scans: [],
      reports: [],
      recommendations: [],
      executions: [],
    };
  }

  const { data: workspaces, error: workspacesError } = await supabase
    .from('startup_workspaces')
    .select('id,workspace_key,name,canonical_domain')
    .in('id', workspaceIds)
    .order('created_at', { ascending: true });
  if (workspacesError) throw workspacesError;

  const workspaceRows = (workspaces ?? []) as Array<{
    id: string;
    workspace_key: string;
    name: string;
    canonical_domain: string | null;
  }>;

  const roleByWorkspaceId = new Map(
    membershipRows.map((row) => [row.startup_workspace_id, { role: row.role, status: row.status }])
  );

  const selectedWorkspaceId =
    args.selectedWorkspaceId && workspaceIds.includes(args.selectedWorkspaceId)
      ? args.selectedWorkspaceId
      : workspaceRows[0]?.id ?? null;

  if (!selectedWorkspaceId) {
    return {
      workspaces: [],
      selectedWorkspaceId: null,
      scans: [],
      reports: [],
      recommendations: [],
      executions: [],
    };
  }

  const [
    { data: scans, error: scansError },
    { data: reports, error: reportsError },
    { data: recommendations, error: recommendationsError },
    { data: executions, error: executionsError },
  ] = await Promise.all([
    supabase
      .from('scans')
      .select('id,startup_workspace_id,url,domain,score,letter_grade,created_at,run_source')
      .eq('startup_workspace_id', selectedWorkspaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('reports')
      .select('id,scan_id,startup_workspace_id,type,email_delivered_at,pdf_generated_at,pdf_url,created_at')
      .eq('startup_workspace_id', selectedWorkspaceId)
      .order('created_at', { ascending: false }),
    supabase
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
          'created_at',
        ].join(',')
      )
      .eq('startup_workspace_id', selectedWorkspaceId)
      .order('created_at', { ascending: false }),
    supabase
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
          'metadata',
          'completed_at',
          'created_at',
          'updated_at',
        ].join(',')
      )
      .eq('startup_workspace_id', selectedWorkspaceId)
      .order('created_at', { ascending: false }),
  ]);

  if (scansError || reportsError) {
    throw scansError ?? reportsError;
  }

  const optionalRecommendationsError =
    recommendationsError && isMissingOptionalStartupFeatureError(recommendationsError, 'startup_recommendations')
      ? recommendationsError
      : null;
  const optionalExecutionsError =
    executionsError && isMissingOptionalStartupFeatureError(executionsError, 'startup_audit_executions')
      ? executionsError
      : null;

  if (recommendationsError && !optionalRecommendationsError) {
    throw recommendationsError;
  }
  if (executionsError && !optionalExecutionsError) {
    throw executionsError;
  }

  if (optionalRecommendationsError) {
    structuredLog(
      'startup_dashboard_optional_table_unavailable',
      {
        startup_workspace_id: selectedWorkspaceId,
        table: 'startup_recommendations',
        code: readErrorCode(optionalRecommendationsError),
        message: readErrorMessage(optionalRecommendationsError),
      },
      'warning'
    );
  }
  if (optionalExecutionsError) {
    structuredLog(
      'startup_dashboard_optional_table_unavailable',
      {
        startup_workspace_id: selectedWorkspaceId,
        table: 'startup_audit_executions',
        code: readErrorCode(optionalExecutionsError),
        message: readErrorMessage(optionalExecutionsError),
      },
      'warning'
    );
  }

  return {
    workspaces: workspaceRows.map((workspace) => ({
      id: workspace.id,
      workspaceKey: workspace.workspace_key,
      name: workspace.name,
      canonicalDomain: workspace.canonical_domain,
      role: roleByWorkspaceId.get(workspace.id)?.role ?? 'member',
      status: roleByWorkspaceId.get(workspace.id)?.status ?? 'active',
    })),
    selectedWorkspaceId,
    scans: ((scans ?? []) as Array<{
      id: string;
      startup_workspace_id: string | null;
      url: string;
      domain: string;
      score: number | null;
      letter_grade: string | null;
      created_at: string;
      run_source: string | null;
    }>).map((row) => ({
      id: row.id,
      startupWorkspaceId: row.startup_workspace_id,
      url: row.url,
      domain: row.domain,
      score: row.score,
      letterGrade: row.letter_grade,
      createdAt: row.created_at,
      runSource: row.run_source ?? 'public_self_serve',
    })),
    reports: ((reports ?? []) as Array<{
      id: string;
      scan_id: string | null;
      startup_workspace_id: string | null;
      type: string;
      email_delivered_at: string | null;
      pdf_generated_at: string | null;
      pdf_url: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      scanId: row.scan_id,
      startupWorkspaceId: row.startup_workspace_id,
      type: row.type,
      emailDeliveredAt: row.email_delivered_at,
      pdfGeneratedAt: row.pdf_generated_at,
      pdfUrl: row.pdf_url,
      createdAt: row.created_at,
    })),
    recommendations: (((optionalRecommendationsError ? [] : recommendations) ?? []) as Array<{
      id: string;
      startup_workspace_id: string;
      scan_id: string | null;
      report_id: string | null;
      source_kind: 'markdown_audit' | 'manual' | 'agent';
      source_ref: string | null;
      title: string;
      summary: string | null;
      team_lane: 'founder' | 'dev' | 'content' | 'ops' | 'cross_functional';
      priority: 'low' | 'medium' | 'high' | 'critical';
      status: 'suggested' | 'approved' | 'in_progress' | 'shipped' | 'validated' | 'failed';
      status_changed_at: string;
      status_reason: string | null;
      status_updated_by_user_id: string | null;
      created_at: string;
    }>).map((row) => ({
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
      createdAt: row.created_at,
    })),
    executions: (((optionalExecutionsError ? [] : executions) ?? []) as Array<{
      id: string;
      startup_workspace_id: string;
      scan_id: string | null;
      report_id: string | null;
      source_kind: 'markdown_audit' | 'manual' | 'agent';
      source_ref: string | null;
      status:
        | 'received'
        | 'planning'
        | 'plan_ready'
        | 'executing'
        | 'waiting_manual'
        | 'completed'
        | 'failed'
        | 'cancelled';
      summary: string | null;
      error_message: string | null;
      metadata: Record<string, unknown> | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    }>).map((row) => ({
      id: row.id,
      startupWorkspaceId: row.startup_workspace_id,
      scanId: row.scan_id,
      reportId: row.report_id,
      sourceKind: row.source_kind,
      sourceRef: row.source_ref,
      status: row.status,
      summary: row.summary,
      errorMessage: row.error_message,
      approvalStatus: parseStartupExecutionApprovalStatus({
        executionStatus: row.status,
        metadata: row.metadata,
      }),
      approvalRequestedAt: parseStringOrNull(row.metadata?.['approval_requested_at']),
      approvalApprovedAt: parseStringOrNull(row.metadata?.['approval_approved_at']),
      approvalRejectedAt: parseStringOrNull(row.metadata?.['approval_rejected_at']),
      approvalRejectionReason: parseStringOrNull(row.metadata?.['approval_rejection_reason']),
      planId: parseStringOrNull(row.metadata?.['plan_id']),
      planTaskCount: parseNumberOrNull(row.metadata?.['plan_task_count']),
      manualWaitTaskId: parseStringOrNull(row.metadata?.['manual_wait_task_id']),
      manualWaitReason: parseStringOrNull(row.metadata?.['manual_wait_reason']),
      plannerModel: parseModelName(row.metadata, 'planner'),
      repoReviewModel: parseModelName(row.metadata, 'repoReview'),
      dbReviewModel: parseModelName(row.metadata, 'dbReview'),
      riskReviewModel: parseModelName(row.metadata, 'riskReview'),
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
