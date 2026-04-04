import { resolveStartupServiceModelPolicy } from './startup-model-policy';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupImplementationTeamLane = 'founder' | 'dev' | 'content' | 'ops' | 'cross_functional';
export type StartupImplementationTaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type ParsedImplementationTask = {
  readonly teamLane: StartupImplementationTeamLane;
  readonly title: string;
  readonly detail: string | null;
  readonly priority: StartupImplementationTaskPriority;
  readonly confidence: number | null;
  readonly evidence: Record<string, unknown>;
};

export type StartupImplementationPlanTask = ParsedImplementationTask & {
  readonly id: string;
  readonly recommendationId: string | null;
  readonly status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed';
  readonly sortOrder: number;
  readonly createdAt: string;
};

export type StartupImplementationPlanRecord = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly scanId: string | null;
  readonly reportId: string | null;
  readonly sourceKind: 'markdown_audit' | 'manual' | 'agent';
  readonly sourceRef: string | null;
  readonly status: 'draft' | 'ready' | 'archived';
  readonly summary: string | null;
  readonly createdAt: string;
  readonly tasks: StartupImplementationPlanTask[];
};

export type StartupImplementationLaneCard = {
  readonly lane: StartupImplementationTeamLane;
  readonly total: number;
  readonly open: number;
  readonly done: number;
  readonly topTasks: StartupImplementationPlanTask[];
};

