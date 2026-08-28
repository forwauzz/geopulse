import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AI_ENGINES, EngineLogo } from '@/components/ai-engines';
import { ScanForm } from '@/components/scan-form';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildOrganizationStructuredData,
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  buildWebSiteStructuredData,
  SITE_DESCRIPTION,
  SITE_EDITORIAL_NAME,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';
import { loadUiFlags } from '@/lib/server/app-ui-flags';

const HOME_TITLE = 'AI Visibility Audit for MSPs | GEO-Pulse';
const HOME_DESCRIPTION =
  'Run a free AI visibility audit for your MSP. Check the website signals that help five search and answer engines understand your business, then see what to fix first.';

/** Hero feature cards. Scores are the illustrative set shown on the marketing dashboard. */
const heroCards = [
  {
    key: 'chatgpt',
    engine: 'ChatGPT',
    value: '78',
    note: 'names you first',
    rot: '-10deg',
    delay: '0.05s',
    position: 'left-0 top-24 h-[15.5rem] w-[15.5rem] z-[1]',
    tone: 'bg-lp-lime text-lp-ink',
  },
  {
    key: 'entity',
    engine: 'Entity link',
    value: 'Missing',
    note: 'nothing resolves to you',
    rot: '5deg',
    delay: '0.20s',
    position: 'left-0 top-[23.5rem] h-[12.5rem] w-[12.5rem] z-[1]',
    tone: 'bg-lp-ink text-white',
  },
  {
    key: 'perplexity',
    engine: 'Perplexity',
    value: '64',
    note: 'cites a competitor',
    rot: '7deg',
    delay: '0.12s',
    position: 'right-0 top-16 h-[14.5rem] w-[14.5rem] z-[1]',
    tone: 'bg-lp-blue text-white',
  },
  {
    key: 'google',
    engine: 'Google',
    value: '68',
    note: 'page one, still absent',
    rot: '-6deg',
    delay: '0.28s',
    position: 'right-0 top-[23rem] h-[13rem] w-[13rem] z-[1]',
    tone: 'border-2 border-lp-ink bg-lp-soft text-lp-ink',
  },
] as const;

const humanStats = [
  { value: '5', label: 'engines asked, every scan' },
  { value: '90s', label: 'to your first finding' },
] as const;

/** The two operator types the product is sold to. MSP is spelled out on first use. */
const audiences = [
  {
    kicker: 'MSPs',
    title: 'Managed Service Providers',
    body: 'You win on trust and response time, but the shortlist is drawn before anyone calls you. See which engines name you for the services you actually deliver, in the region you actually cover.',
    cta: 'See the MSP audit',
    href: '/solutions/msps',
    image: '/media/small-business-owner-v2.webp',
    alt: 'A managed service provider working at a laptop',
    surface: 'bg-lp-lime text-lp-ink',
    kickerTone: 'text-lp-ink/55',
    bodyTone: 'text-lp-ink/75',
    ctaTone: 'bg-lp-ink text-white',
  },
  {
    kicker: 'Agencies',
    title: 'Agencies and consultants',
    body: 'Run recurring measurement across every client, connect each finding to the page that caused it, and hand over a report that shows what moved after the work was done.',
    cta: 'See the agency view',
    href: '/solutions/agencies',
    image: '/media/agency-team-v2.webp',
    alt: 'An agency team reviewing client work together',
    surface: 'bg-lp-ink text-white',
    kickerTone: 'text-lp-lime',
    bodyTone: 'text-white/70',
    ctaTone: 'bg-lp-lime text-lp-ink',
  },
] as const;

const loopSteps = [
  { number: '01', title: 'Measure', copy: 'Every engine, asked the questions your buyers ask.', tone: 'bg-lp-lime text-lp-ink', ghost: 'text-lp-ink/20', rot: '-3deg' },
  { number: '02', title: 'Explain', copy: 'Every score traced back to the page that caused it.', tone: 'bg-lp-blue text-white', ghost: 'text-white/25', rot: '2deg' },
  { number: '03', title: 'Fix', copy: 'Ordered by what the evidence says to do first.', tone: 'border-2 border-lp-ink bg-white text-lp-ink', ghost: 'text-lp-line', rot: '-2deg' },
  { number: '04', title: 'Verify', copy: 'Scan again. Keep the record of what changed.', tone: 'bg-lp-ink text-white', ghost: 'text-lp-lime/35', rot: '3deg' },
] as const;

