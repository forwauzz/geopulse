import type { Metadata } from 'next';
import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

const title = 'AI Search Audits and Monitoring for Agencies | GEO-Pulse';
const description =
  'Turn a prospect scan into a client-ready AI search audit, prioritized work, and recurring visibility monitoring across ChatGPT, Gemini, and Perplexity.';

const faqs = [
  {
    question: 'How does an agency use GEO-Pulse to win work?',
    answer:
      'Run a free scan on a prospect’s public site, use the observable findings to explain the opportunity, and scope the highest-priority technical or content work. Paid agency plans add client workspaces, history, reports, and recurring prompt monitoring.',
  },
  {
    question: 'Can we monitor client visibility in AI answer engines?',
    answer:
      'Yes. Agency plans can track configured prompts across ChatGPT, Gemini, and Perplexity. Results show observed mentions and citations over time; they do not guarantee future visibility.',
  },
  {
    question: 'Does this replace technical SEO?',
    answer:
      'No. GEO-Pulse adds an AI-search readiness and answer-engine measurement layer to the technical SEO, content, and digital PR work your agency already delivers.',
  },
] as const;

async function loadBaseUrl() {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({
    baseUrl: await loadBaseUrl(),
    title,
    description,
    canonicalPath: '/solutions/agencies',
  });
}

const workflow = [
  {
    icon: 'search',
    title: 'Win the conversation',
    body: 'Scan a prospect’s site and lead with evidence: what is blocked, what is unclear, and what should change first.',
  },
  {
    icon: 'description',
    title: 'Turn evidence into work',
    body: 'Give the client a clear report and route each finding to technical SEO, content, schema, trust, or digital PR.',
  },
  {
    icon: 'autorenew',
    title: 'Prove progress monthly',
    body: 'Re-audit the site and track configured prompts so the client can see what shipped and how observed visibility changes.',
  },
] as const;

const planRows = [
  ['Client management', 'Multiple clients and domains in one agency workspace'],
  ['Client-ready evidence', 'Branded, visual reports with prioritized findings and audit history'],
  ['Prompt tracking', 'ChatGPT, Gemini, and Perplexity with plan-based cadence and limits'],
  ['Delivery', 'Email on Agency Core; email, Slack, and portal options by plan'],
] as const;

export default async function AgenciesSolutionPage() {
  const baseUrl = await loadBaseUrl();
  const schema = buildWebPageStructuredData({
    url: toAbsoluteUrl(baseUrl, '/solutions/agencies'),
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
    <main className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <section className="mx-auto max-w-4xl text-center">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">For marketing agencies</p>
        <h1 className="mt-4 font-sans text-4xl font-bold tracking-tight text-on-background md:text-6xl">
          Find the gap. Sell the work. Prove the progress.
        </h1>
        <p className="mx-auto mt-6 max-w-3xl font-body text-lg leading-8 text-on-surface-variant">
          GEO-Pulse helps your agency turn AI-search uncertainty into a useful prospect audit,
          a concrete client roadmap, and recurring visibility reporting.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/#audit" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary">
            <span className="material-symbols-outlined text-lg" aria-hidden>bolt</span>
            Run a free prospect scan
          </Link>
          <Link href="/pricing#agency-plans" className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background">
            See agency plans
            <span className="material-symbols-outlined text-lg" aria-hidden>arrow_forward</span>
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {workflow.map((item, index) => (
          <article key={item.title} className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-6 shadow-float">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined" aria-hidden>{item.icon}</span>
            </div>
            <p className="mt-5 font-label text-xs text-on-surface-variant">0{index + 1}</p>
            <h2 className="mt-2 font-sans text-xl font-semibold text-on-background">{item.title}</h2>
            <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-16 grid gap-10 rounded-3xl bg-surface-container-low p-7 md:grid-cols-[0.8fr_1.2fr] md:p-10">
        <div>
          <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">What you can sell</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-on-background">
            A recurring service with visible work behind it.
          </h2>
          <p className="mt-4 font-body leading-7 text-on-surface-variant">
            Use the audit to open the door. Deliver the fixes through your existing services.
            Keep the relationship with re-audits and measured prompt visibility.
          </p>
        </div>
        <div className="divide-y divide-outline-variant/20 rounded-2xl bg-surface-container-lowest px-6">
          {planRows.map(([label, body]) => (
            <div key={label} className="py-5">
              <h3 className="font-sans text-sm font-semibold text-on-background">{label}</h3>
              <p className="mt-1 font-body text-sm leading-6 text-on-surface-variant">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="font-sans text-3xl font-bold tracking-tight text-on-background">Clear boundaries build trust.</h2>
        <p className="mt-4 font-body leading-7 text-on-surface-variant">
          GEO-Pulse reports observable site signals and measured prompt results. It does not promise
          rankings, citations, traffic, or inclusion in any answer engine. Your agency gets defensible
          evidence and a practical next move—not a black-box promise.
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="font-sans text-3xl font-bold tracking-tight text-on-background">Questions</h2>
        <div className="mt-6 space-y-3">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-6">
              <h3 className="font-sans text-lg font-semibold text-on-background">{faq.question}</h3>
              <p className="mt-2 font-body leading-7 text-on-surface-variant">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-3xl bg-primary px-7 py-10 text-center text-on-primary">
        <h2 className="font-sans text-3xl font-bold tracking-tight">Start with one prospect.</h2>
        <p className="mx-auto mt-3 max-w-2xl font-body opacity-85">
          Run the free scan, see the evidence, and decide whether GEO-Pulse belongs in your agency’s offer.
        </p>
        <Link href="/#audit" className="mt-6 inline-flex rounded-xl bg-on-primary px-6 py-3 font-body text-sm font-semibold text-primary">
          Run the free scan
        </Link>
      </section>
    </main>
  );
}
