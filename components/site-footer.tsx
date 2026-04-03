'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteFooter() {
  const pathname = usePathname();
  const isBlogRoute = pathname.startsWith('/blog');

  return (
    <footer
      className={`mt-auto px-6 py-16 md:px-10 ${
        isBlogRoute ? 'border-t border-white/10 bg-black text-zinc-200' : 'bg-surface-container-low text-primary'
      }`}
    >
      <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-12 md:grid-cols-2 md:items-end">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden>
              explore
            </span>
            <span
              className={`font-headline text-2xl font-bold ${
                isBlogRoute ? 'text-white' : 'text-[#0f172a]'
              }`}
            >
              GEO-Pulse
            </span>
          </div>
          <p
            className={`max-w-sm font-label text-xs uppercase tracking-widest ${
              isBlogRoute ? 'text-zinc-300' : 'text-on-surface-variant'
            }`}
          >
            Editorial intelligence for AI search readiness. High-fidelity audits for your public pages.
          </p>
        </div>
        <div
          className={`flex flex-col gap-4 font-body text-sm uppercase tracking-wide md:flex-row md:justify-end md:gap-8 ${
            isBlogRoute ? 'text-zinc-300' : 'text-on-surface-variant'
          }`}
        >
          <span className="opacity-80">&copy; {new Date().getFullYear()} GEO-Pulse</span>
          <Link
            href="/login"
            className={
              isBlogRoute ? 'hover:text-white hover:underline' : 'hover:text-on-background hover:underline'
            }
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

