import { resolveStartupServiceModelPolicy } from './startup-model-policy';
import {
  parseStartupOrchestratorPlannerOutput,
  STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION,
  type StartupOrchestratorPlannerOutput,
} from './startup-orchestrator-plan-contract';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupImplementationTeamLane = 'founder' | 'dev' | 'content' | 'ops' | 'cross_functional';
export type StartupImplementationTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type StartupImplementationTaskKind =
  | 'implementation'
  | 'review'
  | 'manual_action'
  | 'approval'
  | 'verification';
export type StartupImplementationTaskExecutionMode = 'auto' | 'manual' | 'approval_required';
export type StartupImplementationTaskAgentRole =
  | 'orchestrator'
  | 'repo_review'
  | 'db_review'
  | 'risk_review'
  | 'execution_worker'
  | 'manual_operator'
  | 'founder_approval'
  | 'qa_verification';
export type StartupImplementationTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed';

export type ParsedImplementationTask = {
  readonly teamLane: StartupImplementationTeamLane;
  readonly title: string;
  readonly detail: string | null;
  readonly priority: StartupImplementationTaskPriority;
  readonly confidence: number | null;
  readonly evidence: Record<string, unknown>;
  readonly taskKind: StartupImplementationTaskKind;
  readonly executionMode: StartupImplementationTaskExecutionMode;
  readonly dependsOnTaskIds: string[];
  readonly acceptanceCriteria: string[];
  readonly evidenceRequired: string[];
  readonly artifactRefs: string[];
  readonly blockedReason: string | null;
  readonly agentRole: StartupImplementationTaskAgentRole | null;
  readonly manualInstructions: string | null;
};

export type StartupImplementationPlanTask = ParsedImplementationTask & {
  readonly id: string;
  readonly planId: string;
  readonly recommendationId: string | null;
  readonly status: StartupImplementationTaskStatus;
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
  readonly executionId: string | null;
  readonly createdAt: string;
  readonly plannerArtifact: {
    readonly contractVersion: string;
    readonly touchedAreas: string[];
    readonly risks: Array<{
      readonly title: string;
      readonly severity: 'low' | 'medium' | 'high' | 'critical';
      readonly detail: string;
    }>;
    readonly manualActions: Array<{
      readonly title: string;
      readonly instructions: string;
      readonly teamLane: StartupImplementationTeamLane;
      readonly evidenceRequired: string[];
      readonly artifactRefs: string[];
    }>;
  } | null;
  readonly tasks: StartupImplementationPlanTask[];
};

export type StartupImplementationLaneCard = {
  readonly lane: StartupImplementationTeamLane;
  readonly total: number;
  readonly open: number;
  readonly done: number;
  readonly topTasks: StartupImplementationPlanTask[];
};

export const STARTUP_EXECUTION_PR_TASK_BATCH_LIMIT = 3;

type StartupImplementationPlanTaskRecordRow = {
  id: string;
  plan_id: string;
  recommendation_id: string | null;
  team_lane: StartupImplementationTeamLane;
  task_kind: StartupImplementationTaskKind | null;
  title: string;
  detail: string | null;
  priority: StartupImplementationTaskPriority;
  confidence: number | null;
  evidence: Record<string, unknown> | null;
  execution_mode: StartupImplementationTaskExecutionMode | null;
  depends_on_task_ids: string[] | null;
  acceptance_criteria: string[] | null;
  evidence_required: string[] | null;
  artifact_refs: string[] | null;
  status: StartupImplementationTaskStatus;
  sort_order: number;
  blocked_reason: string | null;
  agent_role: StartupImplementationTaskAgentRole | null;
  manual_instructions: string | null;
  created_at: string;
};

const TASK_STATUS_TRANSITIONS: Record<
  StartupImplementationTaskStatus,
  readonly StartupImplementationTaskStatus[]
