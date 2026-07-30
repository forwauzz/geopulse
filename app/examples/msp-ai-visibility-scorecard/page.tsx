import type { Metadata } from 'next';
import Link from 'next/link';
import { MSP_EXAMPLE } from '@/lib/marketing/msp-example';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

const title = 'Annotated MSP AI Visibility Scorecard Example | GEO-Pulse';
const description =
  'See an illustrative, annotated GEO-Pulse scorecard for a fictional managed service provider, including observations, boundaries, and next actions.';

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({
    baseUrl: await loadBaseUrl(),
    title,
    description,
    canonicalPath: '/examples/msp-ai-visibility-scorecard',
  });
}

export default async function MspScorecardExamplePage() {
  const baseUrl = await loadBaseUrl();
  const schema = buildWebPageStructuredData({
    url: toAbsoluteUrl(baseUrl, '/examples/msp-ai-visibility-scorecard'),
    title,
    description,
    siteUrl: toAbsoluteUrl(baseUrl, '/'),
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <section className="max-w-4xl">
        <div className="inline-flex rounded-full bg-amber-500/10 px-4 py-2 font-label text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
          Illustrative example · not a customer result
        </div>
        <h1 className="mt-6 text-balance font-headline text-4xl font-semibold leading-tight tracking-[-0.035em] text-on-background md:text-6xl">
          What an MSP AI-search readiness scorecard actually shows.
        </h1>
        <p className="mt-6 max-w-3xl font-body text-lg leading-8 text-on-surface-variant">
          This page uses a fictional company, a reserved <code>.example</code> domain, and example
          data to demonstrate the GEO-Pulse report format. It does not represent customer
          performance, a testimonial, or a promised result.
        </p>
      </section>

      <section className="mt-12 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="rounded-3xl border border-outline-variant/25 bg-surface-container-lowest p-7 shadow-float">
          <p className="font-label text-xs uppercase tracking-[0.14em] text-on-surface-variant">
            Fictional domain
          </p>
          <p className="mt-2 font-mono text-sm text-on-background">{MSP_EXAMPLE.domain}</p>
          <div className="mt-8 flex items-end gap-3">
            <span className="font-headline text-7xl font-semibold tracking-tight text-on-background">
              {MSP_EXAMPLE.score}
            </span>
            <span className="mb-2 font-body text-sm text-on-surface-variant">
              /100 · grade {MSP_EXAMPLE.grade}
            </span>
          </div>
          <p className="mt-4 font-body text-sm leading-6 text-on-surface-variant">
            The readiness score summarizes observable site checks. It is not an estimate of leads,
            revenue, rankings, or the probability of an AI recommendation.
          </p>
          <div className="mt-8 space-y-5">
            {MSP_EXAMPLE.categories.map((category) => (
              <div key={category.label}>
                <div className="flex justify-between font-body text-xs text-on-surface-variant">
                  <span>{category.label}</span>
                  <span>{category.score}/100</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${category.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          {MSP_EXAMPLE.findings.map((finding, index) => (
            <article
              key={finding.label}
              className="rounded-3xl border border-outline-variant/25 bg-surface-container-lowest p-7"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-label text-xs font-semibold text-primary">0{index + 1}</span>
                <span
                  className={`rounded-full px-2.5 py-1 font-label text-[11px] font-semibold uppercase ${
                    finding.status === 'pass'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {finding.status === 'pass' ? 'Observed pass' : 'Needs work'}
                </span>
              </div>
              <h2 className="mt-4 font-sans text-2xl font-semibold text-on-background">
                {finding.label}
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-surface-container-low p-5">
                  <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                    Observation
                  </p>
                  <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">
                    {finding.observation}
                  </p>
                </div>
                <div className="rounded-2xl bg-primary/5 p-5">
                  <p className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    Practical next step
                  </p>
                  <p className="mt-3 font-body text-sm leading-6 text-on-background">
                    {finding.nextStep}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl bg-primary px-7 py-10 text-on-primary md:px-10">
        <div className="grid items-center gap-7 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-headline text-3xl font-semibold">Replace the example with your site.</h2>
            <p className="mt-3 max-w-2xl font-body leading-7 opacity-85">
              Run the free audit for observable evidence, or request a focused walkthrough if you
              want help interpreting the first priorities.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/#audit"
              className="inline-flex rounded-xl bg-on-primary px-5 py-3 font-body text-sm font-semibold text-primary"
            >
              Run the free audit
            </Link>
            <Link
              href="/solutions/msps#walkthrough"
              className="inline-flex rounded-xl border border-on-primary/35 px-5 py-3 font-body text-sm font-semibold text-on-primary"
            >
              Request a walkthrough
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
