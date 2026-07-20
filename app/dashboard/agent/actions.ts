'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAiBinding, getPaymentApiEnv, getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import { runFixAgent, type AgentFix } from '@/lib/server/fix-agent';
import { getStartupGithubIntegrationState } from '@/lib/server/startup-github-integration';
import { getInstallationToken } from '@/lib/server/github-app';
import { openFixAgentPr } from '@/lib/server/fix-agent-pr';

export type FixAgentState =
  | { status: 'idle' }
  | { status: 'ok'; fixes: AgentFix[]; domain: string; score: number | null; scanId: string }
  | { status: 'error'; message: string };

const MESSAGES: Record<string, string> = {
  no_scan: 'Run an audit first — the agent works from your most recent scan.',
  nothing_to_fix: 'Nothing to fix — your latest audit had no failed checks.',
  no_fixes_parsed: 'The agent could not produce clean fixes this time. Try again.',
  workers_ai_binding_missing: 'The AI engine is not available in this environment.',
  not_allowed: 'You do not have access to the Fix Agent.',
};

/** Run the Fix Agent against the signed-in user's latest audit. */
export async function runFixAgentAction(
  _prev: FixAgentState,
  _formData: FormData
): Promise<FixAgentState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 'error', message: 'Server is not configured.' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'fix_agent'));
  if (!allowed) return { status: 'error', message: MESSAGES['not_allowed'] ?? 'Not allowed.' };

  const result = await runFixAgent({ supabase: admin, ai: await getAiBinding(), userId: user.id });
  if (!result.ok) {
    return { status: 'error', message: MESSAGES[result.reason] ?? `Agent failed (${result.reason}).` };
  }
  return {
    status: 'ok',
    fixes: result.fixes,
    domain: result.domain,
    score: result.score,
    scanId: result.scanId,
  };
}

export type FixAgentPrState =
  | { status: 'idle' }
  | { status: 'ok'; url: string; number: number; filesWritten: string[] }
  | { status: 'error'; message: string };

const PR_MESSAGES: Record<string, string> = {
  not_connected: 'Connect your GitHub repo first (Connectors → GitHub), then try again.',
  no_repo: 'No repository is enabled for this workspace yet — enable one in Connectors.',
  app_not_configured: 'GitHub App credentials are not configured on this deployment.',
  no_fixes: 'Nothing to open a PR for — run the agent first.',
};

/**
 * Open a PR with the agent's fixes on the user's connected repo.
 *
 * The fixes are REGENERATED SERVER-SIDE rather than accepted from the client — we never write
 * client-supplied content into someone's repository.
 */
export async function applyFixesAsPrAction(
  _prev: FixAgentPrState,
  _formData: FormData
): Promise<FixAgentPrState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Not allowed.' };

  const env = await getPaymentApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 'error', message: 'Server is not configured.' };
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'fix_agent'));
  if (!allowed) return { status: 'error', message: 'You do not have access to the Fix Agent.' };

  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) {
    return { status: 'error', message: PR_MESSAGES['app_not_configured'] ?? 'Not configured.' };
  }

  // Resolve the user's workspace → connected installation → enabled repo.
  const { data: membership } = await admin
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const workspaceId = (membership?.startup_workspace_id as string | undefined) ?? null;
  if (!workspaceId) return { status: 'error', message: PR_MESSAGES['not_connected'] ?? 'Not connected.' };

  let state;
  try {
    state = await getStartupGithubIntegrationState({ supabase: admin as never, startupWorkspaceId: workspaceId });
  } catch {
    return { status: 'error', message: PR_MESSAGES['not_connected'] ?? 'Not connected.' };
  }
  const installationId = state.installation?.installationId ?? null;
  if (!installationId || state.installation?.status !== 'connected') {
    return { status: 'error', message: PR_MESSAGES['not_connected'] ?? 'Not connected.' };
  }
  const repo = state.repositories.find((r) => r.enabled);
  if (!repo) return { status: 'error', message: PR_MESSAGES['no_repo'] ?? 'No repo enabled.' };

  const fresh = await runFixAgent({ supabase: admin, ai: await getAiBinding(), userId: user.id });
  if (!fresh.ok) {
    return { status: 'error', message: MESSAGES[fresh.reason] ?? `Agent failed (${fresh.reason}).` };
  }

  const token = await getInstallationToken(appId, privateKey, installationId);
  if (!token.ok) return { status: 'error', message: `GitHub auth failed (${token.reason}).` };

  const pr = await openFixAgentPr({
    token: token.token,
    owner: repo.owner,
    repo: repo.name,
    domain: fresh.domain,
    fixes: fresh.fixes,
  });
  if (!pr.ok) {
    return { status: 'error', message: PR_MESSAGES[pr.reason] ?? `Could not open the PR (${pr.reason}).` };
  }
  return { status: 'ok', url: pr.url, number: pr.number, filesWritten: pr.filesWritten };
}
