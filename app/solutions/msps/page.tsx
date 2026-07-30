import type { Metadata } from 'next';
import Link from 'next/link';
import { WalkthroughRequestForm } from '@/components/walkthrough-request-form';
import { MSP_EXAMPLE } from '@/lib/marketing/msp-example';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

const title = 'AI Search Visibility Audits for MSPs | GEO-Pulse';
const description =
  'See what AI answer engines can understand about your managed IT services, where your website evidence is weak, and what to improve first.';

const faqs = [
  {
    question: 'What does GEO-Pulse check for an MSP?',
    answer:
      'The free audit checks public website access, structure, service clarity, metadata, trust cues, structured data, and extractability. Monitoring can separately measure configured buyer questions across supported answer engines.',
  },
  {
    question: 'Does a higher score guarantee AI recommendations?',
    answer:
      'No. The score summarizes observable website readiness signals. It does not guarantee rankings, citations, traffic, or inclusion in an AI answer.',
  },
  {
    question: 'Do I need to change my website before the walkthrough?',
    answer:
      'No. The useful starting point is the site you have now. We use its public evidence to identify the smallest defensible next step.',
  },
] as const;

const buyerQuestions = [
  'Which managed IT provider serves businesses in my area?',
  'Who can help a small company improve cybersecurity?',
  'Which MSP supports Microsoft 365 and cloud migrations?',
] as const;

const workflow = [
  {
    step: '01',
    title: 'Audit the public evidence',
    body: 'See whether your site is accessible, understandable, and specific enough for answer engines to reuse.',
  },
  {
    step: '02',
    title: 'Fix the highest-confidence gaps',
    body: 'Prioritize the technical, service-page, entity, and trust changes that the audit can support with evidence.',
  },
  {
    step: '03',
    title: 'Measure the buyer questions',
    body: 'Use recurring monitoring to observe whether your company is mentioned or cited for configured prompts over time.',
  },
] as const;

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({
    baseUrl: await loadBaseUrl(),
    title,
    description,
    canonicalPath: '/solutions/msps',
  });
}