const productLanes = [
  {
    icon: 'visibility',
    eyebrow: 'Measure',
    title: 'See who AI recommends',
    bullets: ['Track the buyer questions that matter', 'Compare your share of answers with competitors', 'See which sources support each answer'],
    href: '/ai-visibility-audit',
  },
  {
    icon: 'travel_explore',
    eyebrow: 'Explain',
    title: 'Know why competitors win',
    bullets: ['Audit crawl, structure, content, and trust', 'Connect findings to the pages that need work', 'Prioritize evidence-backed improvements'],
    href: '/ai-search-optimization',
  },
  {
    icon: 'monitoring',
    eyebrow: 'Verify',
    title: 'Prove what changed',
    bullets: ['Measure again after the work is done', 'Monitor client and competitor movement', 'Share recurring, client-ready reports'],
    href: '/generative-engine-optimization',
  },
] as const;

const faqItems = [
  {
    question: 'What does the free audit check?',
    answer: 'It checks the public signals that help search and AI systems crawl, understand, and reuse your website, including access, structure, metadata, trust cues, and extractability.',
  },
  {
    question: 'Do I need an account?',
    answer: 'No. Run the first audit without an account. Create one when you want to save results, track visibility, monitor competitors, or manage clients.',
  },
  {
    question: 'Is GEO-Pulse for agencies too?',
    answer: 'Yes. Agencies can manage client portfolios, run recurring measurements, and share client-ready scorecards and reports.',
  },
] as const;

const previewEngineScores: Record<string, string> = {
  chatgpt: '78%',
  google: '69%',
  perplexity: '61%',
};

const previewEngines = AI_ENGINES.filter((engine) => engine.key in previewEngineScores);

function heroEngineLogoClass(engineKey: string): string {
  if (engineKey === 'claude') return 'h-7 w-48';
  if (engineKey === 'perplexity') return 'h-12 w-44';
  return 'h-10 w-auto max-w-[180px] md:h-12';
}

