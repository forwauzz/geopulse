import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AI_ENGINES, EngineLogo } from '@/components/ai-engines';
import { HomeVisibilityFlow } from '@/components/home-visibility-flow';
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

function heroEngineLogoClass(engineKey: string): string {
  if (engineKey === 'claude') return 'h-7 w-48';
  if (engineKey === 'perplexity') return 'h-12 w-44';
  return 'h-10 w-auto max-w-[180px] md:h-12';
}

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: 'AI Visibility Monitoring for MSPs | GEO-Pulse',
    description: 'See where AI recommends competitors, connect every answer to website evidence, and verify whether your changes improved visibility.',
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
  const description = 'See where AI recommends competitors, connect every answer to website evidence, and verify whether your changes improved visibility.';
  const schemas = [
    buildOrganizationStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebSiteStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebPageStructuredData({
      url: siteUrl,
      title: 'AI Visibility Monitoring for MSPs | GEO-Pulse',
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

      <section className="home-commercial-hero border-b border-gold/20 px-5 pb-10 pt-10 sm:px-6 md:pb-12 md:pt-14">
        <div className="mx-auto grid max-w-[90rem] items-center gap-12 xl:grid-cols-2 xl:gap-10">
          <div className="relative z-10 max-w-3xl">
            <p className="inline-flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-[0.16em] text-[#4d5fd2]">
              <span className="h-2 w-2 rounded-full bg-[#7e88e8]" aria-hidden />
              AI visibility monitoring for MSPs
            </p>
            <h1 className="mt-6 font-body text-[clamp(2.65rem,3.35vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#17202f]">
              <span className="xl:block">See where AI </span>
              <span className="xl:block xl:whitespace-nowrap">recommends competitors&mdash;</span>
              <span>and what to fix next.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-balance font-body text-base leading-7 text-[#5f6878] md:text-lg md:leading-8">
              GEO-Pulse scans the buyer questions that matter, connects every answer to website evidence, and verifies whether your changes improved visibility.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/#audit" className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#101827] px-7 py-4 font-body text-sm font-semibold text-white shadow-[0_16px_36px_rgba(16,24,39,0.16)] transition hover:-translate-y-0.5 hover:bg-[#202b3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4d5fd2]">
                Scan my MSP website
              </Link>
              <Link href="/walkthrough" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#cfd3dc] bg-white/85 px-7 py-4 font-body text-sm font-semibold text-[#222b3a] transition hover:-translate-y-0.5 hover:border-[#9ca4b6] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4d5fd2]">
                <span className="material-symbols-outlined text-xl" aria-hidden>play_circle</span>
                Watch the walkthrough
              </Link>
            </div>
            <p className="mt-4 font-body text-xs text-[#77808e]">Free first scan <span aria-hidden>&middot;</span> No credit card <span aria-hidden>&middot;</span> Results in about 90 seconds</p>
          </div>

          <HomeVisibilityFlow />
        </div>

        <div className="mx-auto mt-12 max-w-5xl border-t border-[#d9d3c6] pt-8 md:mt-14">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 md:gap-x-11">
            {AI_ENGINES.map((engine) => (
              <EngineLogo key={engine.key} engine={engine} className={heroEngineLogoClass(engine.key)} />
            ))}
          </div>
          <p className="mt-6 text-center font-body text-lg font-medium tracking-[-0.02em] text-[#3a4352] md:text-xl">
            Measure visibility across the engines buyers use
          </p>
        </div>
      </section>

      <section id="audit" className="scroll-mt-24 border-b border-gold/20 bg-surface-container-lowest px-5 py-12 sm:px-6 md:py-14">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-primary">Start with your MSP website</p>
          <h2 className="mt-3 text-balance font-headline text-3xl font-semibold tracking-tight text-on-background md:text-4xl">Get the first evidence in about 90 seconds.</h2>
          <p className="mx-auto mt-3 max-w-2xl font-body text-sm leading-6 text-on-surface-variant md:text-base">Enter a public website. GEO-Pulse will surface the first observable visibility and readiness priorities without requiring a credit card.</p>
          <div className="mx-auto mt-7 max-w-3xl">
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
              <div className="rounded-2xl border border-error/20 bg-surface-container-low p-5 text-left text-sm text-error">
                The free audit is temporarily unavailable. Please check back shortly.
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="product" className="scroll-mt-24 px-5 py-16 sm:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-primary">The closed loop</p>
            <h2 className="mt-3 text-balance font-headline text-3xl font-semibold tracking-tight text-on-background md:text-4xl">More useful than another visibility score</h2>
            <p className="mt-4 font-body leading-7 text-on-surface-variant">GEO-Pulse connects measurement to the reason, the fix, and the next verified result.</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {productLanes.map((lane) => (
              <article key={lane.title} className="flex flex-col rounded-3xl border border-outline-variant/25 bg-surface-container-lowest p-7 transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-float">
                <span className="material-symbols-outlined flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{lane.icon}</span>
                <p className="mt-6 font-body text-xs font-semibold uppercase tracking-[0.16em] text-primary">{lane.eyebrow}</p>
                <h3 className="mt-2 font-headline text-2xl font-semibold tracking-tight text-on-background">{lane.title}</h3>
                <ul className="mt-5 flex-1 space-y-3">
                  {lane.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 font-body text-sm leading-6 text-on-surface-variant">
                      <span className="material-symbols-outlined mt-0.5 text-base text-emerald-600" aria-hidden>check</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
                <Link href={lane.href} className="mt-7 inline-flex items-center gap-1 font-body text-sm font-semibold text-primary">
                  Explore {lane.eyebrow.toLowerCase()} <span aria-hidden>&rarr;</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-gold/25 bg-[rgb(var(--blog-card-c))] px-5 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 text-center sm:grid-cols-3">
          {[['Measure', 'buyer questions and visibility'], ['Explain', 'why competitors are winning'], ['Verify', 'whether the fix worked']].map(([number, label]) => (
            <div key={label}>
              <p className="font-headline text-4xl font-semibold tracking-tight text-on-background">{number}</p>
              <p className="mt-2 font-body text-sm text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-3xl bg-[#151a2d] text-white">
            <div className="relative h-64">
              <Image
                src="/media/small-business-owner-v2.webp"
                alt="An independent business owner reviewing their website on a laptop"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#151a2d] via-transparent to-transparent" aria-hidden />
            </div>
            <div className="p-8 pt-6 md:p-10 md:pt-7">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-[#aab4ff]">For businesses</p>
              <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight">Turn uncertainty into your next move.</h2>
              <p className="mt-4 max-w-lg font-body leading-7 text-white/70">Start with an automatic baseline, see where competitors are recommended, and know which website and content fixes deserve attention.</p>
              <Link href="/#audit" className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 font-body text-sm font-semibold text-[#151a2d]">Run my free audit</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl bg-primary text-on-primary">
            <div className="relative h-64">
              <Image
                src="/media/agency-team-v2.webp"
                alt="A marketing agency team reviewing a client strategy together"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary via-transparent to-transparent" aria-hidden />
            </div>
            <div className="p-8 pt-6 md:p-10 md:pt-7">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] opacity-75">For agencies</p>
              <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight">Prove value across every client.</h2>
              <p className="mt-4 max-w-lg font-body leading-7 opacity-80">Benchmark every client, explain the competitive gap, and send branded scorecards and recurring proof from one portfolio.</p>
              <Link href="/solutions/agencies" className="mt-7 inline-flex rounded-xl bg-on-primary px-5 py-3 font-body text-sm font-semibold text-primary">Explore agency tools</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-outline-variant/20 px-5 py-14 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-primary">Common questions</p>
            <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight text-on-background">Clear answers before you start.</h2>
          </div>
          <div className="divide-y divide-outline-variant/25 border-y border-outline-variant/25">
            {faqItems.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-headline text-lg font-semibold text-on-background">
                  {item.question}
                  <span className="material-symbols-outlined text-on-surface-variant transition group-open:rotate-45" aria-hidden>add</span>
                </summary>
                <p className="mt-3 max-w-2xl pr-10 font-body text-sm leading-7 text-on-surface-variant">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 md:pb-24">
        <div className="mx-auto flex max-w-6xl flex-col items-center rounded-[2rem] border border-gold/25 bg-[rgb(var(--blog-card-a))] px-6 py-12 text-center shadow-float md:px-10">
          <h2 className="max-w-3xl text-balance font-headline text-3xl font-semibold tracking-tight text-on-background md:text-4xl">Find out where your next customer can and cannot find you.</h2>
          <p className="mt-4 font-body text-on-surface-variant">Start free. Get a clear score and your first priorities in about 90 seconds.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/#audit" className="rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary">Run a free audit</Link>
            <Link href={primaryHref} className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background">
              {uiFlags.show_pricing ? 'See plans' : 'Sign in'}
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 font-body text-xs text-on-surface-variant">
            <Link href="/blog" className="hover:text-primary">Guides</Link>
            <Link href="/about" className="hover:text-primary">Methodology</Link>
            <Link href="/ai-seo-audit" className="hover:text-primary">AI SEO audit</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
