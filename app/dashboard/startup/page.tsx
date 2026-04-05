import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  beginStartupGithubInstall,
  beginStartupSlackInstall,
  disconnectStartupSlack,
  sendStartupReportToSlack,
  saveStartupSlackDestination,
  updateStartupSlackAutoPostSetting,
  disconnectStartupGithub,
  markStartupPrRunFailedAction,
  markStartupPrRunMergedAction,
  markStartupPrRunOpenedAction,
  queueStartupRecommendationPrRunAction,
  saveStartupGithubAllowlist,
} from '@/app/dashboard/startup/actions';
import { listStartupAgentPrRuns } from '@/lib/server/startup-agent-pr-workflow';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { buildStartupActionBacklog, buildStartupTrendSeries } from '@/lib/server/startup-dashboard-shell';
import { getStartupDashboardData } from '@/lib/server/startup-dashboard-data';
import {
  getStartupGithubIntegrationState,
} from '@/lib/server/startup-github-integration';
import {
  getStartupSlackIntegrationState,
  listStartupSlackDeliveryEvents,
  listStartupSlackDestinations,
} from '@/lib/server/startup-slack-integration';
import {
  buildStartupImplementationLaneCards,
  getLatestStartupImplementationPlan,
} from '@/lib/server/startup-implementation-plan';
import { resolveStartupDashboardUiGates } from '@/lib/server/startup-service-gates';
import { resolveStartupWorkspaceRolloutFlags } from '@/lib/server/startup-rollout-flags';
import { buildStartupTrackingMetrics } from '@/lib/server/startup-tracking-metrics';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    startupWorkspace?: string;
    github?: string;
    pr?: string;
    slack?: string;
    slack_detail?: string;
  }>;
};

function buildStartupHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/startup?${query}` : '/dashboard/startup';
}

function buildNewScanHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

function trendPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / spread) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function readGithubStatusMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'github_connected':
      return 'GitHub installation connected for this workspace.';
    case 'github_disconnected':
      return 'GitHub integration disconnected.';
    case 'github_repos_saved':
      return 'Repository allowlist saved.';
    case 'github_invalid_repos':
      return 'One or more repository slugs were invalid. Use owner/repo format.';
    case 'github_not_entitled':
      return 'GitHub integration is disabled for this workspace bundle.';
    case 'github_rollout_disabled':
      return 'GitHub integration is disabled by startup rollout flags for this workspace.';
    case 'github_billing_blocked':
      return 'GitHub integration is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'github_install_url_missing':
      return 'GitHub install URL is not configured yet.';
    case 'github_callback_invalid':
    case 'github_state_invalid':
      return 'GitHub callback could not be validated. Retry connect.';
    case 'github_env_missing':
      return 'Server env is missing GitHub integration credentials.';
    default:
      return null;
  }
}

function readPrStatusMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'pr_queued':
      return 'PR execution run queued from approved recommendation.';
    case 'pr_opened':
      return 'PR run marked as opened and recommendation moved to shipped.';
    case 'pr_merged':
      return 'PR run marked merged and recommendation moved to validated.';
    case 'pr_failed':
      return 'PR run marked failed and recommendation moved to failed.';
    case 'pr_not_entitled':
      return 'PR workflow is disabled for this workspace bundle.';
    case 'pr_rollout_disabled':
      return 'PR workflow is disabled by startup rollout flags for this workspace.';
    case 'pr_suggest_only':
      return 'Auto-PR is in suggest-only mode for this workspace. Recommendation approval is still available.';
    case 'pr_billing_blocked':
      return 'PR workflow is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'pr_env_missing':
      return 'Server env is missing required integration keys for PR workflow.';
    default:
      return null;
  }
}

function readSlackStatusMessage(code: string | undefined, detail?: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'slack_connected':
      return 'Slack workspace connected.';
    case 'slack_disconnected':
      return 'Slack workspace disconnected.';
    case 'slack_not_entitled':
      return 'Slack integration is disabled for this workspace bundle.';
    case 'slack_rollout_disabled':
      return 'Slack integration is disabled by startup rollout flags for this workspace.';
    case 'slack_billing_blocked':
      return 'Slack integration is currently paid-only for this workspace. Ask an admin to enable billing or switch service mode.';
    case 'slack_install_url_missing':
      return 'Slack install URL is not configured yet.';
    case 'slack_client_id_missing':
      return 'Slack client ID is not configured in runtime secrets.';
    case 'slack_callback_invalid': {
      const base = 'Slack callback could not be validated. Retry connect.';
      if (!detail) return base;
      const hints: Record<string, string> = {
        missing_oauth_code:
          'Slack did not return an authorization code. Start again from Connect Slack and finish with Allow.',
        missing_client_id: 'Server is missing Slack client ID.',
        missing_client_secret: 'Server is missing Slack client secret.',
        bad_redirect_uri:
          'Slack rejected the token exchange: redirect URL must exactly match https://getgeopulse.com/api/startup/slack/callback in the Slack app Redirect URLs.',
        invalid_client:
          'Slack rejected client credentials. Use App Credentials → Client Secret (not Signing Secret), matching this Slack app.',
        invalid_code:
          'Authorization code was invalid or expired. Click Connect Slack once and complete Allow without refreshing.',
        code_already_used: 'That authorization code was already used. Click Connect Slack again.',
        missing_team_after_exchange:
          'Slack approved the install but no workspace id was returned. If this is an Enterprise Grid app, contact support.',
        slack_http_not_ok: 'Slack token HTTP request failed. Retry or check Slack status.',
        slack_json_parse_failed: 'Slack returned an unexpected response during token exchange.',
        slack_ok_false: 'Slack token exchange failed without a specific error code.',
      };
      const hint = hints[detail] ?? `Detail: ${detail}.`;
      return `${base} ${hint}`;
    }
    case 'slack_state_invalid':
      return 'Slack callback state is invalid or expired. Retry connect.';
    case 'slack_env_missing':
      return 'Server env is missing Slack integration credentials.';
    case 'slack_oauth_denied':
      return 'Slack authorization was cancelled.';
    case 'slack_destination_saved':
      return 'Slack destination saved.';
    case 'slack_destination_invalid':
      return 'Slack destination requires workspace, install, and channel values.';
    case 'slack_send_ok':
      return 'Report sent to Slack.';
    case 'slack_send_failed':
      return 'Slack send failed. Reconnect Slack or verify destination channel access.';
    case 'slack_send_invalid':
      return 'Slack send requires workspace, report, and destination.';
    case 'slack_destination_missing':
      return 'Selected Slack destination was not found.';
    case 'slack_report_missing':
      return 'Selected report was not found for this workspace.';
    case 'slack_auto_post_updated':
      return 'Slack auto-post setting updated.';
    default:
      return null;
  }
}

export default async function StartupDashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/startup');
  }

  const dashboard = await getStartupDashboardData({
    supabase,
    userId: user.id,
    selectedWorkspaceId: sp.startupWorkspace ?? null,
  });

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
          userId: user.id,
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

  if (dashboard.workspaces.length === 0) {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">No startup workspace found</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Ask an admin to create your startup workspace in <code>/dashboard/startups</code>.
        </p>
      </section>
    );
  }

  if (startupRolloutFlags && !startupRolloutFlags.startupDashboard) {
    return (
      <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {selectedWorkspace?.name ?? 'Startup workspace'}
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          This workspace is currently outside beta rollout. Ask an admin to enable <code>startup_dashboard</code> rollout flag.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {selectedWorkspace?.name ?? 'Startup workspace'}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Action-only tracking for founder and team implementation workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildNewScanHref(dashboard.selectedWorkspaceId)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            New startup scan
          </Link>
          <Link
            href={
              dashboard.selectedWorkspaceId ? `/dashboard?startupWorkspace=${dashboard.selectedWorkspaceId}` : '/dashboard'
            }
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {dashboard.workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            href={buildStartupHref(workspace.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              workspace.id === dashboard.selectedWorkspaceId
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {workspace.name}
          </Link>
        ))}
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Scans</p>
          <p className="mt-1 text-2xl font-bold">{dashboard.scans.length}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Average score</p>
          <p className="mt-1 text-2xl font-bold">
            {averageScore != null ? `${Math.round(averageScore)}/100` : '-'}
          </p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Recommendations</p>
          <p className="mt-1 text-2xl font-bold">{dashboard.recommendations.length}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Open recommendations</p>
          <p className="mt-1 text-2xl font-bold">{openRecommendations}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
          <h2 className="text-lg font-semibold">Score trend</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Track score direction before and after implementation pushes.</p>
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-3">
            {trend.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No scored scans yet.</p>
            ) : (
              <svg viewBox="0 0 240 80" className="h-24 w-full text-primary">
                <path d={trendPath(trend.map((point) => point.score), 240, 80)} fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-on-surface-variant">
            {trend.map((point) => (
              <span key={`${point.label}-${point.score}`} className="rounded-md bg-surface-container-high px-2 py-1">
                {point.label}: {point.score}
              </span>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
          <h2 className="text-lg font-semibold">Action backlog</h2>
          <p className="mt-1 text-sm text-on-surface-variant">No fluff. Items here are implementation-ready.</p>
          <ul className="mt-4 space-y-3">
            {backlog.map((item) => (
              <li key={item.key} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${
                      item.priority === 'high' ? 'bg-rose-400/20 text-rose-300' : 'bg-amber-300/20 text-amber-200'
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{item.detail}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
          <h2 className="text-lg font-semibold">Implementation lane</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Team-lane plan generated from markdown audits.
          </p>
          <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
            {!latestPlan ? (
              <p className="text-sm text-on-surface-variant">No generated implementation plan yet.</p>
            ) : (
              <>
                <p className="text-xs text-on-surface-variant">
                  Plan source: {latestPlan.sourceRef ?? 'manual'} • {latestPlan.status}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {laneCards.map((card) => (
                    <div key={card.lane} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                      <p className="font-semibold capitalize">{card.lane.replace('_', ' ')}</p>
                      <p className="text-xs text-on-surface-variant">
                        Open {card.open} • Done {card.done} • Total {card.total}
                      </p>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {latestPlan.tasks.slice(0, 6).map((task) => (
                    <li key={task.id} className="rounded-lg bg-surface-container-low px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{task.title}</p>
                        <span className="text-xs uppercase tracking-wider text-on-surface-variant">{task.teamLane}</span>
                      </div>
                      {task.detail ? <p className="mt-1 text-xs text-on-surface-variant">{task.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Open load over time</p>
            {metrics.burnDown.length === 0 ? (
              <p className="mt-2 text-sm text-on-surface-variant">No implementation events recorded yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {metrics.burnDown.map((point) => (
                  <li key={point.label} className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                    <span className="text-on-surface">{point.label}</span>
                    <span className="font-semibold">{point.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
          <h2 className="text-lg font-semibold">PR activity</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Recommendation lifecycle funnel and score windows for execution tracking.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Funnel</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-surface-container-low px-3 py-2">Suggested: {metrics.funnel.suggested}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">Approved: {metrics.funnel.approved}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">In progress: {metrics.funnel.inProgress}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">Shipped: {metrics.funnel.shipped}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">Validated: {metrics.funnel.validated}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">Failed: {metrics.funnel.failed}</div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Impact windows (avg score)</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-md bg-surface-container-low px-3 py-2">7d: {metrics.impactWindows.d7 ?? '-'}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">14d: {metrics.impactWindows.d14 ?? '-'}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">30d: {metrics.impactWindows.d30 ?? '-'}</div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Audit delivery context</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-surface-container-low px-3 py-2">Deep audits: {dashboard.reports.length}</div>
                <div className="rounded-md bg-surface-container-low px-3 py-2">Delivered: {deliveredReports}</div>
              </div>
              {dashboard.selectedWorkspaceId &&
              startupRolloutFlags?.slackAgent &&
              startupServiceGates?.slackIntegration.enabled &&
              startupServiceGates?.slackNotifications.enabled ? (
                <form action={sendStartupReportToSlack} className="mt-3 grid gap-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <select
                    name="reportId"
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    defaultValue={dashboard.reports[0]?.id ?? ''}
                  >
                    {dashboard.reports.length === 0 ? (
                      <option value="">No reports available</option>
                    ) : (
                      dashboard.reports.map((report) => (
                        <option key={report.id} value={report.id}>
                          {report.type} · {new Date(report.createdAt).toLocaleDateString()}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    name="destinationId"
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    defaultValue={slackActiveDestinations[0]?.id ?? ''}
                  >
                    {slackActiveDestinations.length === 0 ? (
                      <option value="">No active Slack destinations</option>
                    ) : (
                      slackActiveDestinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.channelName ?? destination.channelId}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    name="eventType"
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    defaultValue="new_audit_ready"
                  >
                    <option value="new_audit_ready">new_audit_ready</option>
                    <option value="plan_ready">plan_ready</option>
                  </select>
                  <button
                    type="submit"
                    disabled={dashboard.reports.length === 0 || slackActiveDestinations.length === 0}
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send report to Slack
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-on-surface-variant">
                  Slack manual send requires rollout + entitlement gates and at least one active destination.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Agent PR workflow</p>
              {prStatusMessage ? (
                <p className="mt-2 rounded-md bg-surface-container-low px-3 py-2 text-xs text-on-surface">{prStatusMessage}</p>
              ) : null}
              {dashboard.selectedWorkspaceId &&
              startupRolloutFlags?.autoPr &&
              startupServiceGates?.githubIntegration.enabled &&
              startupServiceGates?.agentPrExecution.enabled &&
              githubState.repositories.length > 0 ? (
                <form action={queueStartupRecommendationPrRunAction} className="mt-2 grid gap-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <select
                    name="recommendationId"
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    defaultValue={approvedRecommendations[0]?.id ?? ''}
                  >
                    {approvedRecommendations.length === 0 ? (
                      <option value="">No approved recommendations</option>
                    ) : (
                      approvedRecommendations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    name="repoFullName"
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                    defaultValue={githubState.repositories[0]?.fullName ?? ''}
                  >
                    {githubState.repositories.map((repo) => (
                      <option key={repo.id} value={repo.fullName}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={approvedRecommendations.length === 0}
                    className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Queue PR run
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-on-surface-variant">
                  {!startupRolloutFlags?.githubAgent
                    ? 'GitHub agent is disabled by rollout flags for this workspace.'
                    : startupServiceGates?.agentPrExecution.enabled
                    ? startupRolloutFlags?.autoPr
                      ? 'Connect GitHub and configure allowlist to start PR workflow.'
                      : 'Auto-PR is currently in suggest-only mode for this workspace.'
                    : 'PR workflow is currently disabled by entitlement or billing settings.'}
                </p>
              )}
              <ul className="mt-3 space-y-2 text-xs">
                {prRuns.length === 0 ? (
                  <li className="rounded-md bg-surface-container-low px-3 py-2 text-on-surface-variant">No PR runs yet.</li>
                ) : (
                  prRuns.map((run) => (
                    <li key={run.id} className="rounded-md bg-surface-container-low px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-on-surface">
                          {run.repositoryOwner}/{run.repositoryName}
                        </span>
                        <span className="uppercase tracking-wide text-on-surface-variant">{run.status}</span>
                      </div>
                      <div className="mt-1 text-on-surface-variant">
                        {run.pullRequestUrl ? (
                          <a href={run.pullRequestUrl} target="_blank" rel="noreferrer" className="underline">
                            {run.pullRequestUrl}
                          </a>
                        ) : (
                          'No PR URL yet'
                        )}
                      </div>
                      {dashboard.selectedWorkspaceId &&
                      (run.status === 'running' || run.status === 'queued' || run.status === 'pr_opened') ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(run.status === 'running' || run.status === 'queued') && (
                            <form action={markStartupPrRunOpenedAction} className="flex flex-wrap gap-2">
                              <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                              <input type="hidden" name="runId" value={run.id} />
                              <input
                                name="pullRequestNumber"
                                placeholder="PR #"
                                className="w-16 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] text-on-surface"
                              />
                              <input
                                name="pullRequestUrl"
                                placeholder="https://github.com/owner/repo/pull/123"
                                className="w-56 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] text-on-surface"
                              />
                              <button
                                type="submit"
                                className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface"
                              >
                                Mark opened
                              </button>
                            </form>
                          )}
                          {run.status === 'pr_opened' && (
                            <form action={markStartupPrRunMergedAction}>
                              <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                              <input type="hidden" name="runId" value={run.id} />
                              <button
                                type="submit"
                                className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface"
                              >
                                Mark merged
                              </button>
                            </form>
                          )}
                          <form action={markStartupPrRunFailedAction} className="flex flex-wrap gap-2">
                            <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                            <input type="hidden" name="runId" value={run.id} />
                            <input
                              name="errorMessage"
                              placeholder="failure reason"
                              className="w-40 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] text-on-surface"
                            />
                            <button
                              type="submit"
                              className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface"
                            >
                              Mark failed
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">GitHub integration</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Connect one GitHub App installation and keep an explicit repo allowlist for agent execution scope.
          </p>
          {githubStatusMessage ? (
            <p className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
              {githubStatusMessage}
            </p>
          ) : null}
          {!dashboard.selectedWorkspaceId ? null : !startupRolloutFlags?.githubAgent ? (
            <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
              GitHub integration is currently disabled by rollout flags for this workspace.
            </div>
          ) : !startupServiceGates?.githubIntegration.enabled ? (
            <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {startupServiceGates?.githubIntegration.blockedReason === 'workspace_requires_paid_mode' ||
              startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_missing' ||
              startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_inactive'
                ? 'GitHub integration is currently blocked by billing configuration for this workspace.'
                : 'GitHub integration is disabled for this workspace bundle.'}
              <br />
              Bundle:{' '}
              <span className="font-medium text-on-surface">
                {startupServiceGates?.githubIntegration.bundleKey ?? 'unknown'}
              </span>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
                <p className="mt-2 text-sm">
                  Status:{' '}
                  <span className="font-semibold text-on-surface">
                    {githubState.installation?.status ?? 'disconnected'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Installation ID: {githubState.installation?.installationId ?? '-'}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Account: {githubState.installation?.accountLogin ?? '-'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={beginStartupGithubInstall}>
                    <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                    <button
                      type="submit"
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                    >
                      {githubState.installation?.status === 'connected' ? 'Reconnect GitHub' : 'Connect GitHub'}
                    </button>
                  </form>
                  {githubState.installation ? (
                    <form action={disconnectStartupGithub}>
                      <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                      <button
                        type="submit"
                        className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                      >
                        Disconnect
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Repository allowlist</p>
                <p className="mt-2 text-xs text-on-surface-variant">
                  One <code>owner/repo</code> per line. Agent PR execution is limited to this list.
                </p>
                <form action={saveStartupGithubAllowlist} className="mt-3 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <textarea
                    name="repoAllowlist"
                    defaultValue={githubAllowlistValue}
                    rows={5}
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none ring-emerald-300/40 transition focus:ring"
                    placeholder="acme/geo-pulse&#10;acme/marketing-site"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                  >
                    Save allowlist
                  </button>
                </form>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Slack integration</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Connect Slack workspaces and map delivery channels for startup reports.
          </p>
          {slackStatusMessage ? (
            <p className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface">
              {slackStatusMessage}
            </p>
          ) : null}
          {!dashboard.selectedWorkspaceId ? null : !startupRolloutFlags?.slackAgent ? (
            <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
              Slack integration is currently disabled by rollout flags for this workspace.
            </div>
          ) : !startupServiceGates?.slackIntegration.enabled ? (
            <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
              {startupServiceGates?.slackIntegration.blockedReason === 'workspace_requires_paid_mode' ||
              startupServiceGates?.slackIntegration.blockedReason === 'stripe_mapping_missing' ||
              startupServiceGates?.slackIntegration.blockedReason === 'stripe_mapping_inactive'
                ? 'Slack integration is currently blocked by billing configuration for this workspace.'
                : 'Slack integration is disabled for this workspace bundle.'}
              <br />
              Bundle:{' '}
              <span className="font-medium text-on-surface">
                {startupServiceGates?.slackIntegration.bundleKey ?? 'unknown'}
              </span>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connection</p>
                <p className="mt-2 text-xs text-on-surface-variant">
                  Connect one or more Slack workspaces. Channel destination setup comes next.
                </p>
                <form action={beginStartupSlackInstall} className="mt-3">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
                  >
                    Connect Slack
                  </button>
                </form>
              </div>
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Auto-post mode</p>
                <p className="mt-2 text-xs text-on-surface-variant">
                  Keep this off by default. Enable only when your team wants automatic Slack posting in later slices.
                </p>
                {canManageSlackAutoPost ? (
                  <form action={updateStartupSlackAutoPostSetting} className="mt-3 space-y-2">
                    <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId ?? ''} />
                    <label className="flex items-center gap-2 text-xs text-on-surface">
                      <input
                        type="checkbox"
                        name="slackAutoPostEnabled"
                        defaultChecked={startupRolloutFlags?.slackAutoPost ?? false}
                        className="h-4 w-4 rounded border-outline-variant"
                      />
                      Enable workspace Slack auto-post
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                    >
                      Save auto-post setting
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-on-surface-variant">
                    Founder or admin role required to change auto-post mode.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Connected workspaces</p>
                {slackState.installations.length === 0 ? (
                  <p className="mt-2 text-sm text-on-surface-variant">No Slack workspaces connected yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-on-surface">
                    {slackState.installations.map((installation) => (
                      <li
                        key={installation.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-on-surface">
                            {installation.slackTeamName ?? installation.slackTeamId}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            Team ID: {installation.slackTeamId}
                            {installation.slackTeamDomain ? ` · ${installation.slackTeamDomain}.slack.com` : ''}
                            {` · ${installation.status}`}
                          </p>
                        </div>
                        {installation.status === 'active' ? (
                          <form action={disconnectStartupSlack}>
                            <input
                              type="hidden"
                              name="startupWorkspaceId"
                              value={dashboard.selectedWorkspaceId ?? ''}
                            />
                            <input type="hidden" name="installationId" value={installation.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                            >
                              Disconnect
                            </button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Destination channels</p>
                {slackDestinations.length === 0 ? (
                  <p className="mt-2 text-sm text-on-surface-variant">No destination channels configured yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-on-surface">
                    {slackDestinations.map((destination) => (
                      <li
                        key={destination.id}
                        className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
                      >
                        <p className="font-medium text-on-surface">
                          {destination.channelName ?? destination.channelId}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Channel ID: {destination.channelId}
                          {destination.isDefaultDestination ? ' · default' : ''}
                          {` · ${destination.status}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {slackActiveInstallations.length > 0 ? (
                  <form action={saveStartupSlackDestination} className="mt-4 grid gap-2 md:grid-cols-2">
                    <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId ?? ''} />
                    <label className="text-xs text-on-surface-variant">
                      Workspace
                      <select
                        name="installationId"
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                        defaultValue={slackActiveInstallations[0]?.id ?? ''}
                      >
                        {slackActiveInstallations.map((installation) => (
                          <option key={installation.id} value={installation.id}>
                            {installation.slackTeamName ?? installation.slackTeamId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-on-surface-variant">
                      Channel ID
                      <input
                        name="channelId"
                        placeholder="C0123456789"
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                      />
                    </label>
                    <label className="text-xs text-on-surface-variant md:col-span-2">
                      Channel name (optional)
                      <input
                        name="channelName"
                        placeholder="#geo-audits"
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-on-surface md:col-span-2">
                      <input type="checkbox" name="isDefaultDestination" className="h-4 w-4 rounded border-outline-variant" />
                      Set as default Slack destination
                    </label>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
                      >
                        Save destination
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-on-surface-variant">
                    Connect at least one active Slack workspace before adding destination channels.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Recent delivery attempts</p>
                {slackDeliveryEvents.length === 0 ? (
                  <p className="mt-2 text-sm text-on-surface-variant">No Slack delivery attempts yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-on-surface">
                    {slackDeliveryEvents.map((event) => (
                      <li key={event.id} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                        <p className="font-medium text-on-surface">
                          {event.eventType} · {event.status}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {new Date(event.createdAt).toLocaleString()}
                          {event.errorMessage ? ` · ${event.errorMessage}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}





