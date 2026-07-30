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
    title: 'AI Visibility You Can Prove, Fix, and Report | GEO-Pulse',
    description: 'See where competitors win in AI answers, what to fix on your website, and whether the work improved your visibility.',
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
  const description = 'See where competitors win in AI answers, what to fix on your website, and whether the work improved your visibility.';
  const schemas = [
    buildOrganizationStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebSiteStructuredData({ url: siteUrl, description: SITE_DESCRIPTION }),
    buildWebPageStructuredData({
      url: siteUrl,
      title: 'AI Visibility You Can Prove, Fix, and Report | GEO-Pulse',
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

      <section className="relative border-b border-gold/25 bg-[linear-gradient(180deg,rgb(var(--blog-hero-tint)),rgb(var(--color-background)))] px-5 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16">
        <div className="mx-auto max-w-6xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 font-body text-xs font-semibold text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            Built for agencies, consultants, and ambitious businesses
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance font-headline text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-on-background sm:text-5xl md:text-6xl lg:text-7xl">
            AI visibility you can prove, fix, and report.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance font-body text-base leading-7 text-on-surface-variant md:text-lg">
            See where competitors win in AI answers, what is holding your website back, and whether your work actually improved the result.
          </p>

          <div id="audit" className="mx-auto mt-8 max-w-3xl scroll-mt-24">
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
              <div className="rounded-2xl border border-error/20 bg-surface-container-lowest p-5 text-left text-sm text-error">
                The free audit is temporarily unavailable. Please check back shortly.
              </div>
            )}
          </div>
          <p className="mt-3 font-body text-xs text-on-surface-variant">Free first audit · No credit card · Your first priorities in about 90 seconds</p>

          <div className="mx-auto mt-8 max-w-5xl">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Measure visibility across the engines buyers use
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 rounded-2xl border border-gold/25 bg-surface-container-lowest px-6 py-6 shadow-sm md:gap-x-14 md:px-10">
              {AI_ENGINES.map((engine) => (
                <EngineLogo
                  key={engine.key}
                  engine={engine}
                  className={heroEngineLogoClass(engine.key)}
                />
              ))}
            </div>
          </div>

          <div className="mx-auto mt-10 overflow-hidden rounded-[2rem] border border-gold/30 bg-surface-container-lowest p-3 text-left shadow-[0_24px_80px_rgba(15,23,42,0.12)] md:p-5">
            <div className="rounded-[1.35rem] border border-outline-variant/20 bg-surface-container-low p-5 md:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-5">
                <div>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-primary">Example product view</p>
                  <p className="mt-1 font-headline text-xl font-semibold text-on-background">One answer, connected to the next action</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 font-body text-xs font-semibold text-emerald-700 dark:text-emerald-300">Example data · Monitoring active</span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-[0.8fr_1.2fr_1fr]">
                <div className="rounded-2xl border border-gold/15 bg-[rgb(var(--blog-card-a))] p-5">
                  <p className="font-body text-xs text-on-surface-variant">AI visibility score</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-headline text-5xl font-semibold tracking-tight text-on-background">72</span>
                    <span className="mb-1 text-sm font-semibold text-emerald-600">+8</span>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full w-[72%] rounded-full bg-primary" />
                  </div>
                  <p className="mt-3 font-body text-[11px] text-on-surface-variant">Measured across buyer questions</p>
                </div>
                <div className="rounded-2xl border border-gold/15 bg-[rgb(var(--blog-card-a))] p-5">
                  <p className="font-body text-xs text-on-surface-variant">Visibility by engine</p>
                  <div className="mt-5 space-y-4">
                    {previewEngines.map((engine) => (
                      <div key={engine.key} className="flex items-center justify-between gap-4">
                        <EngineLogo engine={engine} className={previewEngineLogoClass(engine.key)} />
                        <span className="font-mono text-xs text-on-surface-variant">{previewEngineScores[engine.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-gold/15 bg-[rgb(var(--blog-card-a))] p-5">
                  <p className="font-body text-xs text-on-surface-variant">Why competitors win</p>
                  <p className="mt-3 font-headline text-lg font-semibold leading-snug text-on-background">Their service pages answer the buyer question more directly.</p>
                  <p className="mt-3 font-body text-xs leading-5 text-on-surface-variant">Next: improve 3 priority pages · verify on the next run</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-6 grid max-w-4xl gap-3 text-left sm:grid-cols-3">
            {[
              ['01', 'Find the gap', 'See the questions where competitors appear and you do not.'],
              ['02', 'Fix the cause', 'Get practical website and content changes tied to evidence.'],
              ['03', 'Prove the result', 'Measure again and share progress without rebuilding the report.'],
            ].map(([number, title, copy]) => (
              <div key={number} className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-5 py-4">
                <p className="font-mono text-xs font-semibold text-primary">{number}</p>
                <p className="mt-2 font-headline text-base font-semibold text-on-background">{title}</p>
                <p className="mt-1 font-body text-xs leading-5 text-on-surface-variant">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 md:py-20">
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
                  Explore {lane.eyebrow.toLowerCase()} <span aria-hidden>→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gold/25 bg-[rgb(var(--blog-card-c))] px-5 py-12 sm:px-6">
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