function clampConfidence(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function parseLane(raw: string): StartupImplementationTeamLane {
  const value = raw.trim().toLowerCase();
  if (value.includes('founder')) return 'founder';
  if (value.includes('content')) return 'content';
  if (value.includes('ops') || value.includes('operation')) return 'ops';
  if (value.includes('cross') || value.includes('shared')) return 'cross_functional';
  return 'dev';
}

function parsePriority(raw: string): StartupImplementationTaskPriority {
  const value = raw.trim().toLowerCase();
  if (value.includes('critical') || value === 'p0') return 'critical';
  if (value.includes('high') || value === 'p1') return 'high';
  if (value.includes('low') || value === 'p3') return 'low';
  return 'medium';
}

function parseInlineConfidence(raw: string): number | null {
  const decimal = raw.match(/confidence\s*[:=]\s*(0(?:\.\d+)?|1(?:\.0+)?)/i);
  if (decimal?.[1]) return clampConfidence(Number(decimal[1]));
  const percent = raw.match(/confidence\s*[:=]\s*(\d{1,3})\s*%/i);
  if (percent?.[1]) return clampConfidence(Number(percent[1]) / 100);
  return null;
}

function stripInlineTokens(raw: string): string {
  return raw
    .replace(/\[(founder|dev|content|ops|cross[_ -]?functional)\]/gi, '')
    .replace(/\[(critical|high|medium|low|p0|p1|p2|p3)\]/gi, '')
    .replace(/\bconfidence\s*[:=]\s*(0(?:\.\d+)?|1(?:\.0+)?|\d{1,3}%)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadingLane(line: string): StartupImplementationTeamLane | null {
  const heading = line.trim().replace(/^#+\s*/, '');
  if (!heading) return null;
  if (/(^|[^a-z])founder([^a-z]|$)/i.test(heading)) return 'founder';
  if (/(^|[^a-z])dev(eloper|elopment)?([^a-z]|$)/i.test(heading)) return 'dev';
  if (/(^|[^a-z])content([^a-z]|$)/i.test(heading)) return 'content';
  if (/(^|[^a-z])ops?|operations([^a-z]|$)/i.test(heading)) return 'ops';
  if (/(^|[^a-z])cross([^a-z]|$)/i.test(heading)) return 'cross_functional';
  return null;
}

export function parseMarkdownAuditImplementationTasks(markdown: string): ParsedImplementationTask[] {
  const lines = markdown.split(/\r?\n/);
  let activeLane: StartupImplementationTeamLane = 'dev';
  const tasks: ParsedImplementationTask[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const headingLane = extractHeadingLane(line);
      if (headingLane) activeLane = headingLane;
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/) ?? line.match(/^\d+\.\s+(.+)$/);
    if (!bulletMatch?.[1]) continue;
    const content = bulletMatch[1].trim();
    const laneToken = content.match(/\[(founder|dev|content|ops|cross[_ -]?functional)\]/i)?.[1] ?? null;
    const priorityToken = content.match(/\[(critical|high|medium|low|p0|p1|p2|p3)\]/i)?.[1] ?? null;
    const confidence = parseInlineConfidence(content);
    const cleaned = stripInlineTokens(content);
    const [titlePart, detailPart] = cleaned.split(/\s[-:]\s/, 2);
    const title = (titlePart ?? '').trim();
    if (!title) continue;

    tasks.push({
      teamLane: laneToken ? parseLane(laneToken) : activeLane,
      priority: priorityToken ? parsePriority(priorityToken) : 'medium',
      confidence,
      title,
      detail: detailPart?.trim() || null,
      evidence: { source: 'markdown_audit' },
    });
  }

  return tasks;
}

export async function createStartupImplementationPlanFromMarkdownAudit(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly markdownAuditRef: string;
  readonly markdown: string;
  readonly scanId?: string | null;
  readonly reportId?: string | null;
  readonly createdByUserId?: string | null;
  readonly summary?: string | null;
}): Promise<{ readonly planId: string; readonly taskCount: number }> {
  const parsedTasks = parseMarkdownAuditImplementationTasks(args.markdown);
  let modelPolicyMetadata: Record<string, unknown> | null = null;
  try {
    const policy = await resolveStartupServiceModelPolicy({
      supabase: args.supabase,
      startupWorkspaceId: args.startupWorkspaceId,
      serviceKey: 'markdown_plan_generator',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-2.0-flash',
      supportedProviders: ['gemini', 'openai', 'anthropic', 'custom'],
      estimatedCostUsd: null,
    });
    modelPolicyMetadata = {
      source: policy.source,
      bundle_key: policy.bundleKey,
      requested_provider: policy.requestedProvider,
      requested_model: policy.requestedModel,
      effective_provider: policy.effectiveProvider,
      effective_model: policy.effectiveModel,
      max_cost_usd: policy.maxCostUsd,
      budget_exceeded: policy.budgetExceeded,
      fallback_reason: policy.fallbackReason,
    };
  } catch {
    modelPolicyMetadata = null;
  }

  const { data: planRows, error: planError } = await args.supabase
    .from('startup_implementation_plans')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      scan_id: args.scanId ?? null,
      report_id: args.reportId ?? null,
      source_kind: 'markdown_audit',
      source_ref: args.markdownAuditRef,
      status: 'ready',
      summary: args.summary ?? null,
      created_by_user_id: args.createdByUserId ?? null,
      metadata: {
        generated_by: 'sd008_markdown_plan_generator_v1',
        model_policy: modelPolicyMetadata,
      },
    })
    .select('id')
    .limit(1);

  if (planError) throw planError;
  const planId = (planRows?.[0] as { id: string } | undefined)?.id;
  if (!planId) throw new Error('Could not create startup implementation plan.');

  if (parsedTasks.length === 0) {
    structuredLog(
      'startup_implementation_plan_created',
      {
        startup_workspace_id: args.startupWorkspaceId,
        plan_id: planId,
        created_by_user_id: args.createdByUserId ?? null,
        task_count: 0,
        source_ref: args.markdownAuditRef,
        model_policy_source: (modelPolicyMetadata?.['source'] as string | null) ?? null,
        model_policy_effective_provider:
          (modelPolicyMetadata?.['effective_provider'] as string | null) ?? null,
        model_policy_effective_model:
          (modelPolicyMetadata?.['effective_model'] as string | null) ?? null,
        model_policy_fallback_reason:
          (modelPolicyMetadata?.['fallback_reason'] as string | null) ?? null,
      },
      'info'
    );
    return { planId, taskCount: 0 };
  }

  const taskRows = parsedTasks.map((task, index) => ({
    startup_workspace_id: args.startupWorkspaceId,
    plan_id: planId,
    recommendation_id: null,
    team_lane: task.teamLane,
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    confidence: task.confidence,
    evidence: task.evidence,
    status: 'todo',
    sort_order: index,
    metadata: { source_ref: args.markdownAuditRef },
  }));

  const { error: taskError } = await args.supabase.from('startup_implementation_plan_tasks').insert(taskRows);
  if (taskError) throw taskError;

  structuredLog(
    'startup_implementation_plan_created',
    {
      startup_workspace_id: args.startupWorkspaceId,
      plan_id: planId,
      created_by_user_id: args.createdByUserId ?? null,
      task_count: taskRows.length,
      source_ref: args.markdownAuditRef,
      model_policy_source: (modelPolicyMetadata?.['source'] as string | null) ?? null,
      model_policy_effective_provider:
        (modelPolicyMetadata?.['effective_provider'] as string | null) ?? null,
      model_policy_effective_model:
        (modelPolicyMetadata?.['effective_model'] as string | null) ?? null,
      model_policy_fallback_reason:
        (modelPolicyMetadata?.['fallback_reason'] as string | null) ?? null,
    },
    'info'
  );

  return { planId, taskCount: taskRows.length };
}

