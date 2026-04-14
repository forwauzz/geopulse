import Link from 'next/link';
import { isStartupSlackDeliveryStatusCode } from '@/lib/server/startup-dashboard-status-messages';
import { StartupAuditsTab } from '@/app/dashboard/startup/components/startup-audits-tab';
import { StartupDeliveryTab } from '@/app/dashboard/startup/components/startup-delivery-tab';
import { StartupOverviewStatStrip, StartupOverviewTab } from '@/app/dashboard/startup/components/startup-overview-tab';
import { StartupSettingsTab } from '@/app/dashboard/startup/components/startup-settings-tab';
import { StartupTabBar } from '@/app/dashboard/startup/components/startup-tab-bar';
import type {
  StartupAuditFilterState,
  StartupDashboardTabContext,
  StartupDashboardTabId,
} from '@/app/dashboard/startup/components/startup-tab-types';

function buildStartupHref(workspaceId: string | null, tab: StartupDashboardTabId = 'overview'): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  if (tab !== 'overview') params.set('tab', tab);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/startup?${query}` : '/dashboard/startup';
}

function buildNewScanHref(workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/new-scan?${query}` : '/dashboard/new-scan';
}

function buildSectionHref(workspaceId: string | null, tab: StartupDashboardTabId): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  if (tab !== 'overview') params.set('tab', tab);
  const query = params.toString();
  return query.length > 0 ? `/dashboard/startup?${query}` : '/dashboard/startup';
}

const STARTUP_FLOW_ITEMS: Array<{
  readonly tab: StartupDashboardTabId;
  readonly title: string;
  readonly body: string;
}> = [
  {
    tab: 'overview',
    title: 'Overview',
    body: 'See the current score, active work, and the next implementation move.',
  },
  {
    tab: 'audits',
    title: 'Audits',
    body: 'Review recent runs and focus on the blockers that are still failing.',
  },
  {
    tab: 'delivery',
    title: 'Delivery',
    body: 'Track rollout status and the work that is ready to ship next.',
  },
  {
    tab: 'settings',
    title: 'Settings',
    body: 'Check workspace, integration, and notification configuration.',
  },
];

const STARTUP_SECTION_SUMMARY: Record<StartupDashboardTabId, { title: string; body: string }> = {
  overview: {
    title: 'Overview first',
    body: 'Start with score, trend, and the next few actions. Everything else is secondary.',
  },
  audits: {
    title: 'Audit history',
    body: 'Review past runs and compare what changed without scanning the whole dashboard.',
  },
  delivery: {
    title: 'Delivery status',
    body: 'Check Slack delivery health, then send a report or fix the destination setup.',
  },
  settings: {
    title: 'Workspace settings',
    body: 'Connect integrations and adjust the minimum configuration needed for execution.',
  },
};

function StartupFlowStrip({ workspaceId, activeTab }: { workspaceId: string | null; activeTab: StartupDashboardTabId }) {
  return (
    <section className="mt-6 rounded-2xl border border-outline-variant bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Start here</p>
          <h2 className="mt-1 text-base font-semibold text-on-surface">A shorter path through the startup dashboard</h2>
        </div>
        <p className="text-sm text-on-surface-variant">Use the overview first. The other sections stay available below.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STARTUP_FLOW_ITEMS.map((item) => {
          const active = item.tab === activeTab;
          return (
            <Link
              key={item.tab}
              href={buildSectionHref(workspaceId, item.tab)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? 'border-primary bg-primary/10 text-on-surface'
                  : 'border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">{item.title}</p>
              <p className="mt-1 text-sm text-on-surface-variant">{item.body}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export type StartupDashboardPageShellProps = {
  readonly tabContext: StartupDashboardTabContext;
  readonly activeTab: StartupDashboardTabId;
  readonly auditFilter: StartupAuditFilterState;
  readonly slackQueryCode: string | undefined;
};

export function StartupDashboardPageShell({
  tabContext,
  activeTab,
  auditFilter,
  slackQueryCode,
}: StartupDashboardPageShellProps) {
  const { dashboard } = tabContext;
  const slackForDelivery = isStartupSlackDeliveryStatusCode(slackQueryCode)
    ? tabContext.slackStatusMessage
    : null;
  const slackForSettings =
    !isStartupSlackDeliveryStatusCode(slackQueryCode) && tabContext.slackStatusMessage
      ? tabContext.slackStatusMessage
      : null;

  return (
    <section
      data-testid="startup-dashboard-layout"
      className="rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-float md:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Startup dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {tabContext.selectedWorkspace?.name ?? 'Startup workspace'}
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
            href={buildStartupHref(workspace.id, activeTab)}
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

      <StartupFlowStrip workspaceId={dashboard.selectedWorkspaceId} activeTab={activeTab} />

      <div className="mt-4 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Current section</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold text-on-surface">{STARTUP_SECTION_SUMMARY[activeTab].title}</h2>
          <span className="text-sm text-on-surface-variant">{STARTUP_SECTION_SUMMARY[activeTab].body}</span>
        </div>
      </div>

      <StartupTabBar activeTab={activeTab} startupWorkspaceId={dashboard.selectedWorkspaceId} />

      {activeTab === 'overview' ? (
        <StartupOverviewStatStrip
          dashboard={dashboard}
          averageScore={tabContext.averageScore}
          openRecommendations={tabContext.openRecommendations}
        />
      ) : null}

      <section
        data-testid={`startup-tab-panel-${activeTab}`}
        className="mt-8 grid gap-4 lg:grid-cols-2"
      >
        {activeTab === 'overview' ? (
          <StartupOverviewTab
            {...tabContext}
            githubStatusMessage={null}
            slackStatusMessage={null}
            prStatusMessage={tabContext.prStatusMessage}
          />
        ) : null}
        {activeTab === 'audits' ? (
          <StartupAuditsTab
            {...tabContext}
            auditFilter={auditFilter}
            githubStatusMessage={null}
            prStatusMessage={null}
            slackStatusMessage={null}
          />
        ) : null}
        {activeTab === 'delivery' ? (
          <StartupDeliveryTab {...tabContext} slackStatusMessage={slackForDelivery} />
        ) : null}
        {activeTab === 'settings' ? (
          <StartupSettingsTab
            {...tabContext}
            prStatusMessage={null}
            slackStatusMessage={slackForSettings}
          />
        ) : null}
      </section>
    </section>
  );
}
