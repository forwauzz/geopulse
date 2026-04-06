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

function itemClass(isActive: boolean, highlight?: boolean): string {
  if (isActive)
    return 'bg-surface-container border-l-[3px] border-primary text-on-surface font-semibold pl-[calc(0.75rem-3px)]';
  if (highlight)
    return 'bg-primary/10 border border-primary/20 text-primary font-medium hover:bg-primary/15';
  return 'text-on-surface-variant font-medium hover:bg-surface-container/70 hover:text-on-surface';
}

function NavItem({
  item,
  pathname,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly pathname: string;
  readonly onNavigate?: () => void;
}) {
  const isActive = matchPath(pathname, item.href, item.exact);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${itemClass(isActive, item.highlight)}`}
    >
      <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly pathname: string;
  readonly onNavigate?: () => void;
}) {
  return (
    <section>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
        {title}
      </p>
      <div className="mt-2 space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
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
  { href: '/dashboard/workspace', label: 'Workspace', icon: 'settings', exact: true },
  { href: '/blog', label: 'Blog', icon: 'article' },
];

export function DashboardSidebar({ userEmail, isAdmin, signOutAction }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMenu = () => setMobileOpen(false);

  const navBody = (
    <>
      {/* ── Primary navigation ───────────────────────────── */}
      <div className="mt-4 space-y-5 lg:mt-6">
        <NavSection title="Workspace" items={WORKSPACE_NAV} pathname={pathname} onNavigate={closeMenu} />
      </div>

      {/* ── Bottom: admin link + user info ───────────────── */}
      <div className="mt-6 space-y-1 lg:mt-8">
        {/* Admin Console — only visible to operators */}
        {isAdmin ? (
          <div className="mb-2 border-b border-outline-variant/30 pb-3">
            <Link
              href="/admin"
              onClick={closeMenu}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-amber-500 transition-colors hover:bg-surface-container ${
                pathname.startsWith('/admin') ? 'bg-surface-container' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden>
                shield
              </span>
              <span>Admin Console</span>
              <span
                className="material-symbols-outlined ml-auto text-[14px] opacity-50"
                aria-hidden
              >
                arrow_forward
              </span>
            </Link>
          </div>
        ) : null}

        {/* User info row */}
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-on-background">
              {userEmail ?? 'Unknown user'}
            </p>
            <p className="mt-0.5 text-[10px] text-on-surface-variant">
              {isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Sign out */}
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <aside className="rounded-2xl bg-surface-container-low shadow-float lg:sticky lg:top-24 lg:w-72 lg:self-start">

      {/* ── Logo row (always visible) ─────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 lg:px-5 lg:pt-5 lg:pb-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-on-background"
          onClick={closeMenu}
        >
          <GeoPulseLogo size="md" />
          <span className="sr-only">GEO-Pulse</span>
        </Link>

        {/* Hamburger — mobile only */}
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

      {/* ── Mobile nav body (toggled) ─────────────────────── */}
      <div
        id="mobile-nav"
        className={`px-4 pb-4 sm:px-5 sm:pb-5 lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}
      >
        {navBody}
      </div>

      {/* ── Desktop nav body (always visible at lg+) ─────── */}
      <div className="hidden px-5 pb-5 lg:flex lg:flex-col">
        {navBody}
      </div>

    </aside>
  );
}
