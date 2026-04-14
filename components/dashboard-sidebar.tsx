'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GeoPulseLogo } from '@/components/geopulse-logo';
import { ThemeToggle } from '@/components/theme-toggle';

type DashboardSidebarProps = {
  readonly userEmail: string | null;
  readonly isAdmin: boolean;
  readonly signOutAction: () => Promise<void>;
  /** When true at `lg+`, nav shows icon rail (labels via tooltip / aria). */
  readonly desktopCollapsed?: boolean;
  readonly onToggleDesktopCollapse?: () => void;
};

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  /** Match only the exact path, not sub-paths */
  readonly exact?: boolean;
  /** Visually distinguish as the primary CTA */
  readonly highlight?: boolean;
};

function matchPath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemClass(isActive: boolean, highlight?: boolean, compact?: boolean): string {
  const compactActive = compact
    ? 'lg:border-l-0 lg:pl-2 lg:ring-1 lg:ring-inset lg:ring-primary/25 lg:bg-surface-container'
    : '';
  if (isActive) {
    return `border-l-[3px] border-primary bg-surface-container text-on-surface font-semibold pl-[calc(0.75rem-3px)] ${compactActive}`;
  }
  if (highlight) {
    return `border border-primary/20 bg-primary/10 text-primary font-medium hover:bg-primary/15 ${
      compact ? 'lg:border-0 lg:ring-1 lg:ring-inset lg:ring-primary/15' : ''
    }`;
  }
  return `text-on-surface-variant font-medium hover:bg-surface-container/70 hover:text-on-surface ${
    compact ? 'lg:border-0' : ''
  }`;
}

function NavItem({
  item,
  pathname,
  onNavigate,
  compact,
}: {
  readonly item: NavItem;
  readonly pathname: string;
  readonly onNavigate?: () => void;
  readonly compact: boolean;
}) {
  const isActive = matchPath(pathname, item.href, item.exact);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={compact ? item.label : undefined}
      title={item.label}
      className={`flex items-center gap-3 rounded-xl py-2 text-sm transition-colors ${compact ? 'lg:justify-center lg:gap-0 lg:px-2' : 'px-3'} ${itemClass(isActive, item.highlight, compact)}`}
    >
      <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden>
        {item.icon}
      </span>
      <span className={compact ? 'lg:hidden' : ''}>{item.label}</span>
    </Link>
  );
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
  compact,
}: {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly pathname: string;
  readonly onNavigate?: () => void;
  readonly compact: boolean;
}) {
  return (
    <section aria-label={title}>
      <p
        className={`px-3 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 ${
          compact ? 'lg:sr-only' : ''
        }`}
      >
        {title}
      </p>
      <div className="mt-2 space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} compact={compact} />
        ))}
      </div>
    </section>
  );
}

const WORKSPACE_NAV: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'space_dashboard', exact: true },
  {
    href: '/dashboard/new-scan',
    label: 'Run a Scan',
    icon: 'add_circle',
    exact: true,
    highlight: true,
  },
  { href: '/dashboard/connectors', label: 'Connectors', icon: 'cable', exact: true },
  { href: '/dashboard/billing', label: 'Billing', icon: 'credit_card', exact: true },
  { href: '/dashboard/workspace', label: 'Settings', icon: 'settings', exact: true },
  { href: '/blog', label: 'Blog', icon: 'article' },
];

