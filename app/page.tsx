import { ScanForm } from '@/components/scan-form';

export default function HomePage() {
  const siteKey = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-geo-accent">GEO-Pulse</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-geo-ink md:text-5xl">
        How ready is your site for AI search?
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-geo-mist">
        Free instant audit: AI Search Readiness Score plus the top issues to fix. No account required.
      </p>
      <div className="mt-12">
        {siteKey ? (
          <ScanForm siteKey={siteKey} />
        ) : (
          <p className="text-red-600">
            Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY — add it to run scans locally.
          </p>
        )}
      </div>
    </main>
  );
}
