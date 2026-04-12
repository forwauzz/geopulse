import Link from 'next/link';
import type { StartupDashboardTabId, StartupTabBarProps } from './startup-tab-types';
import { STARTUP_DASHBOARD_TABS } from './startup-tab-types';

const LABELS: Record<StartupDashboardTabId, string> = {
  overview: 'Overview',
  audits: 'Audits',
  delivery: 'Delivery',
  settings: 'Settings',
};

function startupTabHref(tab: StartupDashboardTabId, workspaceId: string | null): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set('startupWorkspace', workspaceId);
  if (tab !== 'overview') p.set('tab', tab);
  const q = p.toString();
  return q ? `/dashboard/startup?${q}` : '/dashboard/startup';
}

export function StartupTabBar({ activeTab, startupWorkspaceId }: StartupTabBarProps) {
  const primaryTab: StartupDashboardTabId = 'overview';
  const secondaryTabs = STARTUP_DASHBOARD_TABS.filter((tab) => tab !== primaryTab);

  return (
    <nav
      data-testid="startup-dashboard-tab-bar"
      className="mt-6 rounded-2xl border border-outline-variant bg-surface-container-low p-3"
      aria-label="Startup dashboard sections"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Primary</p>
          <Link
            href={startupTabHref(primaryTab, startupWorkspaceId)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === primaryTab
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            {LABELS[primaryTab]}
          </Link>
        </div>
        <div className="border-t border-outline-variant pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Secondary sections</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {secondaryTabs.map((tab) => {
              const active = tab === activeTab;
              return (
                <Link
                  key={tab}
                  href={startupTabHref(tab, startupWorkspaceId)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-primary/10 text-on-surface border border-primary/30'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {LABELS[tab]}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
