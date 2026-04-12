import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { structuredError, structuredLog } from './structured-log';
import {
  listStartupSlackDestinations,
  sendStartupSlackMessage,
  uploadStartupSlackFile,
  type ResolvedStartupSlackDestination,
} from './startup-slack-integration';

type SupabaseLike = {
  from(table: string): any;
};

type SlackBotEvent = {
  readonly type?: string;
  readonly user?: string;
  readonly text?: string;
  readonly channel?: string;
  readonly ts?: string;
  readonly thread_ts?: string;
  readonly subtype?: string;
  readonly bot_id?: string;
};

export type StartupSlackBotEnv = {
  readonly NEXT_PUBLIC_APP_URL: string;
  readonly NEXT_PUBLIC_SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly STARTUP_SLACK_SIGNING_SECRET?: string;
};

export type StartupSlackBotDependencies = {
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
};

function normalizeUrlBase(value: string): string {
  return value.replace(/\/+$/, '');
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function verifyStartupSlackSignature(args: {
  readonly body: string;
  readonly signingSecret: string;
  readonly slackSignature: string | null;
  readonly slackTimestamp: string | null;
  readonly now?: () => Date;
}): boolean {
  if (!args.signingSecret || !args.slackSignature || !args.slackTimestamp) return false;
  const timestamp = Number.parseInt(args.slackTimestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  const now = (args.now ?? (() => new Date()))().getTime() / 1000;
  if (Math.abs(now - timestamp) > 60 * 5) return false;
  const expected = `v0=${createHmac('sha256', args.signingSecret)
    .update(`v0:${args.slackTimestamp}:${args.body}`)
    .digest('hex')}`;
  return timingSafeHexEqual(expected, args.slackSignature);
}

async function fetchLatestStartupReport(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<{
  readonly reportId: string | null;
  readonly createdAt: string | null;
  readonly markdownUrl: string | null;
  readonly pdfUrl: string | null;
  readonly scanId: string | null;
} | null> {
  const { data, error } = await args.supabase
    .from('reports')
    .select('id,created_at,markdown_url,pdf_url,scan_id')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return {
    reportId: String(data.id),
    createdAt: typeof data.created_at === 'string' ? data.created_at : null,
    markdownUrl: typeof data.markdown_url === 'string' ? data.markdown_url : null,
    pdfUrl: typeof data.pdf_url === 'string' ? data.pdf_url : null,
    scanId: typeof data.scan_id === 'string' ? data.scan_id : null,
  };
}

async function resolveAssistantDestination(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly channelId: string;
  readonly teamId: string;
}): Promise<ResolvedStartupSlackDestination | null> {
  const { data: installations, error: installationError } = await args.supabase
    .from('startup_slack_installations')
    .select('id,startup_workspace_id,provider,slack_team_id,slack_team_name,slack_team_domain,status,metadata')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'slack')
    .eq('slack_team_id', args.teamId)
    .eq('status', 'active');
  if (installationError) throw installationError;
  const installation = (installations ?? [])[0] as Record<string, unknown> | undefined;
  if (!installation?.id) return null;

  const activeDestinations = await listStartupSlackDestinations({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  const matchingDestination = activeDestinations.find(
    (destination) => destination.channelId === args.channelId && destination.status === 'active'
  );
  const defaultDestination = activeDestinations.find((destination) => destination.isDefaultDestination);
  const destination = matchingDestination ?? defaultDestination ?? activeDestinations[0];

  const installationMetadata =
    (installation.metadata as Record<string, unknown> | null | undefined) ?? {};
  const botToken =
    typeof installationMetadata['bot_access_token'] === 'string'
      ? installationMetadata['bot_access_token'].trim()
      : '';
  if (!botToken) return null;

  return {
    id: destination?.id ?? `ephemeral:${args.teamId}:${args.channelId}`,
    startupWorkspaceId: args.startupWorkspaceId,
    installationId: String(installation.id),
    channelId: args.channelId,
    channelName: destination?.channelName ?? null,
    status: 'active',
    isDefaultDestination: destination?.isDefaultDestination ?? false,
    metadata: destination?.metadata ?? {},
    createdAt: destination?.createdAt ?? new Date().toISOString(),
    installation: {
      id: String(installation.id),
      slackTeamId: String(installation.slack_team_id),
      slackTeamName: (installation.slack_team_name as string | null) ?? null,
      status: 'active',
      metadata: installationMetadata,
    },
  };
}

async function fetchMarkdownContent(args: {
  readonly fetchImpl: typeof fetch;
  readonly markdownUrl: string;
}): Promise<string | null> {
  const response = await args.fetchImpl(args.markdownUrl);
  if (!response.ok) return null;
  return response.text();
}

function buildAuditLink(appUrl: string, startupWorkspaceId: string): string {
  return `${normalizeUrlBase(appUrl)}/dashboard/startup?startupWorkspace=${startupWorkspaceId}&tab=delivery`;
}

function buildFallbackReply(args: {
  readonly startupWorkspaceId: string;
  readonly appUrl: string;
  readonly markdownAvailable: boolean;
}): string {
  const link = buildAuditLink(args.appUrl, args.startupWorkspaceId);
  if (args.markdownAvailable) {
    return `I posted the latest markdown report to this channel. Open the dashboard here: ${link}`;
  }
  return `I could not find a markdown report yet. Open the dashboard here: ${link}`;
}

async function replyToChannel(args: {
  readonly destination: ResolvedStartupSlackDestination;
  readonly text: string;
}): Promise<void> {
  await sendStartupSlackMessage({
    destination: args.destination,
    text: args.text,
  });
}

export async function handleStartupSlackEvent(args: {
  readonly body: string;
  readonly env: StartupSlackBotEnv;
  readonly headers: Headers;
  readonly deps?: StartupSlackBotDependencies;
}): Promise<Response> {
  const log = args.deps?.structuredLog ?? structuredLog;
  const logError = args.deps?.structuredError ?? structuredError;
  const fetchImpl = args.deps?.fetchImpl ?? fetch;
  const now = args.deps?.now ?? (() => new Date());

  if (!args.env.NEXT_PUBLIC_SUPABASE_URL || !args.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'slack_env_missing' }, { status: 500 });
  }

  const signingSecret = args.env.STARTUP_SLACK_SIGNING_SECRET?.trim() ?? '';
  const slackSignature = args.headers.get('x-slack-signature');
  const slackTimestamp = args.headers.get('x-slack-request-timestamp');
  if (!verifyStartupSlackSignature({ body: args.body, signingSecret, slackSignature, slackTimestamp, now })) {
    return Response.json({ error: 'slack_signature_invalid' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(args.body) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'slack_json_parse_failed' }, { status: 400 });
  }

  if (payload.type === 'url_verification' && typeof payload.challenge === 'string') {
    return Response.json({ challenge: payload.challenge }, { status: 200 });
  }

  if (payload.type !== 'event_callback') {
    return new Response(null, { status: 200 });
  }

  const event = (payload.event as SlackBotEvent | undefined) ?? {};
  if (event.type !== 'app_mention') {
    return new Response(null, { status: 200 });
  }

  const teamId = typeof payload.team_id === 'string' ? payload.team_id.trim() : '';
  const channelId = typeof event.channel === 'string' ? event.channel.trim() : '';
  const workspaceEventText = typeof event.text === 'string' ? event.text.trim() : '';
  if (!teamId || !channelId) {
    return Response.json({ error: 'slack_event_missing_channel_or_team' }, { status: 200 });
  }

  const supabase = createServiceRoleClient(
    args.env.NEXT_PUBLIC_SUPABASE_URL,
    args.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: workspace, error: workspaceError } = await supabase
    .from('startup_slack_installations')
    .select('startup_workspace_id')
    .eq('slack_team_id', teamId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  const startupWorkspaceId =
    typeof workspace?.startup_workspace_id === 'string' ? workspace.startup_workspace_id : '';
  if (!startupWorkspaceId) {
    return new Response(null, { status: 200 });
  }

  const destination = await resolveAssistantDestination({
    supabase,
    startupWorkspaceId,
    channelId,
    teamId,
  });
  if (!destination) {
    log(
      'startup_slack_bot_no_destination',
      {
        startup_workspace_id: startupWorkspaceId,
        team_id: teamId,
        channel_id: channelId,
      },
      'info'
    );
    return new Response(null, { status: 200 });
  }

  const report = await fetchLatestStartupReport({ supabase, startupWorkspaceId });
  const markdownUrl = report?.markdownUrl?.trim() ?? '';
  const dashboardLink = buildAuditLink(args.env.NEXT_PUBLIC_APP_URL, startupWorkspaceId);
  const markdownAvailable = markdownUrl.length > 0;

  try {
    if (markdownAvailable) {
      const markdownContent = await fetchMarkdownContent({
        fetchImpl,
        markdownUrl,
      });
      if (markdownContent) {
        await uploadStartupSlackFile({
          destination,
          filename: `geo-pulse-latest-audit-${startupWorkspaceId}.md`,
          title: 'GEO-Pulse latest audit markdown',
          content: markdownContent,
          initialComment: `Latest audit markdown from GEO-Pulse.\nDashboard: ${dashboardLink}`,
        });
      } else {
        await replyToChannel({
          destination,
          text: buildFallbackReply({
            startupWorkspaceId,
            appUrl: args.env.NEXT_PUBLIC_APP_URL,
            markdownAvailable: false,
          }),
        });
      }
    } else {
      await replyToChannel({
        destination,
        text: buildFallbackReply({
          startupWorkspaceId,
          appUrl: args.env.NEXT_PUBLIC_APP_URL,
          markdownAvailable: false,
        }),
      });
    }

    log(
      'startup_slack_bot_app_mention_handled',
      {
        startup_workspace_id: startupWorkspaceId,
        team_id: teamId,
        channel_id: channelId,
        has_markdown: markdownAvailable,
        mention_text: workspaceEventText.slice(0, 500),
      },
      'info'
    );
  } catch (error) {
    logError('startup_slack_bot_app_mention_failed', {
      startup_workspace_id: startupWorkspaceId,
      team_id: teamId,
      channel_id: channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new Response(null, { status: 200 });
}
