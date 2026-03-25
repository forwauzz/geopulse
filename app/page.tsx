import { ScanForm } from '@/components/scan-form';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export default function HomePage() {
  const siteKey = getTurnstileSiteKey();

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
          <div className="space-y-3 text-red-600">
            <p>
              Turnstile is not configured for this deployment. In{' '}
              <strong className="font-semibold">Cloudflare → Workers &amp; Pages → your Worker → Settings → Variables</strong>, set{' '}
              <code className="rounded bg-geo-mist/20 px-1">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> to your widget’s{' '}
              <em>site key</em> (public), and add <code className="rounded bg-geo-mist/20 px-1">TURNSTILE_SECRET_KEY</code> as a{' '}
              <em>secret</em>. In the Turnstile dashboard, add this app’s hostname (e.g.{' '}
              <code className="rounded bg-geo-mist/20 px-1">geo-pulse.uzzielt.workers.dev</code> or{' '}
              <code className="rounded bg-geo-mist/20 px-1">geopulse.io</code>) to the widget’s hostnames. Redeploy after
              changing vars; if the UI still shows this, set the same <code className="rounded bg-geo-mist/20 px-1">NEXT_PUBLIC_*</code>{' '}
              values under Workers Builds → <strong className="font-semibold">Build variables</strong> so the client bundle picks them up.
            </p>
            <p className="text-sm text-geo-mist">
              Local only: for <code className="rounded bg-geo-mist/20 px-1">npm run dev</code>, use{' '}
              <code className="rounded bg-geo-mist/20 px-1">.env.local</code> — see{' '}
              <code className="rounded bg-geo-mist/20 px-1">.env.local.example</code>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
