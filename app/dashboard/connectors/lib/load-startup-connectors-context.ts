import { getScanApiEnv } from '@/lib/server/cf-env';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { getStartupGithubIntegrationState } from '@/lib/server/startup-github-integration';
import {
  getStartupSlackIntegrationState,
  listStartupSlackDeliveryEvents,
  listStartupSlackDestinations,
} from '@/lib/server/startup-slack-integration';
import { resolveStartupWorkspaceRolloutFlags } from '@/lib/server/startup-rollout-flags';
import {
  readGithubStatusMessage,
  readSlackStatusMessage,
} from '@/lib/server/startup-dashboard-status-messages';
import { resolveStartupServiceGate } from '@/lib/server/startup-service-gates';
import { resolveStartupWorkspaceBundleKey } from '@/lib/server/startup-github-integration';
import { subscriptionNeedsWorkspaceProvisioning } from '@/lib/server/subscription-provisioning-gap';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import type { SupabaseClient } from '@supabase/supabase-js';

type SearchSlice = {
  readonly startupWorkspace?: string;
  readonly github?: string;
  readonly slack?: string;
  readonly slack_detail?: string;
};

export type StartupConnectorsPageLoadResult =
  | { readonly kind: 'no-workspaces' }
  | {
      readonly kind: 'workspace-provisioning';
      readonly bundleKey: string;
    }
  | {
      readonly kind: 'rollout-blocked';
      readonly selectedWorkspace: { readonly id: string; readonly name: string } | null;
    }
  | {
      readonly kind: 'ok';
      readonly tabContext: {
        readonly dashboard: Awaited<ReturnType<typeof getStartupDashboardData>>;
        readonly selectedWorkspace: { readonly id: string; readonly name: string; readonly role?: string } | null;
        readonly startupServiceGates:
          | {
              readonly githubIntegration: Awaited<ReturnType<typeof resolveStartupServiceGate>>;
              readonly slackIntegration: Awaited<ReturnType<typeof resolveStartupServiceGate>>;
            }
          | null;
        readonly startupRolloutFlags: Awaited<ReturnType<typeof resolveStartupWorkspaceRolloutFlags>> | null;
        readonly githubState: Awaited<ReturnType<typeof getStartupGithubIntegrationState>>;
        readonly githubAllowlistValue: string;
        readonly slackState: Awaited<ReturnType<typeof getStartupSlackIntegrationState>>;
        readonly slackDestinations: Awaited<ReturnType<typeof listStartupSlackDestinations>>;
        readonly slackDeliveryEvents: Awaited<ReturnType<typeof listStartupSlackDeliveryEvents>>;
        readonly slackActiveDestinations: Awaited<ReturnType<typeof listStartupSlackDestinations>>;
        readonly slackActiveInstallations: Awaited<
          ReturnType<typeof getStartupSlackIntegrationState>
        >['installations'];
        readonly canManageSlackAutoPost: boolean;
        readonly githubStatusMessage: ReturnType<typeof readGithubStatusMessage>;
        readonly slackStatusMessage: ReturnType<typeof readSlackStatusMessage>;
      };
    };

export async function loadStartupConnectorsContext(args: {
  readonly supabase: SupabaseClient;
  readonly userId: string;
  readonly sp: SearchSlice;
}): Promise<StartupConnectorsPageLoadResult> {
  const { supabase, userId, sp } = args;

  const dashboard = await getStartupDashboardData({
    supabase,
    userId,
    selectedWorkspaceId: sp.startupWorkspace ?? null,
  });

  if (dashboard.workspaces.length === 0) {
    const { data: subscriptions } = await supabase
      .from('user_subscriptions')
      .select('bundle_key,status,startup_workspace_id,agency_account_id')
      .eq('user_id', userId);

    const pending = (subscriptions ?? []).find(subscriptionNeedsWorkspaceProvisioning);
    if (pending) {
      return { kind: 'workspace-provisioning', bundleKey: pending.bundle_key };
    }

    return { kind: 'no-workspaces' };
  }

  const selectedWorkspace =
    dashboard.workspaces.find((workspace) => workspace.id === dashboard.selectedWorkspaceId) ?? null;
  const canManageSlackAutoPost =
    selectedWorkspace?.role === 'founder' || selectedWorkspace?.role === 'admin';
  const workspaceId = dashboard.selectedWorkspaceId;

  const env = await getScanApiEnv();
  const serviceSupabase =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : null;

  const startupRolloutFlags = workspaceId
    ? await resolveStartupWorkspaceRolloutFlags({
        supabase,
        startupWorkspaceId: workspaceId,
        env,
      })
    : null;

  if (startupRolloutFlags && !startupRolloutFlags.startupDashboard) {
    return {
      kind: 'rollout-blocked',
      selectedWorkspace: selectedWorkspace
        ? { id: selectedWorkspace.id, name: selectedWorkspace.name }
        : null,
    };
  }

  const githubStatusMessage = readGithubStatusMessage(sp.github);
  const slackStatusMessage = readSlackStatusMessage(sp.slack, sp.slack_detail);

  const githubState = workspaceId
    ? await getStartupGithubIntegrationState({
        supabase,
        startupWorkspaceId: workspaceId,
      })
    : { installation: null, repositories: [] };
  const githubAllowlistValue = githubState.repositories.map((repo) => repo.fullName).join('\n');

  const slackState = workspaceId
    ? await getStartupSlackIntegrationState({
        supabase,
        startupWorkspaceId: workspaceId,
      })
    : { installations: [] };

  const [slackDestinations, slackDeliveryEvents] = workspaceId
    ? await Promise.all([
        listStartupSlackDestinations({
          supabase,
          startupWorkspaceId: workspaceId,
        }),
        listStartupSlackDeliveryEvents({
          supabase,
          startupWorkspaceId: workspaceId,
          limit: 6,
        }),
      ])
    : [[], []];

  const slackActiveDestinations = slackDestinations.filter((destination) => destination.status === 'active');
  const slackActiveInstallations = slackState.installations.filter(
    (installation) => installation.status === 'active'
  );

  const startupServiceGates =
    workspaceId && serviceSupabase
      ? await (async () => {
          const bundleKey = await resolveStartupWorkspaceBundleKey({
            memberSupabase: supabase as any,
            serviceSupabase,
            startupWorkspaceId: workspaceId,
          });
          const [githubIntegration, slackIntegration] = await Promise.all([
            resolveStartupServiceGate({
              memberSupabase: supabase as any,
              serviceSupabase,
              startupWorkspaceId: workspaceId,
              userId,
              serviceKey: 'github_integration',
              bundleKey,
            }),
            resolveStartupServiceGate({
              memberSupabase: supabase as any,
              serviceSupabase,
              startupWorkspaceId: workspaceId,
              userId,
              serviceKey: 'slack_integration',
              bundleKey,
            }),
          ]);
          return { githubIntegration, slackIntegration } as const;
        })()
      : null;

  return {
    kind: 'ok',
    tabContext: {
      dashboard,
      selectedWorkspace,
      startupServiceGates,
      startupRolloutFlags,
      githubState,
      githubAllowlistValue,
      slackState,
      slackDestinations,
      slackDeliveryEvents,
      slackActiveDestinations,
      slackActiveInstallations,
      canManageSlackAutoPost,
      githubStatusMessage,
      slackStatusMessage,
    },
  };
}

