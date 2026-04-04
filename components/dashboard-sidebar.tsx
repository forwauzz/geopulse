'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DashboardSidebarProps = {
  readonly userEmail: string | null;
  readonly isAdmin: boolean;
};

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
};

function itemTone(isActive: boolean): string {
  return isActive
    ? 'bg-primary text-on-primary'
    : 'text-on-background hover:bg-surface-container-high';
}

function matchPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroup({
  title,
  pathname,
  items,
}: {
  readonly title: string;
  readonly pathname: string;
  readonly items: readonly NavItem[];
}) {
  return (
    <section>
      <p className="px-3 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
        {title}
      </p>
      <div className="mt-3 space-y-1">
        {items.map((item) => {
          const isActive = matchPath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${itemTone(
                isActive
              )}`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardSidebar({ userEmail, isAdmin }: DashboardSidebarProps) {
  const pathname = usePathname();

  const accountItems: NavItem[] = [
    { href: '/dashboard', label: 'Scans', icon: 'space_dashboard' },
    { href: '/dashboard/startup', label: 'Startup', icon: 'rocket' },
    { href: '/', label: 'New scan', icon: 'add_circle' },
    { href: '/blog', label: 'Blog', icon: 'article' },
  ];

  const adminItems: NavItem[] = [
    { href: '/dashboard/agencies', label: 'Agencies', icon: 'groups' },
    { href: '/dashboard/startups', label: 'Startups', icon: 'rocket_launch' },
    { href: '/dashboard/services', label: 'Services', icon: 'tune' },
    { href: '/dashboard/attribution', label: 'Attribution', icon: 'ads_click' },
    { href: '/dashboard/content', label: 'Content', icon: 'edit_square' },
    { href: '/dashboard/content/launch', label: 'Launch readiness', icon: 'rocket_launch' },
    { href: '/dashboard/benchmarks', label: 'Benchmarks', icon: 'query_stats' },
    { href: '/dashboard/evals', label: 'Eval analytics', icon: 'monitoring' },
    { href: '/dashboard/logs', label: 'Logs', icon: 'receipt_long' },
  ];

  return (
    <aside className="w-full rounded-2xl bg-surface-container-low p-5 shadow-float lg:sticky lg:top-24 lg:w-72 lg:self-start">
      <Link href="/" className="flex items-center gap-2 px-3 text-on-background">
        <span className="material-symbols-outlined text-primary" aria-hidden>
          explore
        </span>
        <span className="font-headline text-2xl font-bold">GEO-Pulse</span>
      </Link>

      <div className="mt-5 rounded-xl bg-surface-container-high px-3 py-3">
        <p className="text-xs uppercase tracking-widest text-on-surface-variant">Signed in</p>
        <p className="mt-2 break-all text-sm font-medium text-on-background">
          {userEmail ?? 'Unknown user'}
        </p>
        <p className="mt-1 text-xs text-on-surface-variant">{isAdmin ? 'Admin access' : 'Account access'}</p>
      </div>

      <div className="mt-6 space-y-6">
        <NavGroup title="Account" pathname={pathname} items={accountItems} />
        {isAdmin ? <NavGroup title="Admin" pathname={pathname} items={adminItems} /> : null}
      </div>
    </aside>
  );
}
