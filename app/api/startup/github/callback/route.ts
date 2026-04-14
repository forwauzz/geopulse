import { NextResponse } from 'next/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  consumeStartupGithubInstallSession,
  upsertStartupGithubInstallationFromCallback,
} from '@/lib/server/startup-github-integration';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

function buildRedirect(baseUrl: string, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, baseUrl));
}

function readInstallationId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export async function GET(request: Request) {
  const env = await getScanApiEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return buildRedirect(appUrl, '/dashboard/startup?github=github_env_missing');
  }

  const state = new URL(request.url).searchParams.get('state');
  const installationId = readInstallationId(
    new URL(request.url).searchParams.get('installation_id') ??
      new URL(request.url).searchParams.get('installationId')
  );
  const accountLogin =
    new URL(request.url).searchParams.get('account_login') ??
    new URL(request.url).searchParams.get('account');
  const accountType = new URL(request.url).searchParams.get('account_type');

  if (!state || !installationId) {
    return buildRedirect(appUrl, '/dashboard/startup?github=github_callback_invalid');
  }

  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const session = await consumeStartupGithubInstallSession({
    supabase: serviceSupabase,
    stateToken: state,
  });
  if (!session) {
    return buildRedirect(appUrl, '/dashboard/startup?github=github_state_invalid');
  }

  await upsertStartupGithubInstallationFromCallback({
    supabase: serviceSupabase,
    startupWorkspaceId: session.startupWorkspaceId,
    installationId,
    accountLogin,
    accountType,
    connectedByUserId: session.requestedByUserId,
    metadata: { callback_state: state },
  });

  const redirectTo =
    session.redirectTo && session.redirectTo.startsWith('/dashboard')
      ? session.redirectTo
      : `/dashboard/startup?startupWorkspace=${session.startupWorkspaceId}&github=github_connected`;

  return buildRedirect(appUrl, redirectTo);
}
