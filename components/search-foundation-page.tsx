import Link from 'next/link';

type Faq = { question: string; answer: string };
type FoundationPageProps = {
  eyebrow: string;
  title: string;
  lede: string;
  directAnswer: string;
  whyItMatters: string;
  foundations: readonly { title: string; body: string }[];
  workflow: readonly { title: string; body: string }[];
  faqs: readonly Faq[];
  related: readonly { href: string; label: string; body: string }[];
};

/** Shared, server-rendered commercial education layout for the core search-intent pages. */
export function SearchFoundationPage({
  eyebrow,
  title,
  lede,
  directAnswer,
  whyItMatters,
  foundations,
  workflow,
  faqs,
  related,
}: FoundationPageProps) {
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <section className="max-w-4xl">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
        <h1 className="mt-4 font-sans text-5xl font-black uppercase leading-[0.9] tracking-tighter text-on-background md:text-7xl">
          {title}
        </h1>
        <p className="mt-7 max-w-3xl font-body text-lg leading-relaxed text-on-surface-variant">{lede}</p>
        <div className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-6 shadow-float">
          <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Direct answer</p>
          <p className="mt-3 max-w-3xl font-body text-base leading-relaxed text-on-background">{directAnswer}</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/#audit"
            className="inline-flex rounded-xl bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            Run a free audit
          </Link>
          <Link
            href="/methodology/ai-search-readiness-audit"
            className="inline-flex rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-6 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
          >
            See the methodology
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Why this matters</p>
          <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background">
            Readiness before volume
          </h2>
        </div>
        <p className="font-body text-lg leading-relaxed text-on-surface-variant">{whyItMatters}</p>
      </section>

      <section className="mt-16">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">What to check</p>
        <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
          The controllable foundations
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {foundations.map((item, index) => (
            <article key={item.title} className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-6 shadow-float">
              <p className="font-label text-xs font-semibold text-primary">0{index + 1}</p>
              <h3 className="mt-3 font-sans text-xl font-black uppercase tracking-tight text-on-background">{item.title}</h3>
              <p className="mt-3 font-body leading-relaxed text-on-surface-variant">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-3xl bg-surface-container-low p-7 md:p-10">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">A practical workflow</p>
        <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">
          See the gap, then ship the fix
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {workflow.map((item, index) => (
            <li key={item.title} className="rounded-2xl bg-surface-container-lowest p-6">
              <span className="font-label text-sm font-bold text-primary">{index + 1}</span>
              <h3 className="mt-3 font-sans text-xl font-black uppercase tracking-tight text-on-background">{item.title}</h3>
              <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Related guides</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {related.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-6 transition hover:bg-surface-container-low">
              <h2 className="font-sans text-xl font-black uppercase tracking-tight text-on-background">{item.label}</h2>
              <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 max-w-4xl">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Questions</p>
        <h2 className="mt-3 font-sans text-3xl font-black uppercase tracking-tight text-on-background md:text-4xl">Common questions</h2>
        <div className="mt-7 space-y-4">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-6">
              <h3 className="font-sans text-xl font-black uppercase tracking-tight text-on-background">{faq.question}</h3>
              <p className="mt-3 font-body leading-relaxed text-on-surface-variant">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
