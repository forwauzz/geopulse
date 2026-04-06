import { listStartupAgentPrRuns } from '@/lib/server/startup-agent-pr-workflow';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { buildStartupActionBacklog, buildStartupTrendSeries } from '@/lib/server/startup-dashboard-shell';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import { getStartupGithubIntegrationState } from '@/lib/server/startup-github-integration';
import {
  getStartupSlackIntegrationState,
  listStartupSlackDeliveryEvents,
  listStartupSlackDestinations,
} from '@/lib/server/startup-slack-integration';
import type { StartupDashboardTabContext } from '@/app/dashboard/startup/components/startup-tab-types';
import {
  buildStartupImplementationLaneCards,
  getLatestStartupImplementationPlan,
} from '@/lib/server/startup-implementation-plan';
import { resolveStartupDashboardUiGates } from '@/lib/server/startup-service-gates';
import { resolveStartupWorkspaceRolloutFlags } from '@/lib/server/startup-rollout-flags';
import { buildStartupTrackingMetrics } from '@/lib/server/startup-tracking-metrics';
import {
  readGithubStatusMessage,
  readPrStatusMessage,
  readSlackStatusMessage,
} from '@/lib/server/startup-dashboard-status-messages';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import type { StartupWorkspaceSummary } from '@/lib/server/startup-dashboard-data';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StartupDashboardPageLoadResult =
  | { readonly kind: 'no-workspaces' }
  | {
      readonly kind: 'rollout-blocked';
      readonly selectedWorkspace: StartupWorkspaceSummary | null;
    }
  | {
      readonly kind: 'ok';
      readonly tabContext: StartupDashboardTabContext;
    };

type SearchSlice = {
  readonly startupWorkspace?: string;
  readonly github?: string;
  readonly pr?: string;
  readonly slack?: string;
  readonly slack_detail?: string;
};

export async function loadStartupDashboardContext(args: {
  readonly supabase: SupabaseClient;
  readonly userId: string;
  readonly sp: SearchSlice;
}): Promise<StartupDashboardPageLoadResult> {
  const { supabase, userId, sp } = args;

  const dashboard = await getStartupDashboardData({
    supabase,
    userId,
    selectedWorkspaceId: sp.startupWorkspace ?? null,
  });

  if (dashboard.workspaces.length === 0) {
    return { kind: 'no-workspaces' };
  }

  const selectedWorkspace =
    dashboard.workspaces.find((workspace) => workspace.id === dashboard.selectedWorkspaceId) ?? null;
  const canManageSlackAutoPost =
    selectedWorkspace?.role === 'founder' || selectedWorkspace?.role === 'admin';
  const trend = buildStartupTrendSeries(dashboard.scans);
  const backlog = buildStartupActionBacklog(dashboard);
  const metrics = buildStartupTrackingMetrics(dashboard);
  const latestPlan = dashboard.selectedWorkspaceId
    ? await getLatestStartupImplementationPlan({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
      })
    : null;
  const laneCards = buildStartupImplementationLaneCards(latestPlan);
  const env = await getScanApiEnv();
  const serviceSupabase =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : null;
  const startupServiceGates =
    dashboard.selectedWorkspaceId && serviceSupabase
      ? await resolveStartupDashboardUiGates({
          memberSupabase: supabase,
          serviceSupabase,
          startupWorkspaceId: dashboard.selectedWorkspaceId,
          userId,
        })
      : null;
  const startupRolloutFlags = dashboard.selectedWorkspaceId
    ? await resolveStartupWorkspaceRolloutFlags({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
        env,
      })
    : null;
  const githubState = dashboard.selectedWorkspaceId
    ? await getStartupGithubIntegrationState({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
      })
    : { installation: null, repositories: [] };
  const githubAllowlistValue = githubState.repositories.map((repo) => repo.fullName).join('\n');
  const githubStatusMessage = readGithubStatusMessage(sp.github);
  const prStatusMessage = readPrStatusMessage(sp.pr);
  const slackStatusMessage = readSlackStatusMessage(sp.slack, sp.slack_detail);
  const slackState = dashboard.selectedWorkspaceId
    ? await getStartupSlackIntegrationState({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
      })
    : { installations: [] };
  const slackDestinations = dashboard.selectedWorkspaceId
    ? await listStartupSlackDestinations({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
      })
    : [];
  const slackDeliveryEvents = dashboard.selectedWorkspaceId
    ? await listStartupSlackDeliveryEvents({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
        limit: 6,
      })
    : [];
  const slackActiveDestinations = slackDestinations.filter((destination) => destination.status === 'active');
  const slackActiveInstallations = slackState.installations.filter(
    (installation) => installation.status === 'active'
  );
  const prRuns = dashboard.selectedWorkspaceId
    ? await listStartupAgentPrRuns({
        supabase,
        startupWorkspaceId: dashboard.selectedWorkspaceId,
        limit: 8,
      })
    : [];
  const approvedRecommendations = dashboard.recommendations.filter((item) => item.status === 'approved');
  const deliveredReports = dashboard.reports.filter((report) => !!report.emailDeliveredAt).length;
  const openRecommendations =
    metrics.funnel.suggested + metrics.funnel.approved + metrics.funnel.inProgress + metrics.funnel.shipped;
  const averageScore =
    dashboard.scans.filter((scan) => typeof scan.score === 'number').reduce((acc, scan, _, arr) => {
      if (typeof scan.score !== 'number' || arr.length === 0) return acc;
      return acc + scan.score / arr.length;
    }, 0) || null;

  if (startupRolloutFlags && !startupRolloutFlags.startupDashboard) {
    return { kind: 'rollout-blocked', selectedWorkspace };
  }

  const tabContext: StartupDashboardTabContext = {
    dashboard,
    selectedWorkspace,
    startupServiceGates,
    startupRolloutFlags,
    trend,
    backlog,
    metrics,
    latestPlan,
    laneCards,
    prRuns,
    approvedRecommendations,
    deliveredReports,
    openRecommendations,
    averageScore,
    githubState,
    githubAllowlistValue,
    slackState,
    slackDestinations,
    slackDeliveryEvents,
    slackActiveDestinations,
    slackActiveInstallations,
    canManageSlackAutoPost,
    githubStatusMessage,
    prStatusMessage,
    slackStatusMessage,
  };

  return { kind: 'ok', tabContext };
}
