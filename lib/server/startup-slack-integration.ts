import { randomUUID } from 'node:crypto';
import { structuredLog } from './structured-log';

type SupabaseLike = {
  from(table: string): any;
};

export type StartupSlackIntegrationState = {
  readonly installations: Array<{
    readonly id: string;
    readonly startupWorkspaceId: string;
    readonly provider: 'slack';
    readonly slackTeamId: string;
    readonly slackTeamName: string | null;
    readonly slackTeamDomain: string | null;
    readonly status: 'active' | 'disconnected';
    readonly connectedAt: string | null;
    readonly disconnectedAt: string | null;
    readonly metadata: Record<string, unknown>;
  }>;
};

export type StartupSlackDestination = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly installationId: string;
  readonly channelId: string;
  readonly channelName: string | null;
  readonly status: 'active' | 'paused';
  readonly isDefaultDestination: boolean;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
};

export type ResolvedStartupSlackDestination = StartupSlackDestination & {
  readonly installation: {
    readonly id: string;
    readonly slackTeamId: string;
    readonly slackTeamName: string | null;
    readonly status: 'active' | 'disconnected';
    readonly metadata: Record<string, unknown>;
  };
};

export type StartupSlackDeliveryEvent = {
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly installationId: string | null;
  readonly destinationId: string | null;
  readonly eventType: 'new_audit_ready' | 'plan_ready';
  readonly status: 'queued' | 'sent' | 'failed' | 'skipped';
  readonly sentByUserId: string | null;
  readonly payload: Record<string, unknown>;
  readonly response: Record<string, unknown>;
  readonly errorMessage: string | null;
  readonly createdAt: string;
};

export async function getStartupSlackIntegrationState(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupSlackIntegrationState> {
  const { data, error } = await args.supabase
    .from('startup_slack_installations')
    .select(
      [
        'id',
        'startup_workspace_id',
        'provider',
        'slack_team_id',
        'slack_team_name',
        'slack_team_domain',
        'status',
        'connected_at',
        'disconnected_at',
        'metadata',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return {
    installations: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      startupWorkspaceId: String(row.startup_workspace_id),
      provider: 'slack',
      slackTeamId: String(row.slack_team_id),
      slackTeamName: (row.slack_team_name as string | null) ?? null,
      slackTeamDomain: (row.slack_team_domain as string | null) ?? null,
      status: row.status as 'active' | 'disconnected',
      connectedAt: (row.connected_at as string | null) ?? null,
      disconnectedAt: (row.disconnected_at as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    })),
  };
}

export async function createStartupSlackInstallSession(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly requestedByUserId: string;
  readonly redirectTo: string;
  readonly expiresInMinutes?: number;
}): Promise<{ readonly stateToken: string; readonly expiresAt: string }> {
  const expiresAt = new Date(Date.now() + (args.expiresInMinutes ?? 20) * 60 * 1000).toISOString();
  const stateToken = randomUUID();
  const { error } = await args.supabase.from('startup_slack_install_sessions').insert({
    startup_workspace_id: args.startupWorkspaceId,
    provider: 'slack',
    state_token: stateToken,
    status: 'pending',
    requested_by_user_id: args.requestedByUserId,
    redirect_to: args.redirectTo,
    expires_at: expiresAt,
    metadata: {},
  });
  if (error) throw error;

  structuredLog(
    'startup_slack_install_session_created',
    {
      startup_workspace_id: args.startupWorkspaceId,
      requested_by_user_id: args.requestedByUserId,
      expires_at: expiresAt,
    },
    'info'
  );

  return { stateToken, expiresAt };
}

export async function consumeStartupSlackInstallSession(args: {
  readonly supabase: SupabaseLike;
  readonly stateToken: string;
}): Promise<{
  readonly id: string;
  readonly startupWorkspaceId: string;
  readonly requestedByUserId: string | null;
  readonly redirectTo: string | null;
} | null> {
  const { data: row, error } = await args.supabase
    .from('startup_slack_install_sessions')
    .select('id,startup_workspace_id,requested_by_user_id,redirect_to,status,expires_at')
    .eq('state_token', args.stateToken)
    .eq('provider', 'slack')
    .maybeSingle();
  if (error) throw error;
  if (!row?.id) return null;

  const now = Date.now();
  const expiresAt = new Date(row.expires_at as string).getTime();
  if ((row.status as string) !== 'pending' || Number.isNaN(expiresAt) || expiresAt < now) {
    await args.supabase
      .from('startup_slack_install_sessions')
      .update({ status: 'expired' })
      .eq('id', row.id);
    return null;
  }

  const { error: consumeError } = await args.supabase
    .from('startup_slack_install_sessions')
    .update({ status: 'consumed' })
    .eq('id', row.id);
  if (consumeError) throw consumeError;

  structuredLog(
    'startup_slack_install_session_consumed',
    {
      startup_workspace_id: row.startup_workspace_id as string,
      session_id: row.id as string,
      requested_by_user_id: (row.requested_by_user_id as string | null) ?? null,
    },
    'info'
  );

  return {
    id: row.id as string,
    startupWorkspaceId: row.startup_workspace_id as string,
    requestedByUserId: (row.requested_by_user_id as string | null) ?? null,
    redirectTo: (row.redirect_to as string | null) ?? null,
  };
}