export default async function MspsSolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ website?: string }>;
}) {
  const baseUrl = await loadBaseUrl();
  const { website = '' } = await searchParams;
  const schema = buildWebPageStructuredData({
    url: toAbsoluteUrl(baseUrl, '/solutions/msps'),
    title,
    description,
    siteUrl: toAbsoluteUrl(baseUrl, '/'),
  });
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <main className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="border-b border-outline-variant/20 bg-[radial-gradient(circle_at_15%_0%,rgba(99,102,241,0.18),transparent_40%)] px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="font-label text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              For managed service providers
            </p>
            <h1 className="mt-5 max-w-3xl text-balance font-headline text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-on-background sm:text-5xl md:text-6xl">
              Make your IT expertise easier for AI answers to understand.
            </h1>
            <p className="mt-6 max-w-2xl font-body text-lg leading-8 text-on-surface-variant">
              GEO-Pulse shows what your website communicates about your services, locations, and
              trust signals—then separates observable gaps from assumptions so you know what to fix
              first.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/#audit"
                className="inline-flex min-h-[48px] items-center rounded-xl bg-primary px-6 font-body text-sm font-semibold text-on-primary"
              >
                Run the free MSP audit
              </Link>
              <Link
                href="#walkthrough"
                className="inline-flex min-h-[48px] items-center rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-6 font-body text-sm font-semibold text-on-background"
              >
                Request a focused walkthrough
              </Link>
            </div>
            <p className="mt-4 font-body text-xs text-on-surface-variant">
              No credit card for the first audit · No ranking or citation guarantees
            </p>
          </div>

          <div className="rounded-[2rem] border border-outline-variant/25 bg-surface-container-lowest p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <p className="font-label text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Buyer-question lens
            </p>
            <p className="mt-3 font-headline text-2xl font-semibold text-on-background">
              Your site needs to support the answer, not just list the service.
            </p>
            <div className="mt-6 space-y-3">
              {buyerQuestions.map((question) => (
                <div
                  key={question}
                  className="flex gap-3 rounded-2xl bg-surface-container-low p-4"
                >
                  <span className="material-symbols-outlined mt-0.5 text-xl text-primary" aria-hidden>
                    forum
                  </span>
                  <p className="font-body text-sm leading-6 text-on-surface-variant">{question}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 font-body text-xs leading-5 text-on-surface-variant">
              Examples of prompts an MSP may choose to monitor. GEO-Pulse reports observed results;
              it does not promise inclusion.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
        <div className="max-w-3xl">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            A sales problem hiding inside a website problem
          </p>
          <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight text-on-background md:text-4xl">
            Generic service pages make a specific recommendation harder to support.
          </h2>
          <p className="mt-5 font-body leading-7 text-on-surface-variant">
            An MSP can be excellent at delivery and still publish thin evidence about industries,
            service areas, security capabilities, response model, and company identity. The audit
            makes those gaps visible without pretending to know an answer engine’s private ranking
            logic.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {workflow.map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-6 shadow-float"
            >
              <p className="font-label text-xs font-semibold text-primary">{item.step}</p>
              <h3 className="mt-3 font-sans text-xl font-semibold text-on-background">{item.title}</h3>
              <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="example-scorecard"
        className="border-y border-outline-variant/20 bg-surface-container-low px-6 py-16 md:px-10 md:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="font-label text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Transparent product example
              </p>
              <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight text-on-background md:text-4xl">
                See the format before you trust the recommendation.
              </h2>
              <p className="mt-4 font-body leading-7 text-on-surface-variant">
                This illustrative scorecard uses a fictional MSP and example data. It demonstrates
                how GEO-Pulse separates an observation, its implication, and a practical next step.
                It is not a customer result.
              </p>
            </div>
            <Link
              href="/examples/msp-ai-visibility-scorecard"
              className="inline-flex rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-5 py-3 font-body text-sm font-semibold text-on-background"
            >
              Open the annotated example
            </Link>
          </div>

          <div className="mt-9 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="rounded-3xl bg-surface-container-lowest p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-body text-xs text-on-surface-variant">{MSP_EXAMPLE.domain}</p>
                  <p className="mt-1 font-sans text-sm font-semibold text-on-background">
                    Example AI-search readiness
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1.5 font-body text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Illustrative data
                </span>
              </div>
              <div className="mt-7 flex items-end gap-3">
                <span className="font-headline text-6xl font-semibold text-on-background">
                  {MSP_EXAMPLE.score}
                </span>
                <span className="mb-2 font-body text-sm text-on-surface-variant">
                  /100 · grade {MSP_EXAMPLE.grade}
                </span>
              </div>
              <div className="mt-7 space-y-4">
                {MSP_EXAMPLE.categories.map((category) => (
                  <div key={category.label}>
                    <div className="flex justify-between font-body text-xs text-on-surface-variant">
                      <span>{category.label}</span>
                      <span>{category.score}</span>
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
            </div>

            <div className="space-y-3">
              {MSP_EXAMPLE.findings.slice(0, 2).map((finding) => (
                <article
                  key={finding.label}
                  className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-6"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 font-label text-[11px] font-semibold uppercase ${
                        finding.status === 'pass'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {finding.status === 'pass' ? 'Observed pass' : 'Needs work'}
                    </span>
                    <h3 className="font-sans text-base font-semibold text-on-background">
                      {finding.label}
                    </h3>
                  </div>
                  <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">
                    {finding.observation}
                  </p>
                  <p className="mt-4 border-l-2 border-primary/30 pl-4 font-body text-sm leading-6 text-on-background">
                    <strong>Next step:</strong> {finding.nextStep}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="walkthrough" className="scroll-mt-24 px-6 py-16 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl border border-outline-variant/25 bg-surface-container-lowest p-7 shadow-float md:p-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="font-label text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Sales-assisted path
            </p>
            <h2 className="mt-3 font-headline text-3xl font-semibold tracking-tight text-on-background">
              Prefer a person to walk through it with you?
            </h2>
            <p className="mt-4 font-body leading-7 text-on-surface-variant">
              Send the site and the business question you are trying to answer. We will review the
              public evidence and focus the conversation on the smallest useful next move.
            </p>
            <ul className="mt-6 space-y-3 font-body text-sm leading-6 text-on-surface-variant">
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden>check</span>
                No forced account creation
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden>check</span>
                No unsupported visibility promise
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden>check</span>
                One accountable owner for the follow-up
              </li>
            </ul>
          </div>
          <WalkthroughRequestForm
            siteKey={getTurnstileSiteKey()}
            source="msp_solution"
            defaultWebsite={website}
          />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-20 md:px-10">
        <h2 className="font-headline text-3xl font-semibold tracking-tight text-on-background">
          Questions
        </h2>
        <div className="mt-6 space-y-3">
          {faqs.map((faq) => (
            <article
              key={faq.question}
              className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-6"
            >
              <h3 className="font-sans text-lg font-semibold text-on-background">{faq.question}</h3>
              <p className="mt-2 font-body leading-7 text-on-surface-variant">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
