'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  queueStartupRecommendationPrRun,
  updateStartupAgentPrRunStatus,
} from '@/lib/server/startup-agent-pr-workflow';
import {
  createStartupGithubInstallSession,
  disconnectStartupGithubInstallation,
  normalizeGitHubRepoAllowlist,
  setStartupGithubRepositoryAllowlist,
} from '@/lib/server/startup-github-integration';
import { resolveStartupServiceModelPolicy } from '@/lib/server/startup-model-policy';
import { resolveStartupWorkspaceRolloutFlags } from '@/lib/server/startup-rollout-flags';
import { resolveStartupDashboardUiGates } from '@/lib/server/startup-service-gates';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function buildStartupUrl(workspaceId: string, githubStatus?: string, prStatus?: string): string {
  const params = new URLSearchParams({ startupWorkspace: workspaceId });
  if (githubStatus) params.set('github', githubStatus);
  if (prStatus) params.set('pr', prStatus);
  return `/dashboard/startup?${params.toString()}`;
}

async function requireWorkspaceMember(args: {
  readonly supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  readonly userId: string;
  readonly workspaceId: string;
}): Promise<void> {
  const { data, error } = await args.supabase
    .from('startup_workspace_users')
    .select('id')
    .eq('startup_workspace_id', args.workspaceId)
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Startup workspace access denied.');
}

export async function beginStartupGithubInstall(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  if (!workspaceId) throw new Error('Missing startup workspace id.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  const env = await getScanApiEnv();
  const rollout = await resolveStartupWorkspaceRolloutFlags({
    supabase,
    startupWorkspaceId: workspaceId,
    env,
  });
  if (!rollout.startupDashboard || !rollout.githubAgent) {
    redirect(buildStartupUrl(workspaceId, 'github_rollout_disabled'));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, 'github_env_missing'));
  }

  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const gates = await resolveStartupDashboardUiGates({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!gates.githubIntegration.enabled) {
    structuredLog(
      'startup_service_gate_blocked',
      {
        startup_workspace_id: workspaceId,
        service_key: 'github_integration',
        blocked_reason: gates.githubIntegration.blockedReason ?? 'service_disabled',
        user_id: user.id,
      },
      'warning'
    );
    if (
      gates.githubIntegration.blockedReason === 'workspace_requires_paid_mode' ||
      gates.githubIntegration.blockedReason === 'stripe_mapping_missing' ||
      gates.githubIntegration.blockedReason === 'stripe_mapping_inactive'
    ) {
      redirect(buildStartupUrl(workspaceId, 'github_billing_blocked'));
    }
    redirect(buildStartupUrl(workspaceId, 'github_not_entitled'));
  }

  if (!env.GITHUB_APP_INSTALL_URL) {
    redirect(buildStartupUrl(workspaceId, 'github_install_url_missing'));
  }

  const callbackBase =
    env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000';

  const { stateToken } = await createStartupGithubInstallSession({
    supabase,
    startupWorkspaceId: workspaceId,
    requestedByUserId: user.id,
    redirectTo: buildStartupUrl(workspaceId, 'github_connected'),
  });

  const installUrl = new URL(env.GITHUB_APP_INSTALL_URL);
  installUrl.searchParams.set('state', stateToken);
  installUrl.searchParams.set('redirect_url', `${callbackBase}/api/startup/github/callback`);
  redirect(installUrl.toString());
}

