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
import {
  createStartupSlackDeliveryEvent,
  createStartupSlackInstallSession,
  disconnectStartupSlackInstallation,
  getStartupSlackDestination,
  updateStartupSlackDeliveryEventStatus,
  sendStartupSlackMessage,
  uploadStartupSlackFile,
  upsertStartupSlackDestination,
} from '@/lib/server/startup-slack-integration';
import { resolveStartupServiceModelPolicy } from '@/lib/server/startup-model-policy';
import { applyStartupRolloutFlagPatch, resolveStartupWorkspaceRolloutFlags } from '@/lib/server/startup-rollout-flags';
import {
  resolveStartupDashboardUiGates,
  resolveStartupServiceGate,
  resolveStartupSlackConnectorUiGates,
  resolveStartupSlackIntegrationGate,
} from '@/lib/server/startup-service-gates';
import { formatStartupSlackMessage, type StartupSlackMessagePayload } from '@/lib/server/startup-slack-message';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function buildStartupUrl(
  workspaceId: string,
  githubStatus?: string,
  prStatus?: string,
  slackStatus?: string
): string {
  const params = new URLSearchParams({ startupWorkspace: workspaceId });
  if (githubStatus) params.set('github', githubStatus);
  if (prStatus) params.set('pr', prStatus);
  if (slackStatus) params.set('slack', slackStatus);
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

async function requireWorkspaceRole(args: {
  readonly supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  readonly userId: string;
  readonly workspaceId: string;
  readonly roles: string[];
}): Promise<void> {
  const { data, error } = await args.supabase
    .from('startup_workspace_users')
    .select('role')
    .eq('startup_workspace_id', args.workspaceId)
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  const role = typeof data?.role === 'string' ? data.role : '';
  if (!args.roles.includes(role)) {
    throw new Error('Startup workspace role does not allow this action.');
  }
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

export async function beginStartupSlackInstall(formData: FormData): Promise<void> {
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
  if (!rollout.startupDashboard || !rollout.slackAgent) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_rollout_disabled'));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_env_missing'));
  }

  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const slackGate = await resolveStartupSlackIntegrationGate({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!slackGate.enabled) {
    structuredLog(
      'startup_service_gate_blocked',
      {
        startup_workspace_id: workspaceId,
        service_key: 'slack_integration',
        blocked_reason: slackGate.blockedReason ?? 'service_disabled',
        user_id: user.id,
      },
      'warning'
    );
    if (
      slackGate.blockedReason === 'workspace_requires_paid_mode' ||
      slackGate.blockedReason === 'stripe_mapping_missing' ||
      slackGate.blockedReason === 'stripe_mapping_inactive'
    ) {
      redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_billing_blocked'));
    }
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_not_entitled'));
  }

  if (!env.STARTUP_SLACK_APP_INSTALL_URL) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_install_url_missing'));
  }
  if (!env.STARTUP_SLACK_CLIENT_ID) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_client_id_missing'));
  }

  const callbackBase = env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000';
  const callbackUrl = `${callbackBase}/api/startup/slack/callback`;

  const { stateToken } = await createStartupSlackInstallSession({
    supabase,
    startupWorkspaceId: workspaceId,
    requestedByUserId: user.id,
    redirectTo: buildStartupUrl(workspaceId, undefined, undefined, 'slack_connected'),
  });

  const installUrl = new URL(env.STARTUP_SLACK_APP_INSTALL_URL);
  installUrl.searchParams.set('client_id', env.STARTUP_SLACK_CLIENT_ID);
  installUrl.searchParams.set('scope', 'chat:write,chat:write.public');
  installUrl.searchParams.set('state', stateToken);
  installUrl.searchParams.set('redirect_uri', callbackUrl);
  redirect(installUrl.toString());
}

export async function disconnectStartupSlack(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const installationId = String(formData.get('installationId') ?? '').trim();
  if (!workspaceId || !installationId) throw new Error('Missing startup Slack disconnect inputs.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  await disconnectStartupSlackInstallation({
    supabase,
    startupWorkspaceId: workspaceId,
    installationId,
    disconnectedByUserId: user.id,
  });

  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_disconnected'));
}