function NavBlocks({
  pathname,
  compact,
  userEmail,
  isAdmin,
  signOutAction,
  onNavigate,
}: {
  readonly pathname: string;
  readonly compact: boolean;
  readonly userEmail: string | null;
  readonly isAdmin: boolean;
  readonly signOutAction: () => Promise<void>;
  readonly onNavigate?: () => void;
}) {
  return (
    <>
      <div id="dashboard-sidebar-nav" className="mt-4 space-y-5 lg:mt-6">
        <NavSection
          title="Workspace"
          items={WORKSPACE_NAV}
          pathname={pathname}
          onNavigate={onNavigate}
          compact={compact}
        />
      </div>

      <div className="mt-6 space-y-1 border-t border-gold/20 pt-4 lg:mt-8 lg:pt-5">
        {isAdmin ? (
          <div className={`mb-2 border-b border-gold/30 pb-3 ${compact ? 'lg:mb-1 lg:border-0 lg:pb-0' : ''}`}>
            <Link
              href="/admin"
              onClick={onNavigate}
              aria-label={compact ? 'Admin Console' : undefined}
              title="Admin Console"
              className={`flex items-center gap-3 rounded-xl py-2 text-sm font-medium text-amber-500 transition-colors hover:bg-surface-container ${
                compact ? 'lg:justify-center lg:px-2 lg:gap-0' : 'px-3'
              } ${pathname.startsWith('/admin') ? 'bg-surface-container' : ''}`}
            >
              <span className="material-symbols-outlined shrink-0 text-[18px]" aria-hidden>
                shield
              </span>
              <span className={compact ? 'lg:hidden' : ''}>Admin Console</span>
              <span
                className={`material-symbols-outlined ml-auto text-[14px] opacity-50 ${compact ? 'lg:hidden' : ''}`}
                aria-hidden
              >
                arrow_forward
              </span>
            </Link>
          </div>
        ) : null}

        <div
          className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
            compact ? 'lg:flex-col lg:gap-2 lg:px-1 lg:py-1' : ''
          }`}
        >
          <div className={`min-w-0 flex-1 ${compact ? 'lg:hidden' : ''}`}>
            <p className="truncate text-xs font-medium text-on-background">{userEmail ?? 'Unknown user'}</p>
            <p className="mt-0.5 text-[10px] text-on-surface-variant">{isAdmin ? 'Admin' : 'Member'}</p>
          </div>
          <ThemeToggle />
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            title="Sign out"
            aria-label={compact ? 'Sign out' : undefined}
            className={`w-full rounded-xl px-3 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface ${
              compact ? 'lg:flex lg:justify-center lg:px-2 lg:py-2' : ''
            }`}
          >
            <span className={`material-symbols-outlined hidden text-[20px] ${compact ? 'lg:inline' : ''}`} aria-hidden>
              logout
            </span>
            <span className={compact ? 'lg:sr-only' : ''}>Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}

export function DashboardSidebar({
  userEmail,
  isAdmin,
  signOutAction,
  desktopCollapsed = false,
  onToggleDesktopCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMenu = () => setMobileOpen(false);

  return (
    <aside
      className={`rounded-2xl bg-surface-container-low shadow-float lg:sticky lg:top-24 lg:w-full lg:self-start lg:overflow-hidden ${
        desktopCollapsed ? 'lg:min-w-0' : ''
      }`}
    >
      <div
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4 lg:px-5 lg:pt-5 lg:pb-0 ${
          desktopCollapsed ? 'lg:flex-col lg:items-center lg:justify-start lg:gap-3 lg:px-2 lg:pb-2 lg:pt-4' : ''
        }`}
      >
        <Link
          href="/dashboard"
          title="GEO-Pulse"
          aria-label={desktopCollapsed ? 'GEO-Pulse home' : undefined}
          className={`flex items-center gap-2 text-on-background ${desktopCollapsed ? 'lg:justify-center' : ''}`}
          onClick={closeMenu}
        >
          <span
            className={
              desktopCollapsed
                ? 'hidden text-primary lg:flex lg:h-10 lg:w-10 lg:items-center lg:justify-center lg:rounded-xl lg:bg-primary/10'
                : 'hidden'
            }
            aria-hidden
          >
            <span className="material-symbols-outlined text-[24px]">monitoring</span>
          </span>
          <GeoPulseLogo size="md" className={desktopCollapsed ? 'lg:hidden' : undefined} />
          <span className="sr-only">GEO-Pulse</span>
        </Link>

        <div className="flex items-center gap-1">
          {onToggleDesktopCollapse ? (
            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              className="hidden rounded-xl p-2 text-on-surface-variant transition hover:bg-surface-container lg:flex"
              aria-expanded={!desktopCollapsed}
              aria-label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden>
                {desktopCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="rounded-xl p-2 text-on-surface-variant transition hover:bg-surface-container lg:hidden"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden>
              {mobileOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={`px-4 pb-4 sm:px-5 sm:pb-5 lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}
      >
        <NavBlocks
          pathname={pathname}
          compact={false}
          userEmail={userEmail}
          isAdmin={isAdmin}
          signOutAction={signOutAction}
          onNavigate={closeMenu}
        />
      </div>

      <div className="hidden px-5 pb-5 lg:flex lg:flex-col">
        <NavBlocks
          pathname={pathname}
          compact={desktopCollapsed}
          userEmail={userEmail}
          isAdmin={isAdmin}
          signOutAction={signOutAction}
        />
      </div>
    </aside>
  );
}
