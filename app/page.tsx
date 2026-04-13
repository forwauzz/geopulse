import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanForm } from '@/components/scan-form';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildOrganizationStructuredData,
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  buildWebSiteStructuredData,
  SITE_EDITORIAL_NAME,
  SITE_DESCRIPTION,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

const features = [
  {
    icon: 'smart_toy',
    title: 'Crawl access',
    body: 'Review robots and server signals so public pages you intend to expose stay discoverable without weakening security controls.',
  },
  {
    icon: 'schema',
    title: 'Structured data',
    body: 'Check JSON-LD and schema signals so machines can interpret your page context clearly.',
  },
  {
    icon: 'description',
    title: 'Content extractability',
    body: 'Inspect structure and markup so core content is not buried in noise or fragile layout.',
  },
  {
    icon: 'podcasts',
    title: 'Authority signals',
    body: 'Surface patterns that affect how clearly your pages present facts and entities — not rankings or predictions.',
  },
] as const;

const faqItems = [
  {
    question: 'What does GEO-Pulse check?',
    answer:
      'It checks the signals that affect how clearly machines can crawl, interpret, and reuse your public pages, including robots rules, structured data, heading structure, trust cues, and content extractability.',
  },
  {
    question: 'Do I need an account to run a scan?',
    answer:
      'No. You can run a free scan first. An account is only needed if you want to save reports, compare runs over time, or use the full workspace.',
  },
  {
    question: 'Is this a ranking or traffic prediction tool?',
    answer:
      'No. GEO-Pulse is an audit tool. It surfaces readiness gaps and practical fixes, but it does not predict rankings, traffic, or citations.',
  },
] as const;

const referenceLinks = [
  {
    label: 'Google Search Central: robots meta tags',
    href: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag',
  },
  {
    label: 'Schema.org: FAQPage',
    href: 'https://schema.org/FAQPage',
  },
] as const;