export async function saveStartupSlackDestination(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const installationId = String(formData.get('installationId') ?? '').trim();
  const channelId = String(formData.get('channelId') ?? '').trim();
  const channelNameRaw = String(formData.get('channelName') ?? '').trim();
  const isDefaultDestination = formData.get('isDefaultDestination') === 'on';

  if (!workspaceId || !installationId || !channelId) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_destination_invalid'));
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
  if (!rollout.startupDashboard || !rollout.slackAgent) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_rollout_disabled'));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_env_missing'));
  }

  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const slackGate = await resolveStartupSlackIntegrationGate({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!slackGate.enabled) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_not_entitled'));
  }

  await upsertStartupSlackDestination({
    supabase,
    startupWorkspaceId: workspaceId,
    installationId,
    channelId,
    channelName: channelNameRaw || null,
    isDefaultDestination,
    createdByUserId: user.id,
  });

  revalidatePath('/dashboard/connectors');
  revalidatePath('/dashboard/startup');
  redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_destination_saved'));
}

export async function updateStartupSlackAutoPostSetting(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  if (!workspaceId) throw new Error('Missing startup workspace id.');
  const enabled = formData.get('slackAutoPostEnabled') === 'on';
  const returnTo = String(formData.get('returnTo') ?? '').trim() || null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });
  await requireWorkspaceRole({
    supabase,
    userId: user.id,
    workspaceId,
    roles: ['founder', 'admin'],
  });

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_env_missing'));
  }
  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: existingError } = await serviceSupabase
    .from('startup_workspaces')
    .select('metadata')
    .eq('id', workspaceId)
    .maybeSingle();
  if (existingError) throw existingError;

  const nextMetadata = applyStartupRolloutFlagPatch({
    metadata: (existing?.metadata as Record<string, unknown> | null | undefined) ?? {},
    patch: {
      slackAutoPost: enabled,
    },
  });

  const { error: updateError } = await serviceSupabase
    .from('startup_workspaces')
    .update({ metadata: nextMetadata })
    .eq('id', workspaceId);
  if (updateError) throw updateError;

  structuredLog(
    'startup_rollout_flags_updated',
    {
      startup_workspace_id: workspaceId,
      slack_auto_post: enabled,
      updated_by_user_id: user.id,
      source: 'startup_dashboard_owner_toggle',
    },
    'info'
  );

  revalidatePath('/dashboard/connectors');
  revalidatePath('/dashboard/startup');
  revalidatePath('/dashboard/startups');
  redirect(returnTo ?? buildStartupUrl(workspaceId, undefined, undefined, 'slack_auto_post_updated'));
}

