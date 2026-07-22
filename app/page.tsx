import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanForm } from '@/components/scan-form';
import { AiEngineStrip } from '@/components/ai-engines';
import { ScrollReveal } from '@/components/scroll-reveal';
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
import { loadUiFlags } from '@/lib/server/app-ui-flags';

const features = [
  {
    icon: 'visibility',
    title: 'See where AI includes you',
    body: 'Understand whether your public pages are structured well enough for answer engines to find, interpret, and reuse in buyer-relevant moments.',
  },
  {
    icon: 'rule_settings',
    title: 'Fix what keeps you from being cited',
    body: 'Turn crawl, structure, metadata, and trust gaps into a practical fix list instead of another static audit report.',
  },
  {
    icon: 'task_alt',
    title: 'Turn audits into shipped work',
    body: 'Move from findings to prioritized implementation work across engineering, content, and SEO without guessing what matters first.',
  },
  {
    icon: 'monitoring',
    title: 'Prove improvement over time',
    body: 'Surface patterns that affect how clearly your pages present facts and entities — not rankings or predictions.',
  },
] as const;

const faqItems = [
  {
    question: 'What does GEO-Pulse check?',
    answer:
      'It checks the signals that affect how clearly machines can crawl, interpret, and reuse your public pages. That includes robots rules, crawl access, structured data, heading structure, trust cues, internal linking, and content extractability.',
  },
  {
    question: 'What does AI search readiness mean?',
    answer:
      'AI search readiness means a public page is easy for crawlers and answer engines to fetch, segment, understand, and quote. The core requirements are crawl access, clear page structure, explicit entities, and copy that can stand on its own when extracted.',
  },
  {
    question: 'Do I need an account to run a scan?',
    answer:
      'No. You can run a free scan first. You only need an account when you want to save reports, compare runs over time, manage a workspace, or route findings to a team workflow.',
  },
  {
    question: 'Is this a ranking or traffic prediction tool?',
    answer:
      'No. GEO-Pulse helps you measure visibility readiness and presence signals, but it does not guarantee rankings, traffic, or citations.',
  },
  {
    question: 'What should I fix first after a scan?',
    answer:
      'Fix blocking directives and crawl access first. Then improve answer structure, metadata, and trust signals on the public pages that explain your product, capture demand, or support high-intent queries.',
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
    title: 'See',
    body: 'Scan your public site to understand where AI visibility is weak, fragile, or blocked by crawl, structure, and trust gaps.',
  },
  {
    step: '2',
    title: 'Fix',
    body: 'Turn the findings into prioritized implementation work so the right team can move on the right changes first.',
  },
  {
    step: '3',
    title: 'Prove',
    body: 'Track whether visibility is improving over time so progress means more than a one-time score change.',
  },
] as const;

const answerBlocks = [
  {
    title: 'What the product does',
    body: 'GEO-Pulse helps teams see where AI includes them, fix what keeps them from being cited, and track whether visibility is improving over time.',
  },
  {
    title: 'What the score is for',
    body: 'The score is a leading indicator for prioritization, not the product outcome. The real outcome is stronger inclusion in the AI answers that matter.',
  },
  {
    title: 'What a strong result looks like',
    body: 'A strong result means important pages are crawlable, explicit, easy to extract, and easier for answer engines to understand and reuse accurately.',
  },
  {
    title: 'What to do first',
    body: 'Fix blocking directives first, then improve answer structure, trust signals, and product clarity on the pages that shape demand.',
  },
] as const;

const extractabilityChecklist = [
  'One clear H1 that names the page topic directly.',
  'Short sections that answer one question or decision at a time.',
  'Definitions, lists, and steps that still make sense when quoted alone.',
  'Visible authorship, canonical URLs, and supporting references where claims matter.',
] as const;