> = {
  todo: ['in_progress', 'blocked', 'done', 'failed'],
  in_progress: ['todo', 'blocked', 'done', 'failed'],
  blocked: ['todo', 'in_progress', 'done', 'failed'],
  done: [],
  failed: ['todo', 'in_progress', 'blocked'],
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

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseInlineConfidence(raw: string): number | null {
  const decimal = raw.match(/confidence\s*[:=]\s*(0(?:\.\d+)?|1(?:\.0+)?)/i);
  if (decimal?.[1]) return clampConfidence(Number(decimal[1]));
  const percent = raw.match(/confidence\s*[:=]\s*(\d{1,3})\s*%/i);
  if (percent?.[1]) return clampConfidence(Number(percent[1]) / 100);
  return null;
}

function parseExecutionMode(raw: string): StartupImplementationTaskExecutionMode {
  const value = raw.trim().toLowerCase();
  if (value === 'auto') return 'auto';
  if (value === 'manual') return 'manual';
  return 'approval_required';
}

function parseTaskKind(raw: string): StartupImplementationTaskKind {
  const value = raw.trim().toLowerCase();
  if (value === 'review') return 'review';
  if (value === 'manual_action' || value === 'manual-action' || value === 'manual') return 'manual_action';
  if (value === 'approval') return 'approval';
  if (value === 'verification' || value === 'verify') return 'verification';
  return 'implementation';
}

function parseAgentRole(raw: string): StartupImplementationTaskAgentRole | null {
  const value = raw.trim().toLowerCase();
  if (value === 'orchestrator') return 'orchestrator';
  if (value === 'repo_review' || value === 'repo-review') return 'repo_review';
  if (value === 'db_review' || value === 'db-review') return 'db_review';
  if (value === 'risk_review' || value === 'risk-review') return 'risk_review';
  if (value === 'execution_worker' || value === 'execution-worker') return 'execution_worker';
  if (value === 'manual_operator' || value === 'manual-operator') return 'manual_operator';
  if (value === 'founder_approval' || value === 'founder-approval') return 'founder_approval';
  if (value === 'qa_verification' || value === 'qa-verification') return 'qa_verification';
  return null;
}

function parseBracketToken(content: string, key: string): string | null {
  const match = content.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function parsePlanTaskRow(task: StartupImplementationPlanTaskRecordRow): StartupImplementationPlanTask {
  return {
    id: task.id,
    planId: task.plan_id,
    recommendationId: task.recommendation_id,
    teamLane: task.team_lane,
    taskKind: task.task_kind ?? 'implementation',
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    confidence: task.confidence,
    evidence: task.evidence ?? {},
    executionMode: task.execution_mode ?? 'approval_required',
    dependsOnTaskIds: task.depends_on_task_ids ?? [],
    acceptanceCriteria: task.acceptance_criteria ?? [],
    evidenceRequired: task.evidence_required ?? [],
    artifactRefs: task.artifact_refs ?? [],
    blockedReason: task.blocked_reason,
    agentRole: task.agent_role,
    manualInstructions: task.manual_instructions,
    status: task.status,
    sortOrder: task.sort_order,
    createdAt: task.created_at,
  };
}

function stripInlineTokens(raw: string): string {
  return raw
    .replace(/\[(founder|dev|content|ops|cross[_ -]?functional)\]/gi, '')
    .replace(/\[(critical|high|medium|low|p0|p1|p2|p3)\]/gi, '')
    .replace(/\[(mode|task|role|accept|evidence|required|artifacts|manual|blocked):[^\]]+\]/gi, '')
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
    const executionMode = parseExecutionMode(parseBracketToken(content, 'mode') ?? 'approval_required');
    const taskKind = parseTaskKind(parseBracketToken(content, 'task') ?? 'implementation');
    const agentRole = parseAgentRole(parseBracketToken(content, 'role') ?? '');
    const acceptanceCriteria = uniqueStrings((parseBracketToken(content, 'accept') ?? '').split('|'));
    const evidenceRequired = uniqueStrings((parseBracketToken(content, 'evidence') ?? '').split('|'));
    const artifactRefs = uniqueStrings((parseBracketToken(content, 'artifacts') ?? '').split('|'));
    const manualInstructions = parseBracketToken(content, 'manual');
    const blockedReason = parseBracketToken(content, 'blocked');
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
      taskKind,
      executionMode,
      dependsOnTaskIds: [],
      acceptanceCriteria,
      evidenceRequired,
      artifactRefs,
      blockedReason,
      agentRole,
      manualInstructions,
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
    task_kind: task.taskKind,
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    confidence: task.confidence,
    evidence: task.evidence,
    execution_mode: task.executionMode,
    depends_on_task_ids: task.dependsOnTaskIds,
    acceptance_criteria: task.acceptanceCriteria,
    evidence_required: task.evidenceRequired,
    artifact_refs: task.artifactRefs,
    status: 'todo',
    sort_order: index,
    blocked_reason: task.blockedReason,
    agent_role: task.agentRole,
    manual_instructions: task.manualInstructions,
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

export async function createStartupImplementationPlanFromPlannerOutput(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly plannerOutput: unknown;
  readonly sourceRef: string;
  readonly scanId?: string | null;
  readonly reportId?: string | null;
  readonly createdByUserId?: string | null;
  readonly executionId?: string | null;
  readonly plannerModelPolicy?: Record<string, unknown> | null;
}): Promise<{
  readonly planId: string;
  readonly taskCount: number;
  readonly plannerOutput: StartupOrchestratorPlannerOutput;
}> {
  const plannerOutput = parseStartupOrchestratorPlannerOutput(args.plannerOutput);
  const plannerArtifact = {
    contract_version: plannerOutput.contractVersion,
    touched_areas: plannerOutput.touchedAreas,
    risks: plannerOutput.risks,
    manual_actions: plannerOutput.manualActions,
  };

  const { data: planRows, error: planError } = await args.supabase
    .from('startup_implementation_plans')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      scan_id: args.scanId ?? null,
      report_id: args.reportId ?? null,
      source_kind: 'agent',
      source_ref: args.sourceRef,
      status: 'ready',
      summary: plannerOutput.summary,
      created_by_user_id: args.createdByUserId ?? null,
      metadata: {
        generated_by: 'sao006_orchestrator_planner_v1',
        planner_artifact: plannerArtifact,
        execution_id: args.executionId ?? null,
        model_policy: args.plannerModelPolicy ?? null,
      },
    })
    .select('id')
    .limit(1);

  if (planError) throw planError;
  const planId = (planRows?.[0] as { id: string } | undefined)?.id;
  if (!planId) throw new Error('Could not create startup implementation plan from planner output.');

  const taskRows = plannerOutput.tasks.map((task, index) => ({
    startup_workspace_id: args.startupWorkspaceId,
    plan_id: planId,
    recommendation_id: null,
    team_lane: task.teamLane,
    task_kind: task.taskKind,
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    confidence: task.confidence,
    evidence: task.evidence,
    execution_mode: task.executionMode,
    depends_on_task_ids: task.dependsOnTaskIds,
    acceptance_criteria: task.acceptanceCriteria,
    evidence_required: task.evidenceRequired,
    artifact_refs: task.artifactRefs,
    status: 'todo',
    sort_order: index,
    blocked_reason: task.blockedReason,
    agent_role: task.agentRole,
    manual_instructions: task.manualInstructions,
    metadata: {
      source_ref: args.sourceRef,
      planner_contract_version: STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION,
    },
  }));

  const { error: taskError } = await args.supabase.from('startup_implementation_plan_tasks').insert(taskRows);
  if (taskError) throw taskError;

  structuredLog(
    'startup_orchestrator_plan_created',
    {
      startup_workspace_id: args.startupWorkspaceId,
      plan_id: planId,
      execution_id: args.executionId ?? null,
      created_by_user_id: args.createdByUserId ?? null,
      task_count: taskRows.length,
      source_ref: args.sourceRef,
      planner_contract_version: STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION,
      planner_touched_area_count: plannerOutput.touchedAreas.length,
      planner_risk_count: plannerOutput.risks.length,
      planner_manual_action_count: plannerOutput.manualActions.length,
      planner_model_policy_effective_provider:
        (args.plannerModelPolicy?.['effective_provider'] as string | null) ?? null,
      planner_model_policy_effective_model:
        (args.plannerModelPolicy?.['effective_model'] as string | null) ?? null,
    },
    'info'
  );

  return { planId, taskCount: taskRows.length, plannerOutput };
}

