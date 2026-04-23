'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GeoPulseLogo } from '@/components/geopulse-logo';

type AdminNavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
};

type AdminNavSection = {
  readonly section: string;
  readonly items: AdminNavItem[];
};

const ADMIN_NAV: ReadonlyArray<AdminNavSection> = [
  {
    section: 'Platform',
    items: [
      { href: '/admin', label: 'Console Home', icon: 'home' },
      { href: '/admin/agencies', label: 'Agencies', icon: 'corporate_fare' },
      { href: '/admin/startups', label: 'Startups', icon: 'rocket_launch' },
      { href: '/admin/services', label: 'Services & Bundles', icon: 'tune' },
      { href: '/admin/users', label: 'Users', icon: 'group' },
      { href: '/admin/admins', label: 'Platform Admins', icon: 'admin_panel_settings' },
    ],
  },
  {
    section: 'Content',
    items: [
      { href: '/dashboard/content', label: 'Content', icon: 'article' },
      { href: '/dashboard/content/launch', label: 'Launch Readiness', icon: 'check_circle' },
    ],
  },
  {
    section: 'Analytics',
    items: [
      { href: '/dashboard/benchmarks', label: 'Benchmarks', icon: 'analytics' },
      { href: '/admin/geo-performance', label: 'GEO Performance', icon: 'track_changes' },
      { href: '/dashboard/evals', label: 'Evals', icon: 'science' },
      { href: '/dashboard/attribution', label: 'Attribution', icon: 'link' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/dashboard/distribution', label: 'Distribution', icon: 'share' },
      { href: '/admin/logs', label: 'Logs', icon: 'receipt_long' },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMenu = () => setMobileOpen(false);

  const navBody = (
    <>
      <nav className="flex flex-col gap-4 mt-4 lg:mt-0">
        {ADMIN_NAV.map((section) => (
          <div key={section.section}>
            <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-amber-600/70 dark:text-amber-400/60">
              {section.section}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-amber-500/10 hover:text-on-surface"
                >
                  <span
                    className="material-symbols-outlined shrink-0 text-[18px]"
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Back to dashboard */}
      <div className="mt-4 border-t border-amber-500/10 pt-3 lg:mt-auto">
        <Link
          href="/dashboard"
          onClick={closeMenu}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-surface-container/70 hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            arrow_back
          </span>
          Back to Dashboard
        </Link>
      </div>
    </>
  );

  return (
    <aside className="rounded-2xl border border-amber-500/20 bg-amber-950/5 lg:sticky lg:top-8 lg:h-fit">

      {/* ── Header: Logo + ADMIN badge + hamburger ────────── */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 lg:px-4 lg:pt-4 lg:pb-0">
        <div className="flex items-center justify-between gap-2 flex-1">
          <Link
            href="/admin"
            onClick={closeMenu}
            className="flex min-w-0 items-center"
          >
            <GeoPulseLogo size="sm" />
            <span className="sr-only">GEO-Pulse</span>
          </Link>
          <span className="rounded-lg bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            Admin
          </span>
        </div>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="ml-3 rounded-xl p-2 text-on-surface-variant transition hover:bg-amber-500/10 lg:hidden"
          aria-label={mobileOpen ? 'Close admin navigation' : 'Open admin navigation'}
          aria-expanded={mobileOpen}
          aria-controls="admin-mobile-nav"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden>
            {mobileOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* ── Mobile nav body (toggled) ─────────────────────── */}
      <div
        id="admin-mobile-nav"
        className={`px-4 pb-4 sm:px-5 sm:pb-5 lg:hidden ${mobileOpen ? 'flex flex-col' : 'hidden'}`}
      >
        {navBody}
      </div>

      {/* ── Desktop nav body (always visible at lg+) ─────── */}
      <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:p-4">
        {navBody}
      </div>

    </aside>
  );
}