const audienceUseCases = [
  {
    title: 'Founders and in-house teams',
    body: 'Use GEO-Pulse to understand whether AI is ignoring the pages that explain your product, pricing, and buyer value before you invest in more content.',
  },
  {
    title: 'Agencies',
    body: 'Use the same workflow across client sites to separate real visibility blockers from lower-signal cleanup work and move clients toward shipped fixes faster.',
  },
  {
    title: 'Content and SEO operators',
    body: 'Use the report to identify where pages need clearer definitions, better internal linking, and stronger extractability instead of more volume for its own sake.',
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
  // When Pricing is hidden by the App Settings flag, point CTAs at sign-in instead.
  const uiFlags = await loadUiFlags();
  const gapsCtaHref = uiFlags.show_pricing ? '/pricing' : '/login';
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
      <ScrollReveal />
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
      <section className="relative overflow-hidden border-b border-outline-variant/15 px-6 pb-12 pt-10 text-center md:px-10 md:pb-20 md:pt-16">
        <div className="relative mx-auto max-w-6xl">
          <h1 className="mx-auto max-w-5xl font-sans text-5xl font-black uppercase leading-[0.9] tracking-tighter text-on-background md:text-7xl lg:text-8xl">
            Stop guessing whether{' '}
            <span
              className="box-decoration-clone inline-block -rotate-1 px-[0.12em]"
              style={{ backgroundImage: 'linear-gradient(transparent 12%, #fde047 12%, #fde047 84%, transparent 84%)' }}
            >
              AI
            </span>{' '}
            is surfacing your company.
          </h1>
          <div className="mt-8">
            <AiEngineStrip />
          </div>
          <p className="mx-auto mt-4 max-w-2xl font-body text-sm text-on-surface-variant">
            Editorially maintained by {SITE_EDITORIAL_NAME}.
          </p>
          <p className="mx-auto mt-6 max-w-3xl font-body text-base leading-7 text-on-surface-variant md:text-lg">
            See, fix, and prove your AI visibility. GEO-Pulse shows where your company appears in AI
            answers, turns gaps into prioritized improvements, and helps you verify whether visibility
            is improving over time.
          </p>
          {uiFlags.show_monitor_subscription ? (
            <p className="mx-auto mt-6 inline-flex items-center gap-2.5 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 font-sans text-base font-bold text-on-background shadow-sm md:text-lg">
              <span className="material-symbols-outlined text-primary" aria-hidden>autorenew</span>
              Free instant audit — then monitor monthly from{' '}
              <span className="font-black text-primary">$39/mo</span>
            </p>
          ) : null}
          <div className="mx-auto mt-10 max-w-5xl">
            {siteKey ? (
              <ScanForm
                variant="hero"
                siteKey={siteKey}
                defaultUrl={prefillUrl}
                agencyAccountId={agencyAccount ?? null}
                agencyClientId={agencyClient ?? null}
              />
            ) : (
              <div className="space-y-3 rounded-3xl border border-error/20 bg-surface-container-low p-6 text-left text-error shadow-float">
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={gapsCtaHref}
              className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              See your AI visibility gaps
            </Link>
            <Link
              href="/about"
              className="inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              How it works
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-3xl font-body text-sm leading-7 text-on-surface-variant">
            Start with a free audit to see where AI visibility is weak, what to fix first, and whether
            the gaps are serious enough to warrant deeper implementation work.
          </p>
        </div>
      </section>

      {/* Stats band — capability facts, in big bold numbers */}
      <section className="border-y border-outline-variant/15 bg-surface-container-low px-6 py-16 md:px-10 md:py-20">
        <div data-reveal className="mx-auto grid max-w-screen-2xl grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {[
            { n: '16', label: 'Readiness checks per audit' },
            { n: '5', label: 'AI answer engines checked' },
            { n: '~90s', label: 'To your first score' },
            { n: '$39', label: 'Per month to keep watch' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-sans text-5xl font-black tracking-tighter text-primary md:text-7xl">{s.n}</p>
              <p className="mt-2 font-body text-sm text-on-surface-variant">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Prove-it-improves — coloured trend chart + a big delta number */}
      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          <div data-reveal className="lg:col-span-5">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">Prove it&rsquo;s working</span>
            <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
              Watch your AI visibility climb
            </h2>
            <p className="mt-4 max-w-md font-body text-on-surface-variant">
              A one-time audit is a snapshot. With monthly monitoring you see the line move — every
              fix reflected in a fresh score, tracked against your local competitors.
            </p>
            <div className="mt-8 flex items-end gap-4">
              <span className="font-sans text-6xl font-black tracking-tighter text-primary md:text-7xl">+33</span>
              <span className="mb-2 font-body text-sm leading-snug text-on-surface-variant">
                points gained across an
                <br />
                example 6-month track
              </span>
            </div>
          </div>
          <div data-reveal className="lg:col-span-7">
            <div className="rounded-3xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-float md:p-8">
              <div className="flex items-center justify-between">
                <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">AI search readiness score</p>
                <span className="rounded-md bg-green-100 px-2 py-0.5 font-label text-[0.6rem] font-bold uppercase tracking-wide text-green-800 dark:bg-green-500/15 dark:text-green-200">Example</span>
              </div>
              <div className="mt-4 text-primary">
                <svg viewBox="0 0 480 240" className="w-full" role="img" aria-label="Example score trend rising from 46 to 79 over six months">
                  <defs>
                    <linearGradient id="gp-score-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((i) => (
                    <line key={i} x1="30" x2="460" y1={40 + i * 50} y2={40 + i * 50} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
                  ))}
                  <path d="M30,150 L116,124 L202,105 L288,82 L374,70 L460,52 L460,190 L30,190 Z" fill="url(#gp-score-fill)" />
                  <path d="M30,150 L116,124 L202,105 L288,82 L374,70 L460,52" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  {[[30, 150], [116, 124], [202, 105], [288, 82], [374, 70], [460, 52]].map(([x, y]) => (
                    <circle key={x} cx={x} cy={y} r="4" fill="currentColor" />
                  ))}
                  <circle cx="460" cy="52" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
                </svg>
              </div>
              <div className="mt-3 flex justify-between font-label text-[0.62rem] uppercase tracking-wide text-on-surface-variant">
                <span>Month 1 · 46</span>
                <span>Month 6 · 79</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-low px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="group space-y-4">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-lowest transition-colors duration-300 group-hover:bg-primary group-hover:text-on-primary">
                <span className="material-symbols-outlined">{f.icon}</span>
              </div>
              <h3 className="font-sans text-xl font-black uppercase tracking-tight text-on-background">{f.title}</h3>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">
              Direct answers
            </span>
            <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
              A better score is not the point
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              The real outcome is making your company easier for AI systems to find, understand, and
              include in relevant answers. The score is useful, but it is not the value by itself.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:col-span-8 md:grid-cols-2">
            {answerBlocks.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float"
              >
                <p className="font-label text-xs uppercase tracking-widest text-primary">
                  {item.title}
                </p>
                <p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
          <div data-reveal className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">How it works</span>
            <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
              See, fix, and prove your AI visibility
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              GEO-Pulse is strongest when it helps you understand where AI includes you, what blocks
              better visibility, and whether the changes are actually working over time.
            </p>
          </div>
          <div className="lg:col-span-8">
            <figure data-reveal className="mb-8 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
              <img
                src="/media/journey-cards.webp"
                alt="Three stages side by side: an invisible, low-signal page; the same page scanned by GEO-Pulse flagging visibility gaps, citation blockers, and weak trust signals; and a structured, trusted page included in AI answers."
                className="block h-auto w-full"
                loading="lazy"
                decoding="async"
                width={1920}
                height={1071}
              />
              <figcaption className="px-6 py-4 font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">
                See — Fix — Prove, in one picture
              </figcaption>
            </figure>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {howItWorks.map((item) => (
                <div key={item.title} className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-label text-xs font-bold text-primary">
                      {item.step}
                    </span>
                    <h3 className="font-sans text-lg font-black uppercase tracking-tight text-on-background">{item.title}</h3>
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
        <figure data-reveal className="mb-16 overflow-hidden rounded-3xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
          <img
            src="/media/browser-journey.webp"
            alt="A site's journey across three browser mockups: an unstructured content page, the same page with gaps like citation blocked, trust low, and structure errors flagged, then the page rewritten so AI answer cards quote it as a trusted source."
            className="block h-auto w-full"
            loading="lazy"
            decoding="async"
            width={1920}
            height={1071}
          />
          <figcaption className="px-6 py-4 font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">
            From invisible content to AI answer source — the shape of the fix
          </figcaption>
        </figure>
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-12">
          <div className="space-y-12 lg:col-span-5">
            <div>
              <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">What you get</h2>
              <p className="mb-12 font-body text-on-surface-variant">
                Every scan should answer three questions clearly: where AI visibility is weak, what
                to fix first, and how to tell whether progress is becoming real rather than cosmetic.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Visibility</h4>
                <p className="font-sans text-lg font-black uppercase tracking-tight text-on-background">AI inclusion gaps</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Diagnosis</h4>
                <p className="font-sans text-lg font-black uppercase tracking-tight text-on-background">Top blockers to fix</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Execution</h4>
                <p className="font-sans text-lg font-black uppercase tracking-tight text-on-background">Priority implementation path</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Evidence</h4>
                <p className="font-sans text-lg font-black uppercase tracking-tight text-on-background">Tracked improvement over time</p>
              </div>
            </div>
          </div>
          <div data-reveal className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 lg:col-span-7">
            <div className="relative z-10 rounded-xl bg-surface-container-lowest p-8 md:p-10">
              <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant opacity-70">
                    Sample report
                  </span>
                  <h3 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">yourdomain.com</h3>
                </div>
                <span className="rounded-md bg-tertiary/10 px-3 py-1 font-label text-xs font-bold uppercase tracking-widest text-tertiary-dim">
                  Illustration
                </span>
              </div>
              <div className="mb-10 grid grid-cols-1 gap-8 md:grid-cols-3">
                <div>
                  <div className="mb-2 font-sans text-7xl font-black leading-none tracking-tighter text-on-background tabular-nums">—</div>
                  <div className="font-label text-[0.62rem] uppercase tracking-[0.16em] text-on-surface-variant">
                    Site Readiness Score
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full w-3/5 bg-primary" />
                  </div>
                  <p className="mt-3 font-body text-xs text-on-surface-variant">
                    Run a scan to see where visibility is fragile, which blockers matter first, and how the
                    first fixes should be sequenced. The numbers here are illustrative only.
                  </p>
                </div>
              </div>
              <div className="mb-8 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5">
                <p className="font-label text-xs uppercase tracking-widest text-primary">
                  What a useful report should clarify
                </p>
                <ol className="mt-4 space-y-3 font-body text-sm leading-7 text-on-surface-variant">
                  <li>1. Which pages or signals are limiting inclusion in AI answers.</li>
                  <li>2. Which fixes deserve engineering or content attention first.</li>
                  <li>3. Which improvements should be tracked to prove the work is paying off.</li>
                </ol>
              </div>
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Why teams use it</p>
              <ul className="mt-4 space-y-4 font-body text-sm text-on-surface-variant">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                  <span>See whether AI is ignoring the pages that explain your product, offer, and buyer value.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                  <span>Turn findings into concrete implementation work instead of leaving the audit in a doc.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                  <span>Track whether progress is becoming real, not just prettier in an internal scoring model.</span>
                </li>
              </ul>
            </div>
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" aria-hidden />
          </div>
        </div>
      </section>

      <section className="bg-surface-container-high/30 px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-10 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">
              Extractability
            </span>
            <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
              What makes a page easier to quote and summarize
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              A page does not become reusable because it is long. It becomes reusable because the
              main claim is explicit and the structure is easy to segment.
            </p>
          </div>
          <div className="lg:col-span-8">
            <figure data-reveal className="mb-8 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
              <img
                src="/media/extract-flow.webp"
                alt="Dense, hard-to-read page blocks on the left fan into clearer, structured components on the right, with a rising trust arrow showing how extractable content turns into quotable answers."
                className="block h-auto w-full"
                loading="lazy"
                decoding="async"
                width={1920}
                height={1071}
              />
            </figure>
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {extractabilityChecklist.map((item, index) => (
                <li
                  key={item}
                  className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float"
                >
                  <p className="font-label text-xs uppercase tracking-widest text-primary">
                    Check {index + 1}
                  </p>
                  <p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">{item}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-high/40 px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-12 md:flex-row">
          <div className="max-w-xl">
            <h2 className="mb-4 font-sans text-2xl font-black uppercase tracking-tight text-on-background md:text-3xl">
              Who GEO-Pulse is for
            </h2>
            <p className="font-body text-on-surface-variant">
              GEO-Pulse is for teams that need to stop guessing whether AI is surfacing them, and
              want a practical way to move from visibility uncertainty to shipped improvements.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
            {audienceUseCases.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float"
              >
                <h3 className="font-sans text-lg font-black uppercase tracking-tight text-on-background">{item.title}</h3>
                <p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">Questions</span>
            <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
              Common questions, answered directly
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              Short answers help people and machines understand the tool without reading the whole
              report or inferring the meaning from layout alone.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 gap-4">
              {faqItems.map((item) => (
                <div key={item.question} className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float">
                  <h3 className="font-sans text-lg font-black uppercase tracking-tight text-on-background">{item.question}</h3>
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
            <h2 className="mt-3 font-sans text-2xl font-black uppercase tracking-tight text-on-background md:text-3xl">
              We align the audit to public standards and search guidance
            </h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">
              GEO-Pulse does not use a hidden scoring model. The checks map to documented crawl,
              metadata, and structured-data guidance so teams can review the underlying standards
              before they act on the report.
            </p>
            <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">
              That makes the output easier to trust internally: engineering can verify the technical
              fixes, content teams can understand the extraction requirements, and operators can tie
              each recommendation back to a public reference.
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
        <h2 className="mb-10 font-sans text-4xl font-black uppercase leading-[0.95] tracking-tighter text-on-background md:text-6xl lg:text-7xl">
          Stop treating AI visibility like guesswork
        </h2>
        <p className="mx-auto max-w-3xl font-body text-base leading-7 text-on-surface-variant">
          Run the pages that explain your offer most directly and see where visibility is weak, what
          to fix first, and whether the work is becoming measurable over time.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href={gapsCtaHref}
            className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
          >
            See your AI visibility gaps
          </Link>
          <Link
            href="/about"
            className="inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-6 py-3 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-low"
          >
            Read how GEO-Pulse works
          </Link>
        </div>
        <p className="mt-4 font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">
          No credit card for the free audit
        </p>
        <p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">
          Start with the page that explains your offer most directly. That is usually where answer
          engines and high-intent buyers decide whether the rest of the site is worth trusting.
        </p>
      </section>
    </main>
  );
}
