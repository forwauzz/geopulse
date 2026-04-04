import { NextResponse } from 'next/server';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  consumeStartupSlackInstallSession,
  upsertStartupSlackInstallationFromCallback,
} from '@/lib/server/startup-slack-integration';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

function buildRedirect(baseUrl: string, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, baseUrl));
}

type SlackOauthExchange = {
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly teamDomain: string | null;
  readonly botAccessToken: string | null;
  readonly scope: string | null;
};

async function exchangeSlackOauthCode(args: {
  readonly code: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly clientSecret: string;
}): Promise<SlackOauthExchange | null> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      client_secret: args.clientSecret,
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Record<string, unknown>;
  if (!payload.ok) return null;
  const team = (payload.team as Record<string, unknown> | undefined) ?? {};

  return {
    teamId: typeof team.id === 'string' ? team.id : null,
    teamName: typeof team.name === 'string' ? team.name : null,
    teamDomain: typeof team.domain === 'string' ? team.domain : null,
    botAccessToken: typeof payload.access_token === 'string' ? payload.access_token : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
  };
}

function resolveTeamDetails(url: URL): {
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly teamDomain: string | null;
} {
  const id = url.searchParams.get('team_id') ?? url.searchParams.get('team');
  const name = url.searchParams.get('team_name');
  const domain = url.searchParams.get('team_domain');
  return {
    teamId: id && id.trim().length > 0 ? id.trim() : null,
    teamName: name && name.trim().length > 0 ? name.trim() : null,
    teamDomain: domain && domain.trim().length > 0 ? domain.trim() : null,
  };
}

export async function GET(request: Request) {
  const env = await getScanApiEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return buildRedirect(appUrl, '/dashboard/startup?slack=slack_env_missing');
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return buildRedirect(appUrl, '/dashboard/startup?slack=slack_oauth_denied');
  }
  if (!state) {
    return buildRedirect(appUrl, '/dashboard/startup?slack=slack_callback_invalid');
  }

  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const session = await consumeStartupSlackInstallSession({
    supabase: serviceSupabase,
    stateToken: state,
  });
  if (!session) {
    return buildRedirect(appUrl, '/dashboard/startup?slack=slack_state_invalid');
  }

  const callbackUri = `${appUrl.replace(/\/+$/, '')}/api/startup/slack/callback`;
  const code = url.searchParams.get('code');
  const rawTeam = resolveTeamDetails(url);
  const exchangedTeam =
    code &&
    env.STARTUP_SLACK_CLIENT_ID &&
    env.STARTUP_SLACK_CLIENT_SECRET
      ? await exchangeSlackOauthCode({
          code,
          redirectUri: callbackUri,
          clientId: env.STARTUP_SLACK_CLIENT_ID,
          clientSecret: env.STARTUP_SLACK_CLIENT_SECRET,
        })
      : null;
  const teamId = rawTeam.teamId ?? exchangedTeam?.teamId ?? null;
  const teamName = rawTeam.teamName ?? exchangedTeam?.teamName ?? null;
  const teamDomain = rawTeam.teamDomain ?? exchangedTeam?.teamDomain ?? null;

  if (!teamId) {
    return buildRedirect(
      appUrl,
      `/dashboard/startup?startupWorkspace=${session.startupWorkspaceId}&slack=slack_callback_invalid`
    );
  }

  await upsertStartupSlackInstallationFromCallback({
    supabase: serviceSupabase,
    startupWorkspaceId: session.startupWorkspaceId,
    slackTeamId: teamId,
    slackTeamName: teamName,
    slackTeamDomain: teamDomain,
    connectedByUserId: session.requestedByUserId,
    metadata: {
      callback_state: state,
      oauth_code_received: Boolean(code),
      bot_access_token: exchangedTeam?.botAccessToken ?? null,
      scope: exchangedTeam?.scope ?? null,
    },
  });

  const redirectTo =
    session.redirectTo && session.redirectTo.startsWith('/dashboard')
      ? session.redirectTo
      : `/dashboard/startup?startupWorkspace=${session.startupWorkspaceId}&slack=slack_connected`;

  return buildRedirect(appUrl, redirectTo);
}
