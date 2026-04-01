'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <header className="sticky top-0 z-50 bg-surface">
      <nav
        className={`mx-auto flex max-w-screen-2xl items-center justify-between px-6 md:px-10 ${
          isDashboardRoute ? 'py-4' : 'py-6'
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            explore
          </span>
          <span className="font-headline text-2xl font-bold text-[#0f172a]">GEO-Pulse</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-8 md:gap-10">
          {isDashboardRoute ? (
            <>
              <Link
                href="/blog"
                className="hidden text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background md:inline"
              >
                View site
              </Link>
              {signOutButton}
            </>
          ) : isSignedIn ? (
            <>
              <Link
                href="/"
                className="hidden font-headline text-lg font-semibold text-on-background md:inline md:italic"
              >
                Home
              </Link>
              <Link
                href="/blog"
                className="hidden font-headline text-lg font-semibold text-on-background md:inline"
              >
                Blog
              </Link>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-primary transition-colors hover:text-on-background"
              >
                Dashboard
              </Link>
              {isAdmin ? (
                <div className="hidden items-center gap-4 md:flex">
                  <Link
                    href="/dashboard/evals"
                    className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background"
                  >
                    Evals
                  </Link>
                  <Link
                    href="/dashboard/benchmarks"
                    className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background"
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
                href="/login"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 sm:px-5"
              >
                Sign in
              </Link>
              <Link
                href="/admin/login?next=/dashboard"
                className="hidden text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background md:inline"
              >
                Admin sign in
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
