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

export type StartupDashboardData = {
  readonly workspaces: StartupWorkspaceSummary[];
  readonly selectedWorkspaceId: string | null;
  readonly scans: StartupWorkspaceScan[];
  readonly reports: StartupWorkspaceReport[];
  readonly recommendations: StartupWorkspaceRecommendation[];
};

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
    };
  }

  const [
    { data: scans, error: scansError },
    { data: reports, error: reportsError },
    { data: recommendations, error: recommendationsError },
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
  ]);

  if (scansError || reportsError || recommendationsError) {
    throw scansError ?? reportsError ?? recommendationsError;
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
    recommendations: ((recommendations ?? []) as Array<{
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
  };
}
