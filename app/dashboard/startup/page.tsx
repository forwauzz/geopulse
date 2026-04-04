import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  beginStartupGithubInstall,
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
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">No startup workspace found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Ask an admin to create your startup workspace in <code>/dashboard/startups</code>.
        </p>
      </section>
    );
  }

  if (startupRolloutFlags && !startupRolloutFlags.startupDashboard) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Startup dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {selectedWorkspace?.name ?? 'Startup workspace'}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          This workspace is currently outside beta rollout. Ask an admin to enable <code>startup_dashboard</code> rollout flag.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Startup dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {selectedWorkspace?.name ?? 'Startup workspace'}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Action-only tracking for founder and team implementation workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildNewScanHref(dashboard.selectedWorkspaceId)}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
          >
            New startup scan
          </Link>
          <Link
            href={
              dashboard.selectedWorkspaceId ? `/dashboard?startupWorkspace=${dashboard.selectedWorkspaceId}` : '/dashboard'
            }
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
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
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {workspace.name}
          </Link>
        ))}
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Scans</p>
          <p className="mt-1 text-2xl font-bold">{dashboard.scans.length}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Average score</p>
          <p className="mt-1 text-2xl font-bold">
            {averageScore != null ? `${Math.round(averageScore)}/100` : '-'}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Recommendations</p>
          <p className="mt-1 text-2xl font-bold">{dashboard.recommendations.length}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Open recommendations</p>
          <p className="mt-1 text-2xl font-bold">{openRecommendations}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">Score trend</h2>
          <p className="mt-1 text-sm text-zinc-400">Track score direction before and after implementation pushes.</p>
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            {trend.length === 0 ? (
              <p className="text-sm text-zinc-500">No scored scans yet.</p>
            ) : (
              <svg viewBox="0 0 240 80" className="h-24 w-full">
                <path d={trendPath(trend.map((point) => point.score), 240, 80)} fill="none" stroke="#34d399" strokeWidth="3" />
              </svg>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            {trend.map((point) => (
              <span key={`${point.label}-${point.score}`} className="rounded-md bg-zinc-800 px-2 py-1">
                {point.label}: {point.score}
              </span>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">Action backlog</h2>
          <p className="mt-1 text-sm text-zinc-400">No fluff. Items here are implementation-ready.</p>
          <ul className="mt-4 space-y-3">
            {backlog.map((item) => (
              <li key={item.key} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
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
                <p className="mt-1 text-xs text-zinc-400">{item.detail}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">Implementation lane</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Team-lane plan generated from markdown audits.
          </p>
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            {!latestPlan ? (
              <p className="text-sm text-zinc-500">No generated implementation plan yet.</p>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  Plan source: {latestPlan.sourceRef ?? 'manual'} • {latestPlan.status}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {laneCards.map((card) => (
                    <div key={card.lane} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm">
                      <p className="font-semibold capitalize">{card.lane.replace('_', ' ')}</p>
                      <p className="text-xs text-zinc-400">
                        Open {card.open} • Done {card.done} • Total {card.total}
                      </p>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {latestPlan.tasks.slice(0, 6).map((task) => (
                    <li key={task.id} className="rounded-lg bg-zinc-900 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{task.title}</p>
                        <span className="text-xs uppercase tracking-wider text-zinc-400">{task.teamLane}</span>
                      </div>
                      {task.detail ? <p className="mt-1 text-xs text-zinc-400">{task.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Open load over time</p>
            {metrics.burnDown.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No implementation events recorded yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {metrics.burnDown.map((point) => (
                  <li key={point.label} className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2">
                    <span className="text-zinc-300">{point.label}</span>
                    <span className="font-semibold">{point.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">PR activity</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Recommendation lifecycle funnel and score windows for execution tracking.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Funnel</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-zinc-900 px-3 py-2">Suggested: {metrics.funnel.suggested}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">Approved: {metrics.funnel.approved}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">In progress: {metrics.funnel.inProgress}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">Shipped: {metrics.funnel.shipped}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">Validated: {metrics.funnel.validated}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">Failed: {metrics.funnel.failed}</div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Impact windows (avg score)</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-zinc-900 px-3 py-2">7d: {metrics.impactWindows.d7 ?? '-'}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">14d: {metrics.impactWindows.d14 ?? '-'}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">30d: {metrics.impactWindows.d30 ?? '-'}</div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Audit delivery context</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-zinc-900 px-3 py-2">Deep audits: {dashboard.reports.length}</div>
                <div className="rounded-md bg-zinc-900 px-3 py-2">Delivered: {deliveredReports}</div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Agent PR workflow</p>
              {prStatusMessage ? (
                <p className="mt-2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{prStatusMessage}</p>
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
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
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
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
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
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Queue PR run
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
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
                  <li className="rounded-md bg-zinc-900 px-3 py-2 text-zinc-500">No PR runs yet.</li>
                ) : (
                  prRuns.map((run) => (
                    <li key={run.id} className="rounded-md bg-zinc-900 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-200">
                          {run.repositoryOwner}/{run.repositoryName}
                        </span>
                        <span className="uppercase tracking-wide text-zinc-400">{run.status}</span>
                      </div>
                      <div className="mt-1 text-zinc-400">
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
                                className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100"
                              />
                              <input
                                name="pullRequestUrl"
                                placeholder="https://github.com/owner/repo/pull/123"
                                className="w-56 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100"
                              />
                              <button
                                type="submit"
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-zinc-100"
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
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-zinc-100"
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
                              className="w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100"
                            />
                            <button
                              type="submit"
                              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-zinc-100"
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

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">GitHub integration</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Connect one GitHub App installation and keep an explicit repo allowlist for agent execution scope.
          </p>
          {githubStatusMessage ? (
            <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
              {githubStatusMessage}
            </p>
          ) : null}
          {!dashboard.selectedWorkspaceId ? null : !startupRolloutFlags?.githubAgent ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              GitHub integration is currently disabled by rollout flags for this workspace.
            </div>
          ) : !startupServiceGates?.githubIntegration.enabled ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              {startupServiceGates?.githubIntegration.blockedReason === 'workspace_requires_paid_mode' ||
              startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_missing' ||
              startupServiceGates?.githubIntegration.blockedReason === 'stripe_mapping_inactive'
                ? 'GitHub integration is currently blocked by billing configuration for this workspace.'
                : 'GitHub integration is disabled for this workspace bundle.'}
              <br />
              Bundle:{' '}
              <span className="font-medium text-zinc-200">
                {startupServiceGates?.githubIntegration.bundleKey ?? 'unknown'}
              </span>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Connection</p>
                <p className="mt-2 text-sm">
                  Status:{' '}
                  <span className="font-semibold text-zinc-100">
                    {githubState.installation?.status ?? 'disconnected'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Installation ID: {githubState.installation?.installationId ?? '-'}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Account: {githubState.installation?.accountLogin ?? '-'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={beginStartupGithubInstall}>
                    <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-300"
                    >
                      {githubState.installation?.status === 'connected' ? 'Reconnect GitHub' : 'Connect GitHub'}
                    </button>
                  </form>
                  {githubState.installation ? (
                    <form action={disconnectStartupGithub}>
                      <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                      <button
                        type="submit"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800"
                      >
                        Disconnect
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Repository allowlist</p>
                <p className="mt-2 text-xs text-zinc-400">
                  One <code>owner/repo</code> per line. Agent PR execution is limited to this list.
                </p>
                <form action={saveStartupGithubAllowlist} className="mt-3 space-y-2">
                  <input type="hidden" name="startupWorkspaceId" value={dashboard.selectedWorkspaceId} />
                  <textarea
                    name="repoAllowlist"
                    defaultValue={githubAllowlistValue}
                    rows={5}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none ring-emerald-300/40 transition focus:ring"
                    placeholder="acme/geo-pulse&#10;acme/marketing-site"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800"
                  >
                    Save allowlist
                  </button>
                </form>
              </div>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