export async function saveStartupGithubAllowlist(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  if (!workspaceId) throw new Error('Missing startup workspace id.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  const raw = String(formData.get('repoAllowlist') ?? '');
  const parsed = normalizeGitHubRepoAllowlist(raw);
  if (parsed.invalid.length > 0) {
    redirect(buildStartupUrl(workspaceId, 'github_invalid_repos'));
  }

  await setStartupGithubRepositoryAllowlist({
    supabase,
    startupWorkspaceId: workspaceId,
    repositories: parsed.repositories,
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, 'github_repos_saved'));
}

export async function disconnectStartupGithub(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  if (!workspaceId) throw new Error('Missing startup workspace id.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });
  await disconnectStartupGithubInstallation({
    supabase,
    startupWorkspaceId: workspaceId,
    disconnectedByUserId: user.id,
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, 'github_disconnected'));
}

export async function queueStartupRecommendationPrRunAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const recommendationId = String(formData.get('recommendationId') ?? '').trim();
  const repoFullName = String(formData.get('repoFullName') ?? '').trim();
  if (!workspaceId || !recommendationId || !repoFullName) {
    throw new Error('Missing PR queue inputs.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  const env = await getScanApiEnv();
  const rollout = await resolveStartupWorkspaceRolloutFlags({
    supabase,
    startupWorkspaceId: workspaceId,
    env,
  });
  if (!rollout.startupDashboard || !rollout.githubAgent) {
    redirect(buildStartupUrl(workspaceId, undefined, 'pr_rollout_disabled'));
  }
  if (!rollout.autoPr) {
    redirect(buildStartupUrl(workspaceId, undefined, 'pr_suggest_only'));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, undefined, 'pr_env_missing'));
  }
  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const gates = await resolveStartupDashboardUiGates({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!gates.githubIntegration.enabled || !gates.agentPrExecution.enabled) {
    const blockedServiceKey = !gates.agentPrExecution.enabled
      ? 'agent_pr_execution'
      : 'github_integration';
    const blockedReason = !gates.agentPrExecution.enabled
      ? gates.agentPrExecution.blockedReason
      : gates.githubIntegration.blockedReason;
    structuredLog(
      'startup_service_gate_blocked',
      {
        startup_workspace_id: workspaceId,
        service_key: blockedServiceKey,
        blocked_reason: blockedReason ?? 'service_disabled',
        user_id: user.id,
      },
      'warning'
    );
    if (
      gates.agentPrExecution.blockedReason === 'workspace_requires_paid_mode' ||
      gates.agentPrExecution.blockedReason === 'stripe_mapping_missing' ||
      gates.agentPrExecution.blockedReason === 'stripe_mapping_inactive'
    ) {
      redirect(buildStartupUrl(workspaceId, undefined, 'pr_billing_blocked'));
    }
    redirect(buildStartupUrl(workspaceId, undefined, 'pr_not_entitled'));
  }

  const prPolicy = await resolveStartupServiceModelPolicy({
    supabase: serviceSupabase,
    startupWorkspaceId: workspaceId,
    serviceKey: 'agent_pr_execution',
    fallbackProvider: env.BENCHMARK_EXECUTION_PROVIDER || 'gemini',
    fallbackModel: env.BENCHMARK_EXECUTION_MODEL || env.GEMINI_MODEL || 'gemini-2.0-flash',
    supportedProviders: ['gemini', 'openai', 'anthropic', 'custom'],
    estimatedCostUsd: null,
  });

  await queueStartupRecommendationPrRun({
    supabase,
    startupWorkspaceId: workspaceId,
    recommendationId,
    repoFullName,
    queuedByUserId: user.id,
    executionModelPolicy: {
      source: prPolicy.source,
      bundle_key: prPolicy.bundleKey,
      requested_provider: prPolicy.requestedProvider,
      requested_model: prPolicy.requestedModel,
      effective_provider: prPolicy.effectiveProvider,
      effective_model: prPolicy.effectiveModel,
      max_cost_usd: prPolicy.maxCostUsd,
      budget_exceeded: prPolicy.budgetExceeded,
      fallback_reason: prPolicy.fallbackReason,
    },
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, 'pr_queued'));
}

export async function markStartupPrRunOpenedAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const runId = String(formData.get('runId') ?? '').trim();
  const pullRequestUrl = String(formData.get('pullRequestUrl') ?? '').trim();
  const pullRequestNumberRaw = String(formData.get('pullRequestNumber') ?? '').trim();
  const pullRequestNumber = Number(pullRequestNumberRaw);
  if (!workspaceId || !runId || !pullRequestUrl || !Number.isFinite(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error('Missing PR-open inputs.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');
  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  await updateStartupAgentPrRunStatus({
    supabase,
    startupWorkspaceId: workspaceId,
    runId,
    toStatus: 'pr_opened',
    changedByUserId: user.id,
    pullRequestNumber: Math.trunc(pullRequestNumber),
    pullRequestUrl,
    note: 'PR opened manually from startup dashboard',
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, 'pr_opened'));
}

export async function markStartupPrRunMergedAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const runId = String(formData.get('runId') ?? '').trim();
  if (!workspaceId || !runId) throw new Error('Missing PR-merged inputs.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');
  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  await updateStartupAgentPrRunStatus({
    supabase,
    startupWorkspaceId: workspaceId,
    runId,
    toStatus: 'merged',
    changedByUserId: user.id,
    note: 'PR merged',
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, 'pr_merged'));
}

export async function markStartupPrRunFailedAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const runId = String(formData.get('runId') ?? '').trim();
  const errorMessage = String(formData.get('errorMessage') ?? '').trim();
  if (!workspaceId || !runId) throw new Error('Missing PR-failed inputs.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');
  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  await updateStartupAgentPrRunStatus({
    supabase,
    startupWorkspaceId: workspaceId,
    runId,
    toStatus: 'failed',
    changedByUserId: user.id,
    errorMessage: errorMessage || 'PR execution failed',
    note: 'PR run failed',
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, 'pr_failed'));
}
