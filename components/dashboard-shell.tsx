'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import { DashboardSidebar } from '@/components/dashboard-sidebar';

export const DASHBOARD_SIDEBAR_COLLAPSED_KEY = 'geo-pulse-dashboard-sidebar-collapsed';

type Props = {
  readonly userEmail: string | null;
  readonly isAdmin: boolean;
  readonly signOutAction: () => Promise<void>;
  readonly children: React.ReactNode;
};

export function DashboardShell({ userEmail, isAdmin, signOutAction, children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY) === '1') {
        setSidebarCollapsed(true);
      }
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div
      className={`grid grid-cols-1 gap-6 lg:gap-8 ${
        sidebarCollapsed ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[18rem_minmax(0,1fr)]'
      } motion-reduce:transition-none lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:lg:transition-none`}
    >
      <DashboardSidebar
        userEmail={userEmail}
        isAdmin={isAdmin}
        signOutAction={signOutAction}
        desktopCollapsed={sidebarCollapsed}
        onToggleDesktopCollapse={toggleSidebarCollapsed}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
