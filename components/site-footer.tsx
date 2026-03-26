import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-container-low px-6 py-16 text-primary md:px-10">
      <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-12 md:grid-cols-2 md:items-end">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden>
              explore
            </span>
            <span className="font-headline text-2xl font-bold text-[#0f172a]">GEO-Pulse</span>
          </div>
          <p className="max-w-sm font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Editorial intelligence for AI search readiness. High-fidelity audits for your public pages.
          </p>
        </div>
        <div className="flex flex-col gap-4 font-body text-sm uppercase tracking-wide text-on-surface-variant md:flex-row md:justify-end md:gap-8">
          <span className="opacity-80">© {new Date().getFullYear()} GEO-Pulse</span>
          <Link href="/login" className="hover:text-on-background hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
