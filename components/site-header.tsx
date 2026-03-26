import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 bg-surface">
      <nav className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden>
            explore
          </span>
          <span className="font-headline text-2xl font-bold text-[#0f172a]">GEO-Pulse</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-8 md:gap-10">
          <Link
            href="/"
            className="hidden font-headline text-lg font-semibold text-on-background md:inline md:italic"
          >
            Home
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-primary transition-colors hover:text-on-background"
          >
            Dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 sm:px-5"
          >
            Sign in
          </Link>
          <Link
            href="/login?next=/dashboard/attribution"
            className="hidden text-xs font-semibold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-background md:inline"
          >
            Admin sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}
