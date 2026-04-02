import Link from 'next/link';

export const metadata = {
  title: 'Pricing | GEO-Pulse',
  description: 'Simple pricing for GEO-Pulse AI search readiness scans and deep audits.',
};

const tiers = [
  {
    name: 'Free scan',
    price: '$0',
    body: 'Run an AI search readiness scan in under a minute. No account required.',
    points: ['One readiness score', 'Top issues to fix', 'Priority recommendations'],
    ctaLabel: 'Run free scan',
    ctaHref: '/',
  },
  {
    name: 'Deep audit',
    price: 'Custom checkout',
    body: 'Generate the full PDF audit when you need a shareable artifact for clients or internal teams.',
    points: ['Expanded issue breakdown', 'PDF report export', 'Saved report in dashboard after sign-in'],
    ctaLabel: 'Start with free scan',
    ctaHref: '/',
  },
] as const;

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-screen-2xl px-6 py-16 md:px-10 md:py-24">
      <section className="mx-auto max-w-3xl text-center">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Pricing</p>
        <h1 className="mt-4 font-headline text-4xl font-bold text-on-background md:text-5xl">
          Start free, upgrade only when you need the full audit
        </h1>
        <p className="mt-6 font-body text-lg leading-relaxed text-on-surface-variant">
          GEO-Pulse keeps the initial audit simple. Run the free scan first, then unlock the deeper report when you
          need a client-ready artifact.
        </p>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-2">
        {tiers.map((tier) => (
          <article key={tier.name} className="rounded-2xl bg-surface-container-low p-8 shadow-float">
            <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">{tier.name}</p>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background">{tier.price}</h2>
            <p className="mt-4 font-body text-on-surface-variant">{tier.body}</p>
            <ul className="mt-6 space-y-3 font-body text-sm text-on-surface-variant">
              {tier.points.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link
              href={tier.ctaHref}
              className="mt-8 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
            >
              {tier.ctaLabel}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