export async function getLatestStartupImplementationPlan(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupImplementationPlanRecord | null> {
  const { data: planRow, error: planError } = await args.supabase
    .from('startup_implementation_plans')
    .select('id,startup_workspace_id,scan_id,report_id,source_kind,source_ref,status,summary,created_at')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) throw planError;
  if (!planRow?.id) return null;

  const { data: taskRows, error: taskError } = await args.supabase
    .from('startup_implementation_plan_tasks')
    .select('id,recommendation_id,team_lane,title,detail,priority,confidence,evidence,status,sort_order,created_at')
    .eq('plan_id', planRow.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (taskError) throw taskError;

  return {
    id: planRow.id,
    startupWorkspaceId: planRow.startup_workspace_id,
    scanId: planRow.scan_id,
    reportId: planRow.report_id,
    sourceKind: planRow.source_kind,
    sourceRef: planRow.source_ref,
    status: planRow.status,
    summary: planRow.summary,
    createdAt: planRow.created_at,
    tasks: ((taskRows ?? []) as Array<{
      id: string;
      recommendation_id: string | null;
      team_lane: StartupImplementationTeamLane;
      title: string;
      detail: string | null;
      priority: StartupImplementationTaskPriority;
      confidence: number | null;
      evidence: Record<string, unknown> | null;
      status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed';
      sort_order: number;
      created_at: string;
    }>).map((task) => ({
      id: task.id,
      recommendationId: task.recommendation_id,
      teamLane: task.team_lane,
      title: task.title,
      detail: task.detail,
      priority: task.priority,
      confidence: task.confidence,
      evidence: task.evidence ?? {},
      status: task.status,
      sortOrder: task.sort_order,
      createdAt: task.created_at,
    })),
  };
}

export function buildStartupImplementationLaneCards(
  plan: StartupImplementationPlanRecord | null
): StartupImplementationLaneCard[] {
  const lanes: StartupImplementationTeamLane[] = ['founder', 'dev', 'content', 'ops'];
  return lanes.map((lane) => {
    const laneTasks = (plan?.tasks ?? []).filter((task) => task.teamLane === lane);
    const done = laneTasks.filter((task) => task.status === 'done').length;
    const open = laneTasks.filter((task) => task.status !== 'done' && task.status !== 'failed').length;
    return {
      lane,
      total: laneTasks.length,
      open,
      done,
      topTasks: laneTasks.filter((task) => task.status !== 'done').slice(0, 3),
    };
  });
}
