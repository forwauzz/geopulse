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
  return (
    <nav
      data-testid="startup-dashboard-tab-bar"
      className="mt-6 flex flex-wrap gap-1 border-b border-outline-variant"
      aria-label="Startup dashboard sections"
    >
      {STARTUP_DASHBOARD_TABS.map((tab) => {
        const active = tab === activeTab;
        return (
          <Link
            key={tab}
            href={startupTabHref(tab, startupWorkspaceId)}
            className={`mb-[-1px] rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? 'border-primary text-on-surface'
                : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
            }`}
          >
            {LABELS[tab]}
          </Link>
        );
      })}
    </nav>
  );
}