const howItWorks = [
  {
    step: '1',
    title: 'Audit',
    body: 'Scan your public site for crawl access, structured data, trust cues, and content extractability.',
  },
  {
    step: '2',
    title: 'Automate',
    body: 'Turn the findings into reusable reports and machine-readable guidance for your team.',
  },
  {
    step: '3',
    title: 'Integrate',
    body: 'Push the audit outputs into Slack so marketing and engineering can act on the same plan.',
  },
] as const;

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: 'GEO-Pulse | AI Search Readiness',
    description: SITE_DESCRIPTION,
    canonicalPath: '/',
    openGraphType: 'website',
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; agencyAccount?: string; agencyClient?: string }>;
}) {
  const { url: prefillUrl, agencyAccount, agencyClient } = await searchParams;
  const baseUrl = await loadBaseUrl();
  const siteKey = getTurnstileSiteKey();
  const siteUrl = toAbsoluteUrl(baseUrl, '/');
  const pageModifiedAt = new Date().toISOString();
  const organizationSchema = buildOrganizationStructuredData({
    url: siteUrl,
    description: SITE_DESCRIPTION,
  });
  const websiteSchema = buildWebSiteStructuredData({
    url: siteUrl,
    description: SITE_DESCRIPTION,
  });
  const homePageSchema = buildWebPageStructuredData({
    url: siteUrl,
    title: 'GEO-Pulse | AI Search Readiness',
    description: SITE_DESCRIPTION,
    siteUrl,
    dateModified: pageModifiedAt,
    authorName: SITE_EDITORIAL_NAME,
    authorUrl: siteUrl,
  });
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GEO-Pulse',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    description: SITE_DESCRIPTION,
    featureList: [
      'Free AI search readiness audit',
      'Structured data and crawlability checks',
      'Saved reports and dashboard history',
    ],
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homePageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="relative mx-auto max-w-screen-2xl overflow-hidden px-6 pb-24 pt-16 text-center md:px-10 md:pb-32 md:pt-24">
        <div className="mb-6">
          <span className="inline-block rounded-full bg-surface-container-high px-3 py-1 font-label text-xs font-semibold uppercase tracking-widest text-primary">
            Website readiness audit
          </span>
        </div>
        <h1 className="mx-auto mb-8 max-w-4xl font-headline text-4xl font-bold leading-tight tracking-tight text-on-background md:text-6xl lg:text-7xl">
          Make Your Website Discoverable by ChatGPT, Perplexity, and Gemini.
        </h1>
        <p className="mx-auto mb-12 max-w-2xl font-body text-lg leading-relaxed text-on-surface-variant md:text-xl">
          Get one score, the key issues, and priority fixes. Run a free scan, or sign up to save reports and unlock the full workspace.
        </p>
        <p className="mx-auto mb-6 max-w-2xl font-body text-sm text-on-surface-variant">
          Editorially maintained by {SITE_EDITORIAL_NAME}.
        </p>
        <div className="mx-auto mb-6 max-w-3xl">
          {siteKey ? (
            <ScanForm
              siteKey={siteKey}
              defaultUrl={prefillUrl}
              agencyAccountId={agencyAccount ?? null}
              agencyClientId={agencyClient ?? null}
            />
          ) : (
            <div className="space-y-3 rounded-xl bg-surface-container-low p-6 text-left text-error">
              <p className="font-medium">Turnstile is not configured for this deployment.</p>
              <p className="text-sm text-on-surface-variant">
                In{' '}
                <strong className="text-on-background">Cloudflare → Workers &amp; Pages → your Worker → Settings → Variables</strong>, set{' '}
                <code className="rounded bg-surface-container-lowest px-1">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> to your widget’s{' '}
                <em>site key</em> (public), and add <code className="rounded bg-surface-container-lowest px-1">TURNSTILE_SECRET_KEY</code> as a{' '}
                <em>secret</em>. Add this app’s hostname to the widget’s hostnames. Redeploy after changing vars; for client bundles, set{' '}
                <code className="rounded bg-surface-container-lowest px-1">NEXT_PUBLIC_*</code> under Workers Builds → Build variables.
              </p>
              <p className="text-sm text-on-surface-variant">
                Local: use <code className="rounded bg-surface-container-lowest px-1">.env.local</code> — see{' '}
                <code className="rounded bg-surface-container-lowest px-1">.env.local.example</code>.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-8 text-on-surface-variant opacity-80">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span className="font-label text-xs uppercase tracking-wider">Free audit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">no_accounts</span>
            <span className="font-label text-xs uppercase tracking-wider">No account required</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">bolt</span>
            <span className="font-label text-xs uppercase tracking-wider">Fast results</span>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login?mode=signup&next=/pricing"
            className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
          <Link
            href="/pricing"
            className="inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
          >
            See plans
          </Link>
        </div>
      </section>

      <section className="bg-surface-container-low px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="group space-y-4">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-lowest transition-colors duration-300 group-hover:bg-primary group-hover:text-on-primary">
                <span className="material-symbols-outlined">{f.icon}</span>
              </div>
              <h3 className="font-headline text-xl font-bold text-on-background">{f.title}</h3>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">How it works</span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
              Three steps from scan to action
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              The workflow stays simple: inspect the site, turn findings into a repeatable report, and route the output into Slack.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {howItWorks.map((item) => (
                <div key={item.title} className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-label text-xs font-bold text-primary">
                      {item.step}
                    </span>
                    <h3 className="font-headline text-lg font-bold text-on-background">{item.title}</h3>
                  </div>
                  <p className="mt-4 font-body text-sm leading-relaxed text-on-surface-variant">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-12">
          <div className="space-y-12 lg:col-span-5">
            <div>
              <h2 className="mb-6 font-headline text-3xl font-bold text-on-background md:text-4xl">What you get</h2>
              <p className="mb-12 font-body text-on-surface-variant">
                Every scan produces a concise report: one score, the issues that matter most, and fixes you can act on.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Metrics</h4>
                <p className="font-headline text-lg font-bold text-on-background">Site Readiness Score</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Analysis</h4>
                <p className="font-headline text-lg font-bold text-on-background">Top issues to fix</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Action</h4>
                <p className="font-headline text-lg font-bold text-on-background">Priority recommendations</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Optional</h4>
                <p className="font-headline text-lg font-bold text-on-background">Deep audit PDF</p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 lg:col-span-7">
            <div className="relative z-10 rounded-xl bg-surface-container-lowest p-8 md:p-10">
              <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant opacity-70">
                    Sample report
                  </span>
                  <h3 className="mt-1 font-headline text-2xl font-bold text-on-background">yourdomain.com</h3>
                </div>
                <span className="rounded-md bg-tertiary/10 px-3 py-1 font-label text-xs font-bold uppercase tracking-widest text-tertiary-dim">
                  Illustration
                </span>
              </div>
              <div className="mb-10 grid grid-cols-1 gap-8 md:grid-cols-3">
                <div>
                  <div className="mb-2 font-sans text-5xl font-bold text-primary">—</div>
                  <div className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                    Site Readiness Score
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full w-3/5 bg-primary" />
                  </div>
                  <p className="mt-3 font-body text-xs text-on-surface-variant">
                    Run a scan to see your score and prioritized fixes — numbers here are a layout preview only.
                  </p>
                </div>
              </div>
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Priority fixes</p>
              <ul className="mt-4 space-y-4 font-body text-sm text-on-surface-variant">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                  <span>Structured data and crawl signals tailored to your URL.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                  <span>Actionable fixes — no predicted rankings or traffic outcomes.</span>
                </li>
              </ul>
            </div>
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" aria-hidden />
          </div>
        </div>
      </section>

      <section className="bg-surface-container-high/40 px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-12 md:flex-row">
          <div className="max-w-xl">
            <h2 className="mb-4 font-headline text-2xl font-bold text-on-background md:text-3xl">
              Built for teams &amp; agencies
            </h2>
            <p className="font-body text-on-surface-variant">
              Use the same audit flow for client sites — free scan first, optional paid deep report when you need a
              shareable artifact.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <div className="flex items-center gap-2 font-label text-sm uppercase tracking-wide text-on-surface-variant opacity-90">
              <span className="material-symbols-outlined text-primary">picture_as_pdf</span>
              PDF export
            </div>
            <div className="flex items-center gap-2 font-label text-sm uppercase tracking-wide text-on-surface-variant opacity-90">
              <span className="material-symbols-outlined text-primary">account_circle</span>
              Account history
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">Questions</span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
              Common questions, answered directly
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              Short answers help people and machines understand the tool without reading the whole report.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 gap-4">
              {faqItems.map((item) => (
                <div key={item.question} className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float">
                  <h3 className="font-headline text-lg font-bold text-on-background">{item.question}</h3>
                  <p className="mt-3 max-w-3xl font-body text-sm leading-relaxed text-on-surface-variant">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-low px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">
              References
            </span>
            <h2 className="mt-3 font-headline text-2xl font-bold text-on-background md:text-3xl">
              We align the audit to public standards and search guidance
            </h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">
              The checks in GEO-Pulse map to documented crawl, metadata, and structured-data guidance instead of opaque scoring rules.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {referenceLinks.map((reference) => (
              <a
                key={reference.href}
                href={reference.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 font-body text-sm font-medium text-on-background transition hover:bg-surface-container"
              >
                {reference.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-xl px-6 py-24 text-center md:py-40">
        <h2 className="mb-10 font-headline text-3xl font-bold text-on-background md:text-4xl lg:text-5xl">
          See how clearly your site is set up for search and sharing
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login?mode=signup&next=/pricing"
            className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
          <p className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">
            No credit card for the free scan
          </p>
        </div>
      </section>
    </main>
  );
}