export async function upsertStartupSlackInstallationFromCallback(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly slackTeamId: string;
  readonly slackTeamName?: string | null;
  readonly slackTeamDomain?: string | null;
  readonly connectedByUserId?: string | null;
  readonly metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.supabase.from('startup_slack_installations').upsert(
    {
      startup_workspace_id: args.startupWorkspaceId,
      provider: 'slack',
      slack_team_id: args.slackTeamId,
      slack_team_name: args.slackTeamName ?? null,
      slack_team_domain: args.slackTeamDomain ?? null,
      status: 'active',
      installed_by_user_id: args.connectedByUserId ?? null,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      metadata: args.metadata ?? {},
    },
    { onConflict: 'startup_workspace_id,provider,slack_team_id' }
  );
  if (error) throw error;

  structuredLog(
    'startup_slack_installation_connected',
    {
      startup_workspace_id: args.startupWorkspaceId,
      slack_team_id: args.slackTeamId,
      slack_team_name: args.slackTeamName ?? null,
      connected_by_user_id: args.connectedByUserId ?? null,
    },
    'info'
  );
}

export async function disconnectStartupSlackInstallation(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly installationId: string;
  readonly disconnectedByUserId: string;
}): Promise<void> {
  const { error } = await args.supabase
    .from('startup_slack_installations')
    .update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      metadata: { disconnected_by_user_id: args.disconnectedByUserId },
    })
    .eq('id', args.installationId)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'slack');
  if (error) throw error;

  structuredLog(
    'startup_slack_installation_disconnected',
    {
      startup_workspace_id: args.startupWorkspaceId,
      installation_id: args.installationId,
      disconnected_by_user_id: args.disconnectedByUserId,
    },
    'info'
  );
}

export async function listStartupSlackDestinations(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<StartupSlackDestination[]> {
  const { data, error } = await args.supabase
    .from('startup_slack_destinations')
    .select(
      [
        'id',
        'startup_workspace_id',
        'installation_id',
        'channel_id',
        'channel_name',
        'status',
        'is_default',
        'metadata',
        'created_at',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    startupWorkspaceId: String(row.startup_workspace_id),
    installationId: String(row.installation_id),
    channelId: String(row.channel_id),
    channelName: (row.channel_name as string | null) ?? null,
    status: row.status as 'active' | 'paused',
    isDefaultDestination: Boolean(row.is_default),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  }));
}

export async function upsertStartupSlackDestination(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly installationId: string;
  readonly channelId: string;
  readonly channelName?: string | null;
  readonly isDefaultDestination: boolean;
  readonly createdByUserId: string;
}): Promise<void> {
  const { data: installation, error: installationError } = await args.supabase
    .from('startup_slack_installations')
    .select('id,status')
    .eq('id', args.installationId)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'slack')
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.id || installation.status !== 'active') {
    throw new Error('Slack workspace is not connected for destination setup.');
  }

  if (args.isDefaultDestination) {
    const { error: unsetError } = await args.supabase
      .from('startup_slack_destinations')
      .update({ is_default: false })
      .eq('startup_workspace_id', args.startupWorkspaceId)
      .eq('is_default', true);
    if (unsetError) throw unsetError;
  }

  const trimmedName = args.channelName?.trim() ?? '';
  const channelNameStored = trimmedName.length > 0 ? trimmedName : args.channelId;

  const { error } = await args.supabase.from('startup_slack_destinations').upsert(
    {
      startup_workspace_id: args.startupWorkspaceId,
      installation_id: args.installationId,
      channel_id: args.channelId,
      channel_name: channelNameStored,
      status: 'active',
      is_default: args.isDefaultDestination,
      metadata: {
        created_by_user_id: args.createdByUserId,
      },
    },
    { onConflict: 'startup_workspace_id,installation_id,channel_id' }
  );
  if (error) throw error;

  structuredLog(
    'startup_slack_destination_saved',
    {
      startup_workspace_id: args.startupWorkspaceId,
      installation_id: args.installationId,
      channel_id: args.channelId,
      is_default_destination: args.isDefaultDestination,
      created_by_user_id: args.createdByUserId,
    },
    'info'
  );
}