export async function getLatestStartupImplementationPlan(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupImplementationPlanRecord | null> {
  const { data: planRow, error: planError } = await args.supabase
    .from('startup_implementation_plans')
    .select('id,startup_workspace_id,scan_id,report_id,source_kind,source_ref,status,summary,metadata,created_at')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) throw planError;
  if (!planRow?.id) return null;

  const { data: taskRows, error: taskError } = await args.supabase
    .from('startup_implementation_plan_tasks')
    .select(
      [
        'id',
        'recommendation_id',
        'team_lane',
        'task_kind',
        'title',
        'detail',
        'priority',
        'confidence',
        'evidence',
        'execution_mode',
        'depends_on_task_ids',
        'acceptance_criteria',
        'evidence_required',
        'artifact_refs',
        'status',
        'sort_order',
        'blocked_reason',
        'agent_role',
        'manual_instructions',
        'created_at',
      ].join(',')
    )
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
    executionId:
      typeof (planRow.metadata as Record<string, unknown> | null)?.['execution_id'] === 'string'
        ? ((planRow.metadata as Record<string, unknown>)['execution_id'] as string)
        : null,
    createdAt: planRow.created_at,
    plannerArtifact: (() => {
      const artifact = (planRow.metadata as Record<string, unknown> | null)?.['planner_artifact'] as
        | Record<string, unknown>
        | undefined;
      if (!artifact) return null;
      return {
        contractVersion:
          typeof artifact['contract_version'] === 'string'
            ? artifact['contract_version']
            : STARTUP_ORCHESTRATOR_PLAN_CONTRACT_VERSION,
        touchedAreas: Array.isArray(artifact['touched_areas'])
          ? artifact['touched_areas'].filter((value): value is string => typeof value === 'string')
          : [],
        risks: Array.isArray(artifact['risks'])
          ? artifact['risks']
              .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
              .map((value) => ({
                title: typeof value['title'] === 'string' ? value['title'] : '',
                severity: (
                  value['severity'] === 'low' ||
                  value['severity'] === 'medium' ||
                  value['severity'] === 'high' ||
                  value['severity'] === 'critical'
                    ? value['severity']
                    : 'medium'
                ) as 'low' | 'medium' | 'high' | 'critical',
                detail: typeof value['detail'] === 'string' ? value['detail'] : '',
              }))
              .filter((value) => value.title.length > 0 && value.detail.length > 0)
          : [],
        manualActions: Array.isArray(artifact['manual_actions'])
          ? artifact['manual_actions']
              .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
              .map((value) => ({
                title: typeof value['title'] === 'string' ? value['title'] : '',
                instructions: typeof value['instructions'] === 'string' ? value['instructions'] : '',
                teamLane: (
                  value['teamLane'] === 'founder' ||
                  value['teamLane'] === 'dev' ||
                  value['teamLane'] === 'content' ||
                  value['teamLane'] === 'ops' ||
                  value['teamLane'] === 'cross_functional'
                    ? value['teamLane']
                    : 'ops'
                ) as StartupImplementationTeamLane,
                evidenceRequired: Array.isArray(value['evidenceRequired'])
                  ? value['evidenceRequired'].filter((item): item is string => typeof item === 'string')
                  : [],
                artifactRefs: Array.isArray(value['artifactRefs'])
                  ? value['artifactRefs'].filter((item): item is string => typeof item === 'string')
                  : [],
              }))
              .filter((value) => value.title.length > 0 && value.instructions.length > 0)
          : [],
      };
    })(),
    tasks: ((taskRows ?? []) as StartupImplementationPlanTaskRecordRow[]).map(parsePlanTaskRow),
  };
}

