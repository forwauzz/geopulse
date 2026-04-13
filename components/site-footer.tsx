'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GeoPulseLogo } from '@/components/geopulse-logo';

export function SiteFooter() {
  const pathname = usePathname();
  const isBlogRoute = pathname.startsWith('/blog');

  return (
    <footer
      className={`mt-auto px-6 py-16 md:px-10 ${
        isBlogRoute
          ? 'blog-chrome-light border-t border-outline-variant/30 bg-surface text-on-background'
          : 'bg-surface-container-low text-primary'
      }`}
    >
      <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-12 md:grid-cols-2 md:items-end">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <GeoPulseLogo size="lg" />
            <span className="sr-only">GEO-Pulse</span>
          </div>
          <p className="max-w-sm font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Editorial intelligence for AI search readiness. High-fidelity audits for your public pages.
          </p>
        </div>
        <div className="flex flex-col gap-4 font-body text-sm uppercase tracking-wide text-on-surface-variant md:flex-row md:justify-end md:gap-8">
          <span className="opacity-80">&copy; {new Date().getFullYear()} GEO-Pulse</span>
          <Link
            href="/about"
            className="hover:text-on-background hover:underline"
          >
            About
          </Link>
          <Link
            href="/privacy"
            className="hover:text-on-background hover:underline"
          >
            Privacy
          </Link>
          <Link
            href="/login"
            className="hover:text-on-background hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

