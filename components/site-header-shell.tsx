'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GeoPulseLogo } from '@/components/geopulse-logo';
import { ThemeToggle } from '@/components/theme-toggle';

type SiteHeaderShellProps = {
  readonly isSignedIn: boolean;
  readonly isAdmin: boolean;
  readonly signOutButton: React.ReactNode;
};

export function SiteHeaderShell({
  isSignedIn,
  isAdmin,
  signOutButton,
}: SiteHeaderShellProps) {
  const pathname = usePathname();
  const isDashboardRoute = pathname.startsWith('/dashboard');
  const isBlogRoute = pathname.startsWith('/blog');
  const headerClassName = isBlogRoute
    ? 'sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur'
    : 'sticky top-0 z-50 bg-surface';
  const primaryNavLinkClassName = isBlogRoute
    ? 'hidden font-sans text-lg font-semibold text-white md:inline'
    : 'hidden font-sans text-lg font-semibold text-on-background md:inline';
  const subtleNavLinkClassName = isBlogRoute
    ? 'text-xs font-semibold uppercase tracking-widest text-zinc-300 transition-colors hover:text-white'
    : 'text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background';
  const dashboardLinkClassName = isBlogRoute
    ? 'text-sm font-medium text-sky-300 transition-colors hover:text-white'
    : 'text-sm font-medium text-primary transition-colors hover:text-on-background';

  return (
    <header className={headerClassName}>
      <nav
        className={`mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 md:px-10 ${
          isDashboardRoute ? 'py-4' : 'py-6'
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <GeoPulseLogo size="md" />
          <span className="sr-only">GEO-Pulse</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-6 md:gap-10">
          {isDashboardRoute ? (
            <>
              <Link
                href="/blog"
                className={`hidden md:inline ${subtleNavLinkClassName}`}
              >
                View site
              </Link>
              {signOutButton}
            </>
          ) : isSignedIn ? (
            <>
              <Link
                href="/blog"
                className={primaryNavLinkClassName}
              >
                Blog
              </Link>
              <Link
                href="/pricing"
                className={primaryNavLinkClassName}
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className={primaryNavLinkClassName}
              >
                About
              </Link>
              <Link
                href="/dashboard"
                className={dashboardLinkClassName}
              >
                Dashboard
              </Link>
              {isAdmin ? (
                <div className="hidden items-center gap-4 md:flex">
                  <Link
                    href="/dashboard/evals"
                    className={subtleNavLinkClassName}
                  >
                    Evals
                  </Link>
                  <Link
                    href="/dashboard/benchmarks"
                    className={subtleNavLinkClassName}
                  >
                    Benchmarks
                  </Link>
                </div>
              ) : null}
              {signOutButton}
            </>
          ) : (
            <>
              <Link
                href="/blog"
                className={primaryNavLinkClassName}
              >
                Blog
              </Link>
              <Link
                href="/pricing"
                className={primaryNavLinkClassName}
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className={primaryNavLinkClassName}
              >
                About
              </Link>
              <Link
                href="/login"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 sm:px-5"
              >
                Sign in
              </Link>
              {/* Admin link removed — admins use /login then navigate to /admin directly */}
            </>
          )}
          {!isBlogRoute ? <ThemeToggle /> : null}
        </div>
      </nav>
    </header>
  );
}
