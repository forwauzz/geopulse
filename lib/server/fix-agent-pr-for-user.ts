/**
 * Resolve a user's connected repo and open the Fix Agent's pull request on it.
 *
 * Extracted so the manual "Open a PR" button and the automatic run share ONE implementation. Two
 * copies of repo resolution is how the automatic path quietly ends up targeting a different
 * repository than the button the user tested with.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInstallationToken, listInstallationRepositories } from '@/lib/server/github-app';
import { openFixAgentPr } from '@/lib/server/fix-agent-pr';
import type { AgentFix } from '@/lib/server/fix-agent';

export type OpenPrResult =
  | { ok: true; url: string; number: number; filesWritten: string[] }
  | { ok: false; reason: string };

export async function openFixAgentPrForUser(args: {
  readonly admin: SupabaseClient;
  readonly appId: string | undefined;
  readonly privateKey: string | undefined;
  readonly userId: string;
  readonly domain: string;
  readonly fixes: AgentFix[];
}): Promise<OpenPrResult> {
  const appId = args.appId?.trim();
  const privateKey = args.privateKey?.trim();
  if (!appId || !privateKey) return { ok: false, reason: 'app_not_configured' };
  if (args.fixes.length === 0) return { ok: false, reason: 'no_fixes' };

  // A user can belong to several workspaces — pick the one that actually has a connected
  // installation rather than an arbitrary first row.
  const { data: memberships } = await args.admin
    .from('startup_workspace_users')
    .select('startup_workspace_id')
    .eq('user_id', args.userId);
  const workspaceIds = ((memberships ?? []) as { startup_workspace_id: string }[]).map(
    (m) => m.startup_workspace_id
  );
  if (workspaceIds.length === 0) return { ok: false, reason: 'not_connected' };

  const { data: install } = await args.admin
    .from('startup_github_installations')
    .select('installation_id, startup_workspace_id')
    .in('startup_workspace_id', workspaceIds)
    .eq('provider', 'github')
    .eq('status', 'connected')
    .not('installation_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const installationId = (install?.installation_id as number | undefined) ?? null;
  if (!installationId) return { ok: false, reason: 'not_connected' };

  const token = await getInstallationToken(appId, privateKey, installationId);
  if (!token.ok) return { ok: false, reason: `github_auth_failed_${token.reason}` };

  // GitHub is the source of truth for which repos this install may touch. If the workspace has
  // narrowed the list in our UI, respect that as a filter; otherwise use what GitHub granted.
  const granted = await listInstallationRepositories(token.token);
  if (!granted.ok) return { ok: false, reason: 'repo_list_failed' };
  if (granted.repos.length === 0) return { ok: false, reason: 'no_repo' };

  const { data: allowRows } = await args.admin
    .from('startup_github_installation_repositories')
    .select('repo_owner, repo_name')
    .eq('startup_workspace_id', install?.startup_workspace_id as string)
    .eq('is_enabled', true);
  const allow = new Set(
    ((allowRows ?? []) as { repo_owner: string; repo_name: string }[]).map(
      (r) => `${r.repo_owner}/${r.repo_name}`.toLowerCase()
    )
  );
  const repo =
    granted.repos.find((r) => allow.has(r.fullName.toLowerCase())) ??
    (allow.size === 0 ? granted.repos[0] : undefined);
  if (!repo) return { ok: false, reason: 'no_repo' };

  return openFixAgentPr({
    token: token.token,
    owner: repo.owner,
    repo: repo.name,
    domain: args.domain,
    fixes: args.fixes,
  });
}
