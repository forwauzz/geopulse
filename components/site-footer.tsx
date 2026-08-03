'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GeoPulseLogo } from '@/components/geopulse-logo';
import { isPublicSiteRoute } from '@/lib/public-route';

export function SiteFooter() {
  const pathname = usePathname();
  const isPublicRoute = isPublicSiteRoute(pathname);

  return (
    <footer
      className={`mt-auto px-6 py-16 md:px-10 ${
        isPublicRoute
          ? 'public-chrome-light border-t border-gold/30 bg-[rgb(var(--blog-card-b))] text-on-background'
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
            AI visibility you can prove, fix, and report.
          </p>
          {isPublicRoute ? (
            <p className="max-w-md font-headline text-2xl leading-snug text-on-background">
              Field notes and practical tools for becoming the answer buyers find.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 font-body text-sm uppercase tracking-wide text-on-surface-variant md:flex-row md:justify-end md:gap-8">
          <span className="opacity-80">&copy; {new Date().getFullYear()} GEO-Pulse</span>
          <Link href="/solutions/msps" className="hover:text-on-background hover:underline">For MSPs</Link>
          <Link href="/about" className="hover:text-on-background hover:underline">About</Link>
          <Link href="/privacy" className="hover:text-on-background hover:underline">Privacy</Link>
          <a
            href="https://www.linkedin.com/company/getgeopulse"
            rel="me noopener"
            target="_blank"
            className="hover:text-on-background hover:underline"
          >
            LinkedIn
          </a>
          <Link href="/login" className="hover:text-on-background hover:underline">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