export async function sendStartupReportToSlack(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const reportId = String(formData.get('reportId') ?? '').trim();
  const destinationId = String(formData.get('destinationId') ?? '').trim();
  const eventTypeRaw = String(formData.get('eventType') ?? 'new_audit_ready').trim();
  const eventType = eventTypeRaw === 'plan_ready' ? 'plan_ready' : 'new_audit_ready';
  const returnTo = String(formData.get('returnTo') ?? '').trim() || null;

  if (!workspaceId || !reportId || !destinationId) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_send_invalid'));
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
  if (!rollout.startupDashboard || !rollout.slackAgent) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_rollout_disabled'));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_env_missing'));
  }
  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const gates = await resolveStartupSlackConnectorUiGates({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!gates.slackIntegration.enabled || !gates.slackNotifications.enabled) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_not_entitled'));
  }

  const destination = await getStartupSlackDestination({
    supabase,
    startupWorkspaceId: workspaceId,
    destinationId,
  });
  if (!destination) {
    redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_destination_missing'));
  }

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id,type,created_at,pdf_url,markdown_url,scan_id')
    .eq('startup_workspace_id', workspaceId)
    .eq('id', reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report?.id) redirect(buildStartupUrl(workspaceId, undefined, undefined, 'slack_report_missing'));

  const markdownUrlRaw = typeof report.markdown_url === 'string' ? report.markdown_url.trim() : '';
  const markdownGate =
    markdownUrlRaw.length > 0
      ? await resolveStartupServiceGate({
          memberSupabase: supabase,
          serviceSupabase,
          startupWorkspaceId: workspaceId,
          userId: user.id,
          serviceKey: 'markdown_audit_export',
          bundleKey: gates.slackIntegration.bundleKey,
        })
      : null;

  const { data: scan, error: scanError } = report.scan_id
    ? await supabase
        .from('scans')
        .select('id,domain,score,url')
        .eq('id', report.scan_id)
        .eq('startup_workspace_id', workspaceId)
        .maybeSingle()
    : ({ data: null, error: null } as const);
  if (scanError) throw scanError;

  const { data: recommendations, error: recommendationsError } = await supabase
    .from('startup_recommendations')
    .select('title')
    .eq('startup_workspace_id', workspaceId)
    .or(`report_id.eq.${reportId}${report.scan_id ? `,scan_id.eq.${report.scan_id}` : ''}`)
    .order('created_at', { ascending: false })
    .limit(6);
  if (recommendationsError) throw recommendationsError;

  const recommendationTitles = ((recommendations ?? []) as Array<{ title: string | null }>)
    .map((item) => (item.title ?? '').trim())
    .filter((title) => title.length > 0)
    .slice(0, 3);

  const scoreValue = typeof scan?.score === 'number' ? scan.score : null;
  const { data: previousScan, error: previousScanError } =
    report.scan_id && scan?.id
      ? await supabase
          .from('scans')
          .select('id,score')
          .eq('startup_workspace_id', workspaceId)
          .neq('id', scan.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : ({ data: null, error: null } as const);
  if (previousScanError) throw previousScanError;
  const previousScore = typeof previousScan?.score === 'number' ? previousScan.score : null;
  const scoreDelta =
    scoreValue != null && previousScore != null ? Math.round(scoreValue - previousScore) : null;

  const reportUrl = `${(env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/dashboard/startup?startupWorkspace=${workspaceId}`;
  const destinationLabel = destination.channelName
    ? `${destination.channelName} (${destination.channelId})`
    : destination.channelId;
  const domainValue = (scan?.domain as string | null) ?? 'site';
  const payload: StartupSlackMessagePayload = {
    startup_workspace_id: workspaceId,
    destination_id: destination.id,
    event_type: eventType,
    site_domain: domainValue,
    score: scoreValue,
    score_delta: scoreDelta,
    summary_bullets: recommendationTitles,
    report_url: reportUrl,
    markdown_url:
      markdownGate?.enabled && markdownUrlRaw.length > 0 ? report.markdown_url as string : null,
    sent_by_user_id: user.id,
  };
  const text = formatStartupSlackMessage(payload);
  const pdfLine = typeof report.pdf_url === 'string' && report.pdf_url.length > 0 ? `\nPDF: ${report.pdf_url}` : '';
  const { id: deliveryEventId } = await createStartupSlackDeliveryEvent({
    supabase,
    startupWorkspaceId: workspaceId,
    installationId: destination.installation.id,
    destinationId: destination.id,
    eventType,
    sentByUserId: user.id,
    payload: {
      ...payload,
      destination_label: destinationLabel,
    },
  });

  try {
    const sendResult = await sendStartupSlackMessage({
      destination,
      text: `${text}${pdfLine}`,
    });
    await updateStartupSlackDeliveryEventStatus({
      supabase,
      startupWorkspaceId: workspaceId,
      deliveryEventId,
      status: 'sent',
      response: {
        slack_ts: sendResult.timestamp,
        destination_label: destinationLabel,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateStartupSlackDeliveryEventStatus({
      supabase,
      startupWorkspaceId: workspaceId,
      deliveryEventId,
      status: 'failed',
      response: {
        destination_label: destinationLabel,
      },
      errorMessage,
    });
    structuredLog(
      'startup_slack_manual_send_failed',
      {
        startup_workspace_id: workspaceId,
        report_id: reportId,
        destination_id: destinationId,
        destination_label: destinationLabel,
        event_type: eventType,
        user_id: user.id,
        delivery_event_id: deliveryEventId,
        error_message: errorMessage,
      },
      'warning'
    );
    redirect(returnTo ? `${returnTo}&status=slack_send_failed` : buildStartupUrl(workspaceId, undefined, undefined, 'slack_send_failed'));
  }

  structuredLog(
    'startup_slack_manual_send_succeeded',
    {
      startup_workspace_id: workspaceId,
      report_id: reportId,
      destination_id: destinationId,
      destination_label: destinationLabel,
      event_type: eventType,
      delivery_event_id: deliveryEventId,
      user_id: user.id,
    },
    'info'
  );

  revalidatePath('/dashboard/startup');
  redirect(returnTo ? `${returnTo}&status=slack_send_ok` : buildStartupUrl(workspaceId, undefined, undefined, 'slack_send_ok'));
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

export async function updateStartupAuditCadence(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const cadenceDaysRaw = Number(formData.get('cadenceDays') ?? '30');
  const returnTo = String(formData.get('returnTo') ?? '').trim() || null;

  const VALID_CADENCES = [7, 14, 30, 60, 90];
  const cadenceDays = VALID_CADENCES.includes(cadenceDaysRaw) ? cadenceDaysRaw : 30;

  if (!workspaceId) redirect('/dashboard/connectors');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/connectors');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });
  await requireWorkspaceRole({
    supabase,
    userId: user.id,
    workspaceId,
    roles: ['founder', 'admin'],
  });

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(returnTo ?? `/dashboard/connectors?startupWorkspace=${workspaceId}&status=env_missing`);
  }
  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: existingError } = await serviceSupabase
    .from('startup_workspaces')
    .select('metadata')
    .eq('id', workspaceId)
    .maybeSingle();
  if (existingError) throw existingError;

  const currentMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
  const nextMeta = { ...currentMeta, audit_cadence_days: cadenceDays };

  const { error: updateError } = await serviceSupabase
    .from('startup_workspaces')
    .update({ metadata: nextMeta })
    .eq('id', workspaceId);
  if (updateError) throw updateError;

  structuredLog(
    'startup_audit_cadence_updated',
    {
      startup_workspace_id: workspaceId,
      cadence_days: cadenceDays,
      updated_by_user_id: user.id,
    },
    'info'
  );

  revalidatePath('/dashboard/connectors');
  redirect(
    returnTo ??
      `/dashboard/connectors?startupWorkspace=${workspaceId}&status=cadence_updated`
  );
}

export async function sendStartupMarkdownToSlack(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  const reportId = String(formData.get('reportId') ?? '').trim();
  const destinationId = String(formData.get('destinationId') ?? '').trim();
  const returnTo = String(formData.get('returnTo') ?? '').trim() || null;

  const fallbackUrl = returnTo ?? `/dashboard/connectors?startupWorkspace=${workspaceId}&status=slack_markdown_failed`;

  if (!workspaceId || !reportId || !destinationId) {
    redirect(fallbackUrl);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/connectors');

  await requireWorkspaceMember({ supabase, userId: user.id, workspaceId });

  const env = await getScanApiEnv();
  const rollout = await resolveStartupWorkspaceRolloutFlags({
    supabase,
    startupWorkspaceId: workspaceId,
    env,
  });
  if (!rollout.startupDashboard || !rollout.slackAgent) {
    redirect(fallbackUrl);
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(fallbackUrl);
  }
  const serviceSupabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const gates = await resolveStartupSlackConnectorUiGates({
    memberSupabase: supabase,
    serviceSupabase,
    startupWorkspaceId: workspaceId,
    userId: user.id,
  });
  if (!gates.slackIntegration.enabled || !gates.slackNotifications.enabled) {
    redirect(fallbackUrl);
  }

  const destination = await getStartupSlackDestination({
    supabase,
    startupWorkspaceId: workspaceId,
    destinationId,
  });
  if (!destination) redirect(fallbackUrl);

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id,type,created_at,markdown_url,scan_id')
    .eq('startup_workspace_id', workspaceId)
    .eq('id', reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report?.id || !report.markdown_url) {
    redirect(fallbackUrl);
  }

  const { data: scan } = report.scan_id
    ? await supabase
        .from('scans')
        .select('id,domain,score')
        .eq('id', report.scan_id)
        .eq('startup_workspace_id', workspaceId)
        .maybeSingle()
    : ({ data: null } as const);

  const domainValue = (scan?.domain as string | null) ?? 'site';
  const scoreValue = typeof scan?.score === 'number' ? Math.round(scan.score) : null;
  const reportDateStr = new Date(report.created_at as string).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Fetch the markdown content
  let markdownContent: string;
  try {
    const mdRes = await fetch(report.markdown_url as string);
    if (!mdRes.ok) throw new Error(`Failed to fetch markdown: HTTP ${mdRes.status}`);
    markdownContent = await mdRes.text();
  } catch (err) {
    redirect(fallbackUrl);
    return; // unreachable but keeps TypeScript happy
  }

  const destinationLabel = destination.channelName
    ? `${destination.channelName} (${destination.channelId})`
    : destination.channelId;

  const { id: deliveryEventId } = await createStartupSlackDeliveryEvent({
    supabase,
    startupWorkspaceId: workspaceId,
    installationId: destination.installation.id,
    destinationId: destination.id,
    eventType: 'new_audit_ready',
    sentByUserId: user.id,
    payload: {
      startup_workspace_id: workspaceId,
      destination_id: destination.id,
      event_type: 'new_audit_ready',
      site_domain: domainValue,
      score: scoreValue,
      report_id: reportId,
      destination_label: destinationLabel,
      send_type: 'markdown_file',
    },
  });

  try {
    const successRedirect =
      returnTo ??
      `/dashboard/connectors?startupWorkspace=${workspaceId}&status=slack_markdown_ok`;
    await uploadStartupSlackFile({
      destination,
      filename: `geo-pulse-audit-${domainValue}-${reportDateStr.replace(/\s/g, '-')}.md`,
      title: `GEO-Pulse Audit: ${domainValue}${scoreValue != null ? ` — Score ${scoreValue}/100` : ''}`,
      content: markdownContent,
      initialComment: `Audit report for *${domainValue}*${scoreValue != null ? ` · Score: *${scoreValue}/100*` : ''} · ${reportDateStr}`,
    });

    await updateStartupSlackDeliveryEventStatus({
      supabase,
      startupWorkspaceId: workspaceId,
      deliveryEventId,
      status: 'sent',
      response: { destination_label: destinationLabel, send_type: 'markdown_file' },
    });

    structuredLog(
      'startup_slack_markdown_send_succeeded',
      {
        startup_workspace_id: workspaceId,
        report_id: reportId,
        destination_id: destinationId,
        delivery_event_id: deliveryEventId,
        user_id: user.id,
      },
      'info'
    );

    revalidatePath('/dashboard/connectors');
    redirect(successRedirect);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateStartupSlackDeliveryEventStatus({
      supabase,
      startupWorkspaceId: workspaceId,
      deliveryEventId,
      status: 'failed',
      response: { destination_label: destinationLabel },
      errorMessage,
    });
    structuredLog(
      'startup_slack_markdown_send_failed',
      {
        startup_workspace_id: workspaceId,
        report_id: reportId,
        destination_id: destinationId,
        delivery_event_id: deliveryEventId,
        user_id: user.id,
        error_message: errorMessage,
      },
      'warning'
    );
    redirect(fallbackUrl);
  }
}
