import Link from 'next/link';
import {
  blockStartupManualTaskAction,
  completeStartupManualTaskAction,
  markStartupPrRunFailedAction,
  markStartupPrRunMergedAction,
  markStartupPrRunOpenedAction,
  queueStartupRecommendationPrRunAction,
} from '@/app/dashboard/startup/actions';
import type { StartupOverviewStatStripProps, StartupOverviewTabProps } from './startup-tab-types';

function newScanHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  const query = params.toString();
  return query ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

function auditsTabHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  params.set('tab', 'audits');
  const query = params.toString();
  return `/dashboard/startup?${query}`;
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

function formatDelta(current: number | null | undefined, previous: number | null | undefined): string | null {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function executionStatusLabel(
  status:
    | 'received'
    | 'planning'
    | 'plan_ready'
    | 'executing'
    | 'waiting_manual'
    | 'completed'
    | 'failed'
    | 'cancelled'
): string {
  switch (status) {
    case 'plan_ready':
      return 'Plan ready';
    case 'waiting_manual':
      return 'Waiting manual';
    default:
      return status.replace(/_/g, ' ');
  }
}

function approvalStatusLabel(status: 'draft' | 'ready_for_review' | 'approved_for_execution' | 'rejected'): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready for review';
    case 'approved_for_execution':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Draft';
  }
}

export function StartupOverviewStatStrip({
  dashboard,
  averageScore,
  openRecommendations,
}: StartupOverviewStatStripProps) {
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
        <p className="text-xs uppercase tracking-widest text-on-surface-variant">Scans</p>
        <p className="mt-1 text-2xl font-bold">{dashboard.scans.length}</p>
      </div>
      <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
        <p className="text-xs uppercase tracking-widest text-on-surface-variant">Average score</p>
        <p className="mt-1 text-2xl font-bold">{averageScore != null ? `${Math.round(averageScore)}/100` : '-'}</p>
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
  );
}