export function canTransitionStartupImplementationTaskStatus(args: {
  readonly from: StartupImplementationTaskStatus;
  readonly to: StartupImplementationTaskStatus;
}): boolean {
  if (args.from === args.to) return true;
  return TASK_STATUS_TRANSITIONS[args.from].includes(args.to);
}

export async function listStartupImplementationPlanTasks(args: {
  readonly supabase: SupabaseLike;
  readonly planId: string;
}): Promise<StartupImplementationPlanTask[]> {
  const { data, error } = await args.supabase
    .from('startup_implementation_plan_tasks')
    .select(
      [
        'id',
        'plan_id',
        'recommendation_id',
        'team_lane',
        'task_kind',
        'title',
        'detail',
        'priority',
        'confidence',
        'evidence',
        'execution_mode',
        'depends_on_task_ids',
        'acceptance_criteria',
        'evidence_required',
        'artifact_refs',
        'status',
        'sort_order',
        'blocked_reason',
        'agent_role',
        'manual_instructions',
        'created_at',
      ].join(',')
    )
    .eq('plan_id', args.planId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as StartupImplementationPlanTaskRecordRow[]).map(parsePlanTaskRow);
}

export async function getStartupImplementationPlanTask(args: {
  readonly supabase: SupabaseLike;
  readonly taskId: string;
  readonly expectedWorkspaceId?: string | null;
}): Promise<
  StartupImplementationPlanTask & {
    readonly startupWorkspaceId: string;
    readonly executionId: string | null;
  }
