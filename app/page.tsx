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

const modelPlatforms = [
  {
    label: 'ChatGPT',
    icon: 'chatgpt' as const,
    iconClassName: 'text-[#10A37F]',
  },
  {
    label: 'Perplexity',
    icon: 'perplexity' as const,
    iconClassName: 'text-[#1FB8A6]',
  },
  {
    label: 'Claude',
    icon: 'claude' as const,
    iconClassName: 'text-[#D97757]',
  },
  {
    label: 'Gemini',
    icon: 'gemini' as const,
    iconClassName: 'text-[#5B7CFA]',
  },
] as const;

function ModelPlatformLogo({
  icon,
  className,
}: {
  icon: (typeof modelPlatforms)[number]['icon'];
  className?: string;
}) {
  const classes = className ?? '';

  if (icon === 'chatgpt') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes} fill="none">
        <path
          d="M12 3.25 17.5 6.5v6L12 15.75 6.5 12.5v-6L12 3.25Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m9.2 7.6 5.6 8.8M14.8 7.6l-5.6 8.8M7 12h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === 'perplexity') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes} fill="none">
        <path
          d="M6 7.5h12M6 12h12M6 16.5h12M8 5v14M16 5v14"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === 'claude') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={classes} fill="none">
        <path
          d="M7.5 5.5h8a3 3 0 0 1 0 6h-7a3.5 3.5 0 1 0 0 7h8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes} fill="none">
      <path
        d="m12 4.5 1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8L12 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m17.2 14.8.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

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
      <section className="relative overflow-hidden px-6 pb-12 pt-8 text-center md:px-10 md:pb-18 md:pt-12">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-80"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgb(var(--color-tertiary) / 0.12), transparent 42%), radial-gradient(circle at 20% 24%, rgb(var(--color-gold) / 0.12), transparent 26%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <h1 className="mx-auto max-w-5xl font-headline text-4xl font-bold leading-[1.05] tracking-tight text-on-background md:text-6xl lg:text-7xl">
            Stop guessing whether AI is <span className="text-tertiary">surfacing</span> your company.
          </h1>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {modelPlatforms.map((platform) => (
              <span
                key={platform.label}
                className="inline-flex items-center gap-2 rounded-full border border-tertiary/20 bg-surface-container-lowest px-4 py-2 shadow-float"
              >
                <span className={`h-4 w-4 ${platform.iconClassName}`}>
                  <ModelPlatformLogo icon={platform.icon} className="h-full w-full" />
                </span>
                <span className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">
                  {platform.label}
                </span>
              </span>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-2xl font-body text-sm text-on-surface-variant">
            Editorially maintained by {SITE_EDITORIAL_NAME}.
          </p>
          <p className="mx-auto mt-6 max-w-3xl font-body text-base leading-7 text-on-surface-variant md:text-lg">
            See, fix, and prove your AI visibility. GEO-Pulse shows where your company appears in AI
            answers, turns gaps into prioritized improvements, and helps you verify whether visibility
            is improving over time.
          </p>
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
              href="/pricing"
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
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="relative overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-float">
              <video
                className="block h-auto w-full"
                src="/media/hero-pulse.mp4"
                poster="/media/hero-pulse-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Animated visual: a connected globe lights up and a heartbeat pulse sweeps across it, illustrating AI visibility"
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-container-lowest/90 to-transparent"
                aria-hidden
              />
            </div>
            <p className="mt-4 font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">
              The pulse of your AI visibility — rendered, not guessed
            </p>
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
              <h3 className="font-headline text-xl font-bold text-on-background">{f.title}</h3>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-screen-2xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">
              Direct answers
            </span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
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
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">How it works</span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
              See, fix, and prove your AI visibility
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              GEO-Pulse is strongest when it helps you understand where AI includes you, what blocks
              better visibility, and whether the changes are actually working over time.
            </p>
          </div>
          <div className="lg:col-span-8">
            <figure className="mb-8 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
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
        <figure className="mb-16 overflow-hidden rounded-3xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
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
              <h2 className="mb-6 font-headline text-3xl font-bold text-on-background md:text-4xl">What you get</h2>
              <p className="mb-12 font-body text-on-surface-variant">
                Every scan should answer three questions clearly: where AI visibility is weak, what
                to fix first, and how to tell whether progress is becoming real rather than cosmetic.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Visibility</h4>
                <p className="font-headline text-lg font-bold text-on-background">AI inclusion gaps</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Diagnosis</h4>
                <p className="font-headline text-lg font-bold text-on-background">Top blockers to fix</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Execution</h4>
                <p className="font-headline text-lg font-bold text-on-background">Priority implementation path</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
                <h4 className="mb-2 font-label text-xs uppercase tracking-widest text-primary">Evidence</h4>
                <p className="font-headline text-lg font-bold text-on-background">Tracked improvement over time</p>
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
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">
              Extractability
            </span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
              What makes a page easier to quote and summarize
            </h2>
            <p className="mt-4 max-w-sm font-body text-on-surface-variant">
              A page does not become reusable because it is long. It becomes reusable because the
              main claim is explicit and the structure is easy to segment.
            </p>
          </div>
          <div className="lg:col-span-8">
            <figure className="mb-8 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
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
            <h2 className="mb-4 font-headline text-2xl font-bold text-on-background md:text-3xl">
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
                <h3 className="font-headline text-lg font-bold text-on-background">{item.title}</h3>
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
          <div className="lg:col-span-4">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">Questions</span>
            <h2 className="mt-3 font-headline text-3xl font-bold text-on-background md:text-4xl">
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
        <h2 className="mb-10 font-headline text-3xl font-bold text-on-background md:text-4xl lg:text-5xl">
          Stop treating AI visibility like guesswork
        </h2>
        <p className="mx-auto max-w-3xl font-body text-base leading-7 text-on-surface-variant">
          Run the pages that explain your offer most directly and see where visibility is weak, what
          to fix first, and whether the work is becoming measurable over time.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/pricing"
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