export function StartupOverviewTab({
  dashboard,
  startupRolloutFlags,
  startupServiceGates,
  trend,
  backlog,
  metrics,
  latestPlan,
  laneCards,
  prRuns,
  approvedRecommendations,
  averageScore,
  githubState,
  slackActiveInstallations,
  slackActiveDestinations,
  canManageSlackAutoPost,
  prStatusMessage,
}: StartupOverviewTabProps) {
  const workspaceId = dashboard.selectedWorkspaceId;
  const latestScan = dashboard.scans[0] ?? null;
  const latestExecution = dashboard.executions[0] ?? null;
  const latestTrendPoint = trend[trend.length - 1] ?? null;
  const previousTrendPoint = trend[trend.length - 2] ?? null;
  const scoreDelta = formatDelta(latestTrendPoint?.score, previousTrendPoint?.score);
  const manualTasks = latestPlan?.tasks.filter(
    (task) => task.executionMode === 'manual' || task.taskKind === 'manual_action'
  ) ?? [];
  const openManualTasks = manualTasks.filter((task) => task.status !== 'done' && task.status !== 'failed');
  const latestPlanExecution =
    latestPlan?.executionId != null
      ? dashboard.executions.find((execution) => execution.id === latestPlan.executionId) ?? null
      : null;

  return (
    <>
      {dashboard.scans.length === 0 ? (
        <article
          data-testid="startup-overview-empty-scans"
          className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
        >
          <h2 className="text-lg font-semibold">No startup scans yet</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Run a scan to establish a baseline for score trend, backlog, and audit history. Open the{' '}
            <Link href={auditsTabHref(workspaceId)} className="font-semibold text-primary underline">
              Audits
            </Link>{' '}
            tab anytime to review past runs.
          </p>
          <Link
            href={newScanHref(workspaceId)}
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            Run a new scan
          </Link>
        </article>
      ) : null}

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Current state</p>
            <h2 className="mt-1 text-lg font-semibold">One view for what matters now</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {latestScan
                ? `Latest score is ${latestScan.score ?? '-'} on ${new Date(latestScan.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}.`
                : 'No scored scans yet. Run a scan to establish the baseline.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={newScanHref(workspaceId)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Run a new scan
            </Link>
            <Link
              href={auditsTabHref(workspaceId)}
              className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
            >
              Review audits
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Scans</p>
            <p className="mt-1 text-2xl font-bold">{dashboard.scans.length}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Average score</p>
            <p className="mt-1 text-2xl font-bold">{averageScore != null ? `${Math.round(averageScore)}/100` : '-'}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Open recommendations</p>
            <p className="mt-1 text-2xl font-bold">{dashboard.recommendations.length}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Audit orchestration</p>
            <h2 className="mt-1 text-lg font-semibold">Current execution and blockers</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              This is the control plane for the latest startup audit execution: where it is, what is blocked, and which models produced the current plan.
            </p>
          </div>
          <Link
            href={auditsTabHref(workspaceId)}
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Open audit history
          </Link>
        </div>
        {latestExecution ? (
          <div
            className="mt-4 grid gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4"
            data-testid="startup-orchestration-module"
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Execution</p>
                <p className="mt-1 text-lg font-bold capitalize text-on-surface">
                  {executionStatusLabel(latestExecution.status)}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Approval</p>
                <p className="mt-1 text-lg font-bold text-on-surface">
                  {approvalStatusLabel(latestExecution.approvalStatus)}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Plan</p>
                <p className="mt-1 text-lg font-bold text-on-surface">
                  {latestExecution.planTaskCount != null ? `${latestExecution.planTaskCount} tasks` : 'Not linked'}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Updated</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {new Date(latestExecution.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Execution summary</p>
                <p className="mt-2 text-sm text-on-surface">
                  {latestExecution.summary ?? latestExecution.errorMessage ?? 'No execution summary yet.'}
                </p>
                {latestExecution.manualWaitReason ? (
                  <p className="mt-2 text-sm text-amber-200">
                    Manual blocker: {latestExecution.manualWaitReason}
                  </p>
                ) : latestExecution.approvalRejectionReason ? (
                  <p className="mt-2 text-sm text-rose-300">
                    Rejection reason: {latestExecution.approvalRejectionReason}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg bg-surface-container px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Model provenance</p>
                <ul className="mt-2 space-y-2 text-sm text-on-surface">
                  <li>Planner: {latestExecution.plannerModel ?? 'Not stamped yet'}</li>
                  <li>Repo review: {latestExecution.repoReviewModel ?? 'Not stamped yet'}</li>
                  <li>DB review: {latestExecution.dbReviewModel ?? 'Not stamped yet'}</li>
                  <li>Risk review: {latestExecution.riskReviewModel ?? 'Not stamped yet'}</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-on-surface-variant">No audit execution yet for this workspace.</p>
        )}
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Progress</p>
            <h2 className="mt-1 text-lg font-semibold">Recent improvement at a glance</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
              Small benchmark signal for the latest scans and validated recommendations.
            </p>
          </div>
          <Link
            href={auditsTabHref(workspaceId)}
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Open audit history
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Latest score</p>
            <p className="mt-1 text-2xl font-bold">{latestTrendPoint ? `${latestTrendPoint.score}/100` : '-'}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Delta</p>
            <p className="mt-1 text-2xl font-bold">{scoreDelta ?? '-'}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Validated</p>
            <p className="mt-1 text-2xl font-bold">{metrics.funnel.validated}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Improvement history</p>
            <h2 className="mt-1 text-lg font-semibold">Execution outcomes over time</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Startup audit executions are summarized into stable outcome buckets so the same history can later feed benchmark comparisons.
            </p>
          </div>
          <Link
            href={auditsTabHref(workspaceId)}
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Review execution history
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4" data-testid="startup-improvement-history">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Executions</p>
            <p className="mt-1 text-2xl font-bold">{metrics.executionHistory.total}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Plan ready</p>
            <p className="mt-1 text-2xl font-bold">{metrics.executionHistory.planReady}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Blocked manual</p>
            <p className="mt-1 text-2xl font-bold">{metrics.executionHistory.waitingManual}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Completed</p>
            <p className="mt-1 text-2xl font-bold">{metrics.executionHistory.completed}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Benchmark-ready outcomes</p>
          <ul className="mt-3 space-y-2 text-sm">
            {metrics.benchmarkOutcomeSummary.map((item) => (
              <li key={item.label} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                <span className="text-on-surface">{item.label}</span>
                <span className="font-semibold text-on-surface">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Slack</p>
            <h2 className="mt-1 text-lg font-semibold">Use the existing delivery hub</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Keep Slack setup in one place, with destinations, auto-post, and delivery history already in the connectors dashboard.
            </p>
          </div>
          <Link
            href="/dashboard/connectors"
            className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
          >
            Open connectors
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Connection</p>
            <p className="mt-1 text-2xl font-bold">
              {slackActiveInstallations.length > 0 ? 'Connected' : 'Off'}
            </p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Destinations</p>
            <p className="mt-1 text-2xl font-bold">{slackActiveDestinations.length}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Auto-post</p>
            <p className="mt-1 text-2xl font-bold">{canManageSlackAutoPost ? 'Available' : 'Locked'}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
        <h2 className="text-lg font-semibold">Score trend</h2>
        <p className="mt-1 text-sm text-on-surface-variant">The line should read in one glance, not in a paragraph.</p>
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-3">
          {trend.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No scored scans yet.</p>
          ) : (
            <svg viewBox="0 0 240 80" className="h-24 w-full text-primary">
              <path
                d={trendPath(
                  trend.map((point) => point.score),
                  240,
                  80
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-outline-variant bg-surface-container p-5">
        <h2 className="text-lg font-semibold">Action backlog</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Only the next useful work, capped at a few items.</p>
        <ul className="mt-4 space-y-3" data-testid="startup-overview-backlog">
          {backlog.length === 0 ? (
            <li className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-4 text-sm text-on-surface-variant">
              No backlog items yet. When recommendations and scans exist, actionable items appear here.
            </li>
          ) : (
            backlog.slice(0, 4).map((item) => (
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
            ))
          )}
        </ul>
      </article>

      <details className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <summary className="cursor-pointer list-none text-lg font-semibold text-on-surface">
          Implementation lane
          <span className="ml-3 text-sm font-normal text-on-surface-variant">Progress and ownership details</span>
        </summary>
        <div className="mt-4">
          {!latestPlan ? (
            <p className="text-sm text-on-surface-variant">No generated implementation plan yet.</p>
          ) : (
            <>
              <p className="text-xs text-on-surface-variant">
                Plan source: {latestPlan.sourceRef ?? 'manual'} â€¢ {latestPlan.status}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {laneCards.map((card) => (
                  <div key={card.lane} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                    <p className="font-semibold capitalize">{card.lane.replace('_', ' ')}</p>
                    <p className="text-xs text-on-surface-variant">
                      Open {card.open} â€¢ Done {card.done} â€¢ Total {card.total}
                    </p>
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {latestPlan.tasks.slice(0, 4).map((task) => (
                  <li key={task.id} className="rounded-lg bg-surface-container-low px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{task.title}</p>
                      <span className="text-xs uppercase tracking-wider text-on-surface-variant">{task.teamLane}</span>
                    </div>
                    {task.detail ? <p className="mt-1 text-xs text-on-surface-variant">{task.detail}</p> : null}
                  </li>
                ))}
              </ul>
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
              <div
                className="mt-3 rounded-xl border border-outline-variant bg-surface-container-low p-3"
                data-testid="startup-manual-operator-queue"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant">Manual operator queue</p>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      Use this when a task needs a human step such as a migration, env update, or external dashboard action.
                    </p>
                  </div>
                  <div className="text-right text-xs text-on-surface-variant">
                    <p>
                      Execution:{' '}
                      <span className="font-semibold text-on-surface">
                        {latestPlanExecution?.status ?? 'not linked'}
                      </span>
                    </p>
                    {latestPlanExecution?.status === 'waiting_manual' ? (
                      <p>Paused until the blocked manual task is completed.</p>
                    ) : null}
                  </div>
                </div>
                {openManualTasks.length === 0 ? (
                  <p className="mt-3 text-sm text-on-surface-variant">No open manual tasks in the current plan.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {openManualTasks.map((task) => (
                      <li key={task.id} className="rounded-lg border border-outline-variant bg-surface-container px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-on-surface">{task.title}</p>
                            <p className="text-xs text-on-surface-variant">
                              {task.teamLane} • {task.status} • {task.executionMode}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {workspaceId && latestPlan?.executionId ? (
                              <>
                                {task.status !== 'blocked' ? (
                                  <form action={blockStartupManualTaskAction}>
                                    <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                                    <input type="hidden" name="executionId" value={latestPlan.executionId} />
                                    <input type="hidden" name="taskId" value={task.id} />
                                    <input
                                      type="hidden"
                                      name="blockedReason"
                                      value={task.manualInstructions ?? task.blockedReason ?? 'Waiting on manual operator action'}
                                    />
                                    <button
                                      type="submit"
                                      className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface"
                                    >
                                      Block execution
                                    </button>
                                  </form>
                                ) : null}
                                <form action={completeStartupManualTaskAction}>
                                  <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
                                  <input type="hidden" name="executionId" value={latestPlan.executionId} />
                                  <input type="hidden" name="taskId" value={task.id} />
                                  <button
                                    type="submit"
                                    className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface"
                                  >
                                    Mark complete
                                  </button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {task.manualInstructions ? (
                          <p className="mt-2 text-xs text-on-surface-variant">{task.manualInstructions}</p>
                        ) : null}
                        {task.evidenceRequired.length > 0 ? (
                          <p className="mt-2 text-xs text-on-surface-variant">
                            Evidence needed: {task.evidenceRequired.join(', ')}
                          </p>
                        ) : null}
                        {task.blockedReason ? (
                          <p className="mt-2 text-xs text-amber-200">Blocked reason: {task.blockedReason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </details>

      <details className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2">
        <summary className="cursor-pointer list-none text-lg font-semibold text-on-surface">
          PR activity
          <span className="ml-3 text-sm font-normal text-on-surface-variant">Automation state and execution controls</span>
        </summary>
        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Funnel</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md bg-surface-container-low px-3 py-2">Suggested: {metrics.funnel.suggested}</div>
              <div className="rounded-md bg-surface-container-low px-3 py-2">Approved: {metrics.funnel.approved}</div>
              <div className="rounded-md bg-surface-container-low px-3 py-2">In progress: {metrics.funnel.inProgress}</div>
              <div className="rounded-md bg-surface-container-low px-3 py-2">Shipped: {metrics.funnel.shipped}</div>
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
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Agent PR workflow</p>
            {prStatusMessage ? (
              <p className="mt-2 rounded-md bg-surface-container-low px-3 py-2 text-xs text-on-surface">{prStatusMessage}</p>
            ) : null}
            {workspaceId &&
            startupRolloutFlags?.autoPr &&
            startupServiceGates?.githubIntegration.enabled &&
            startupServiceGates?.agentPrExecution.enabled &&
            githubState.repositories.length > 0 ? (
              <form action={queueStartupRecommendationPrRunAction} className="mt-2 grid gap-2">
                <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
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
                prRuns.slice(0, 4).map((run) => (
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
                    {run.executionId ? (
                      <p className="mt-1 text-on-surface-variant">
                        Linked execution: {run.executionId}
                        {run.planTaskIds.length > 0 ? ` • ${run.planTaskIds.length} task${run.planTaskIds.length === 1 ? '' : 's'}` : ''}
                      </p>
                    ) : run.recommendationId ? (
                      <p className="mt-1 text-on-surface-variant">Linked recommendation: {run.recommendationId}</p>
                    ) : null}
                    {workspaceId &&
                    (run.status === 'running' || run.status === 'queued' || run.status === 'pr_opened') ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(run.status === 'running' || run.status === 'queued') && (
                          <form action={markStartupPrRunOpenedAction} className="flex flex-wrap gap-2">
                            <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
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
                            <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
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
                          <input type="hidden" name="startupWorkspaceId" value={workspaceId} />
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
      </details>
    </>
  );
}