function previewEngineLogoClass(engineKey: string): string {
  if (engineKey === 'claude') return 'h-5 w-32';
  if (engineKey === 'perplexity') return 'h-7 w-28';
  return 'h-7 w-auto max-w-[130px]';
}

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
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
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uiFlags = await loadUiFlags();
  const primaryHref = uiFlags.show_pricing ? '/pricing' : '/login';
  const siteUrl = toAbsoluteUrl(baseUrl, '/');
  const description = HOME_DESCRIPTION;
  const schemas = [
    buildOrganizationStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebSiteStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebPageStructuredData({
      url: siteUrl,
      title: HOME_TITLE,
      description,
      siteUrl,
      dateModified: new Date().toISOString(),
      authorName: SITE_EDITORIAL_NAME,
      authorUrl: siteUrl,
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'GEO-Pulse',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: siteUrl,
      description,
      featureList: ['AI visibility tracking', 'Website readiness audits', 'Competitor benchmarking', 'Recurring client reports'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];

  return (
    <main className="overflow-hidden">
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      {/* Hero - colour-block. Feature cards are interleaved with the headline on z-index,
          square and unshadowed, and settle in on easeOutQuint. */}
      <section className="relative overflow-hidden bg-white px-5 pb-4 pt-10 sm:px-6 md:pt-14">
        <div className="relative mx-auto max-w-6xl text-center lg:min-h-[34rem]">
          {heroCards.map((card) => (
            <div
              key={card.key}
              aria-hidden
              className={`lp-card pointer-events-none absolute hidden flex-col justify-between p-4 lg:flex ${card.position} ${card.tone}`}
              style={{ '--lp-rot': card.rot, animationDelay: card.delay } as React.CSSProperties}
            >
              <span className="font-body text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
                Example signal &middot; {card.engine}
              </span>
              <span>
                <span className="block font-headline text-5xl font-semibold leading-none tracking-[-0.04em]">{card.value}</span>
                <span className="mt-1 block font-body text-[11px] font-semibold opacity-70">{card.note}</span>
              </span>
            </div>
          ))}

          <p className="lp-rise relative z-[4] mb-5 font-body text-xs font-bold uppercase tracking-[0.18em] text-lp-blue">
            Free AI visibility audit for MSPs
          </p>
          <h1 className="lp-rise relative z-[2] mx-auto max-w-4xl text-balance font-headline text-5xl font-semibold leading-[0.94] tracking-[-0.045em] text-lp-ink sm:text-6xl md:text-7xl lg:text-[5.75rem]">
            See what AI search understands about your business.
          </h1>
          <p
            className="lp-rise relative z-[4] mx-auto mt-6 max-w-xl text-balance font-body text-base leading-7 text-lp-muted md:text-lg"
            style={{ animationDelay: '0.10s' }}
          >
            Audit the public website signals that help five major search and answer engines crawl,
            understand, and reuse your services. Get your first findings, then see what to fix first.
          </p>

          <div id="audit" className="lp-rise relative z-[4] mx-auto mt-8 max-w-2xl scroll-mt-24" style={{ animationDelay: '0.18s' }}>
            {siteKey || user ? (
              <ScanForm
                variant="hero"
                siteKey={siteKey}
                defaultUrl={prefillUrl}
                agencyAccountId={agencyAccount ?? null}
                agencyClientId={agencyClient ?? null}
                skipTurnstile={Boolean(user)}
              />
            ) : (
              <div className="rounded-2xl border border-error/20 bg-white p-5 text-left text-sm text-error">
                The free audit is temporarily unavailable. Please check back shortly.
              </div>
            )}
          </div>
          <p className="lp-rise relative z-[4] mt-3 font-body text-xs text-lp-subtle" style={{ animationDelay: '0.24s' }}>
            First evidence in about 90 seconds &middot; No credit card &middot; No install
          </p>
        </div>
      </section>

      {/* Human moment */}
      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto grid max-w-6xl items-end gap-10 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-14">
          <div className="relative">
            <Image
              src="/media/operator-portrait.webp"
              alt="An operator reviewing how AI engines describe their business"
              width={900}
              height={1003}
              className="w-full"
              sizes="(min-width: 768px) 22rem, 100vw"
            />
            <p className="absolute bottom-0 left-0 bg-lp-lime px-4 py-3 font-body text-[11px] font-bold uppercase tracking-[0.18em] text-lp-ink">
              Buyer clarity
            </p>
          </div>
          <div className="pb-2">
            <h2 className="text-balance font-headline text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-lp-ink sm:text-4xl md:text-5xl">
              Your buyer asks a machine before they ask you.
            </h2>
            <p className="mt-5 max-w-xl font-body text-base leading-7 text-lp-muted">
              By the time someone lands on your site they have already been handed a shortlist.
              GEO-Pulse shows you whether you were on it, and what put the other names there instead.
            </p>
            <dl className="mt-8 flex gap-10 border-t-2 border-lp-ink pt-6">
              {humanStats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-headline text-4xl font-semibold leading-none tracking-[-0.04em] text-lp-ink">{stat.value}</span>
                    <span className="mt-2 block font-body text-sm text-lp-muted">{stat.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Engines, one card each */}
      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-center font-body text-xs font-semibold uppercase tracking-[0.18em] text-lp-subtle">
            Measured across the engines your buyers actually use
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {AI_ENGINES.map((engine) => (
              <li
                key={engine.key}
                className="flex flex-col items-center justify-center gap-3 border border-lp-line bg-lp-soft px-4 py-7"
              >
                <EngineLogo engine={engine} className={heroEngineLogoClass(engine.key)} />
                <span className="text-center font-body text-xs font-semibold text-lp-muted">{engine.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Who it is for */}
      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-lp-subtle">
            Built for two kinds of operator
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {audiences.map((audience) => (
              <article
                key={audience.title}
                className={`grid border-2 border-lp-ink sm:grid-cols-[minmax(0,15rem)_1fr] ${audience.surface}`}
              >
                <Image
                  src={audience.image}
                  alt={audience.alt}
                  width={1536}
                  height={864}
                  className="h-56 w-full object-cover sm:h-full"
                  sizes="(min-width: 640px) 15rem, 100vw"
                />
                <div className="flex flex-col justify-between p-7">
                  <div>
                    <p className={`font-body text-[11px] font-bold uppercase tracking-[0.18em] ${audience.kickerTone}`}>{audience.kicker}</p>
                    <h3 className="mt-3 font-headline text-2xl font-semibold leading-tight tracking-[-0.03em] md:text-3xl">{audience.title}</h3>
                    <p className={`mt-3 font-body text-sm leading-6 ${audience.bodyTone}`}>{audience.body}</p>
                  </div>
                  <Link href={audience.href} className={`mt-6 self-start rounded-full px-5 py-2.5 font-body text-sm font-semibold ${audience.ctaTone}`}>
                    {audience.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* The loop */}
      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-lp-subtle">The loop (4)</p>
          <h2 className="mt-4 font-headline text-3xl font-semibold uppercase leading-[0.95] tracking-[-0.045em] text-lp-ink md:text-5xl">
            Measure. Explain.<br />Fix. Verify.
          </h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loopSteps.map((step) => (
              <li
                key={step.number}
                className={`flex aspect-square flex-col justify-between p-6 ${step.tone}`}
                style={{ transform: `rotate(${step.rot})` }}
              >
                <span className="font-body text-[11px] font-bold uppercase tracking-[0.18em] opacity-60">Step {step.number}</span>
                <span>
                  <span className={`block font-headline text-7xl font-semibold leading-[0.8] tracking-[-0.04em] ${step.ghost}`}>{step.number}</span>
                  <span className="mt-2 block font-headline text-2xl font-semibold tracking-[-0.03em]">{step.title}</span>
                </span>
                <span className="font-body text-xs leading-5 opacity-75">{step.copy}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-lp-subtle">What you actually get</p>
          <h2 className="mt-4 max-w-2xl text-balance font-headline text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-lp-ink md:text-5xl">
            More useful than another visibility score
          </h2>
          <p className="mt-5 max-w-xl font-body text-base leading-7 text-lp-muted">
            GEO-Pulse connects measurement to the reason, the fix, and the next verified result.
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {productLanes.map((lane) => (
              <article key={lane.title} className="flex flex-col border-2 border-lp-ink bg-white p-8">
                <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-lp-subtle">{lane.eyebrow}</p>
                <h3 className="mt-3 font-headline text-2xl font-semibold tracking-[-0.03em] text-lp-ink md:text-3xl">{lane.title}</h3>
                <ul className="mt-6 flex-1 space-y-3 border-t border-lp-line pt-6">
                  {lane.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 font-body text-sm leading-6 text-lp-muted">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-lp-ink" aria-hidden />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <Link href={lane.href} className="mt-8 inline-flex items-center gap-1 self-start border-b-2 border-lp-ink pb-1 font-body text-sm font-semibold text-lp-ink">
                  Explore {lane.eyebrow.toLowerCase()} <span aria-hidden>&rarr;</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 pt-14 sm:px-6 md:pt-20">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[minmax(0,20rem)_1fr]">
          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-lp-subtle">Common questions</p>
            <h2 className="mt-4 font-headline text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-lp-ink md:text-4xl">
              Clear answers before you start.
            </h2>
          </div>
          <dl className="border-t-2 border-lp-ink">
            {faqItems.map((item) => (
              <div key={item.question} className="border-b border-lp-line py-6">
                <dt className="font-headline text-xl font-semibold tracking-[-0.02em] text-lp-ink">{item.question}</dt>
                <dd className="mt-3 max-w-2xl font-body text-sm leading-6 text-lp-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-white px-5 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-6xl bg-lp-lime px-6 py-16 text-center md:px-12 md:py-20">
          <h2 className="mx-auto max-w-3xl text-balance font-headline text-3xl font-semibold leading-[1.02] tracking-[-0.045em] text-lp-ink md:text-5xl">
            You cannot assume what AI says about your business.
          </h2>
          <p className="mx-auto mt-5 max-w-md font-body text-base leading-7 text-lp-ink/70">
            Run one scan and see the answer for yourself.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/#audit" className="rounded-full bg-lp-ink px-7 py-3.5 font-body text-sm font-semibold text-white">
              Run a free audit
            </Link>
            <Link href={primaryHref} className="rounded-full border-2 border-lp-ink px-7 py-3.5 font-body text-sm font-semibold text-lp-ink">
              {uiFlags.show_pricing ? 'See plans' : 'Sign in'}
            </Link>
          </div>
          <p className="mt-5 font-body text-xs text-lp-ink/60">
            First evidence in about 90 seconds &middot; No credit card
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 font-body text-xs text-lp-ink/70">
            <Link href="/blog" className="underline-offset-4 hover:underline">Guides</Link>
            <Link href="/about" className="underline-offset-4 hover:underline">Methodology</Link>
            <Link href="/ai-seo-audit" className="underline-offset-4 hover:underline">AI SEO audit</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