export async function getStartupSlackDestination(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly destinationId: string;
}): Promise<ResolvedStartupSlackDestination | null> {
  const { data, error } = await args.supabase
    .from('startup_slack_destinations')
    .select(
      [
        'id',
        'startup_workspace_id',
        'installation_id',
        'channel_id',
        'channel_name',
        'status',
        'is_default',
        'metadata',
        'created_at',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('id', args.destinationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;

  const { data: installation, error: installationError } = await args.supabase
    .from('startup_slack_installations')
    .select('id,slack_team_id,slack_team_name,status,metadata')
    .eq('id', data.installation_id)
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('provider', 'slack')
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.id) return null;

  return {
    id: String(data.id),
    startupWorkspaceId: String(data.startup_workspace_id),
    installationId: String(data.installation_id),
    channelId: String(data.channel_id),
    channelName: (data.channel_name as string | null) ?? null,
    status: data.status as 'active' | 'paused',
    isDefaultDestination: Boolean(data.is_default),
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(data.created_at),
    installation: {
      id: String(installation.id),
      slackTeamId: String(installation.slack_team_id),
      slackTeamName: (installation.slack_team_name as string | null) ?? null,
      status: installation.status as 'active' | 'disconnected',
      metadata: (installation.metadata as Record<string, unknown> | null) ?? {},
    },
  };
}

export async function sendStartupSlackMessage(args: {
  readonly destination: ResolvedStartupSlackDestination;
  readonly text: string;
}): Promise<{ readonly ok: true; readonly timestamp: string | null }> {
  const tokenRaw =
    args.destination.installation.metadata['bot_access_token'] ??
    args.destination.installation.metadata['access_token'];
  const botToken = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  if (!botToken) {
    throw new Error('Slack installation token is missing.');
  }
  if (args.destination.status !== 'active' || args.destination.installation.status !== 'active') {
    throw new Error('Slack destination is not active.');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${botToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: args.destination.channelId,
      text: args.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Slack send failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (!payload.ok) {
    throw new Error(
      `Slack send failed: ${typeof payload.error === 'string' ? payload.error : 'unknown_error'}.`
    );
  }

  return {
    ok: true,
    timestamp: typeof payload.ts === 'string' ? payload.ts : null,
  };
}

export async function createStartupSlackDeliveryEvent(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly installationId: string | null;
  readonly destinationId: string | null;
  readonly eventType: 'new_audit_ready' | 'plan_ready';
  readonly sentByUserId: string | null;
  readonly payload: Record<string, unknown>;
}): Promise<{ readonly id: string }> {
  const { data, error } = await args.supabase
    .from('startup_slack_delivery_events')
    .insert({
      startup_workspace_id: args.startupWorkspaceId,
      installation_id: args.installationId,
      destination_id: args.destinationId,
      event_type: args.eventType,
      status: 'queued',
      sent_by_user_id: args.sentByUserId,
      payload: args.payload,
      response: {},
      error_message: null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: String(data.id) };
}

export async function updateStartupSlackDeliveryEventStatus(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly deliveryEventId: string;
  readonly status: 'sent' | 'failed' | 'skipped';
  readonly response: Record<string, unknown>;
  readonly errorMessage?: string | null;
}): Promise<void> {
  const { error } = await args.supabase
    .from('startup_slack_delivery_events')
    .update({
      status: args.status,
      response: args.response,
      error_message: args.errorMessage ?? null,
    })
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('id', args.deliveryEventId);
  if (error) throw error;
}

export async function listStartupSlackDeliveryEvents(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly limit?: number;
}): Promise<StartupSlackDeliveryEvent[]> {
  const { data, error } = await args.supabase
    .from('startup_slack_delivery_events')
    .select(
      [
        'id',
        'startup_workspace_id',
        'installation_id',
        'destination_id',
        'event_type',
        'status',
        'sent_by_user_id',
        'payload',
        'response',
        'error_message',
        'created_at',
      ].join(',')
    )
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(args.limit ?? 10, 50)));
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    startupWorkspaceId: String(row.startup_workspace_id),
    installationId: (row.installation_id as string | null) ?? null,
    destinationId: (row.destination_id as string | null) ?? null,
    eventType: row.event_type as 'new_audit_ready' | 'plan_ready',
    status: row.status as 'queued' | 'sent' | 'failed' | 'skipped',
    sentByUserId: (row.sent_by_user_id as string | null) ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    response: (row.response as Record<string, unknown> | null) ?? {},
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}