> {
  const { data: taskRow, error: taskError } = await args.supabase
    .from('startup_implementation_plan_tasks')
    .select(
      [
        'id',
        'plan_id',
        'recommendation_id',
        'team_lane',
        'task_kind',
        'title',
        'detail',
        'priority',
        'confidence',
        'evidence',
        'execution_mode',
        'depends_on_task_ids',
        'acceptance_criteria',
        'evidence_required',
        'artifact_refs',
        'status',
        'sort_order',
        'blocked_reason',
        'agent_role',
        'manual_instructions',
        'created_at',
      ].join(',')
    )
    .eq('id', args.taskId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!taskRow?.id) throw new Error('Startup implementation task not found.');

  const { data: planRow, error: planError } = await args.supabase
    .from('startup_implementation_plans')
    .select('id,startup_workspace_id,metadata')
    .eq('id', taskRow.plan_id)
    .maybeSingle();
  if (planError) throw planError;
  if (!planRow?.id) throw new Error('Startup implementation plan not found.');
  if (args.expectedWorkspaceId && planRow.startup_workspace_id !== args.expectedWorkspaceId) {
    throw new Error('Startup implementation task is outside the expected workspace.');
  }

  return {
    ...parsePlanTaskRow(taskRow as StartupImplementationPlanTaskRecordRow),
    startupWorkspaceId: planRow.startup_workspace_id,
    executionId:
      typeof (planRow.metadata as Record<string, unknown> | null)?.['execution_id'] === 'string'
        ? ((planRow.metadata as Record<string, unknown>)['execution_id'] as string)
        : null,
  };
}

export async function updateStartupImplementationPlanTaskStatus(args: {
  readonly supabase: SupabaseLike;
  readonly taskId: string;
  readonly expectedWorkspaceId?: string | null;
  readonly toStatus: StartupImplementationTaskStatus;
  readonly blockedReason?: string | null;
  readonly changedByUserId?: string | null;
}): Promise<
  StartupImplementationPlanTask & {
    readonly startupWorkspaceId: string;
    readonly executionId: string | null;
  }
> {
  const current = await getStartupImplementationPlanTask({
    supabase: args.supabase,
    taskId: args.taskId,
    expectedWorkspaceId: args.expectedWorkspaceId,
  });
  if (!canTransitionStartupImplementationTaskStatus({ from: current.status, to: args.toStatus })) {
    throw new Error(`Invalid startup implementation task transition: ${current.status} -> ${args.toStatus}`);
  }

  const { data: rows, error } = await args.supabase
    .from('startup_implementation_plan_tasks')
    .update({
      status: args.toStatus,
      blocked_reason: args.toStatus === 'blocked' ? args.blockedReason ?? current.blockedReason : null,
    })
    .eq('id', args.taskId)
    .select(
      [
        'id',
        'plan_id',
        'recommendation_id',
        'team_lane',
        'task_kind',
        'title',
        'detail',
        'priority',
        'confidence',
        'evidence',
        'execution_mode',
        'depends_on_task_ids',
        'acceptance_criteria',
        'evidence_required',
        'artifact_refs',
        'status',
        'sort_order',
        'blocked_reason',
        'agent_role',
        'manual_instructions',
        'created_at',
      ].join(',')
    )
    .limit(1);
  if (error) throw error;
  const updatedRow = (rows?.[0] ?? null) as StartupImplementationPlanTaskRecordRow | null;
  if (!updatedRow) throw new Error('Startup implementation task update failed.');

  structuredLog(
    'startup_implementation_task_status_updated',
    {
      startup_workspace_id: current.startupWorkspaceId,
      plan_id: current.planId,
      task_id: current.id,
      execution_id: current.executionId,
      from_status: current.status,
      to_status: args.toStatus,
      blocked_reason:
        args.toStatus === 'blocked' ? args.blockedReason ?? current.blockedReason : null,
      changed_by_user_id: args.changedByUserId ?? null,
    },
    'info'
  );

  return {
    ...parsePlanTaskRow(updatedRow),
    startupWorkspaceId: current.startupWorkspaceId,
    executionId: current.executionId,
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

export function isStartupImplementationTaskAutoExecutable(
  task: Pick<StartupImplementationPlanTask, 'executionMode' | 'taskKind'>
): boolean {
  return task.executionMode !== 'manual' && task.taskKind !== 'manual_action';
}

export function selectStartupExecutionPrTaskBatch(args: {
  readonly tasks: readonly StartupImplementationPlanTask[];
  readonly limit?: number;
}): StartupImplementationPlanTask[] {
  const limit = Math.max(1, Math.min(args.limit ?? STARTUP_EXECUTION_PR_TASK_BATCH_LIMIT, 10));
  const taskMap = new Map(args.tasks.map((task) => [task.id, task]));
  return args.tasks
    .filter((task) => task.status === 'todo')
    .filter((task) => isStartupImplementationTaskAutoExecutable(task))
    .filter((task) =>
      task.dependsOnTaskIds.every((dependencyId) => {
        const dependency = taskMap.get(dependencyId);
        if (!dependency) return true;
        return dependency.status === 'done';
      })
    )
    .slice(0, limit);
}
