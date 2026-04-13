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
    ? 'blog-chrome-light sticky top-0 z-50 border-b border-outline-variant/30 bg-surface backdrop-blur'
    : 'sticky top-0 z-50 bg-surface';
  const primaryNavLinkClassName =
    'hidden font-sans text-lg font-semibold text-on-background md:inline';
  const subtleNavLinkClassName =
    'text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background';
  const dashboardLinkClassName =
    'text-sm font-medium text-primary transition-colors hover:text-on-background';

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
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <Link
                  href="/login?mode=signup&next=/pricing"
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-background transition hover:bg-surface-container-low sm:px-5"
                >
                  Sign up
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-background transition hover:bg-surface-container-low sm:px-5"
                >
                  Start free trial
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 sm:px-5"
                >
                  Sign in
                </Link>
              </div>
              {/* Admin link removed — admins use /login then navigate to /admin directly */}
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
