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

const editorialCardColors = [
  'bg-[rgb(var(--blog-card-a))]',
  'bg-[rgb(var(--blog-card-b))]',
  'bg-[rgb(var(--blog-card-c))]',
] as const;

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
    <main className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <section className="editorial-panel-warm max-w-5xl overflow-hidden p-7 md:p-12">
        <div className="h-px w-16 bg-gold" aria-hidden />
        <p className="editorial-kicker mt-7">{eyebrow}</p>
        <h1 className="editorial-display mt-4 max-w-4xl text-5xl md:text-7xl">{title}</h1>
        <p className="mt-7 max-w-3xl font-body text-lg leading-relaxed text-on-surface-variant">{lede}</p>
        <div className="mt-9 grid gap-5 rounded-2xl border border-gold/30 bg-surface-container-lowest p-6 md:grid-cols-[0.28fr_1fr] md:p-8">
          <p className="editorial-kicker">Direct answer</p>
          <p className="max-w-3xl font-body text-base leading-relaxed text-on-background">{directAnswer}</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/#audit" className="editorial-button-primary">Run a free audit</Link>
          <Link href="/methodology/ai-search-readiness-audit" className="editorial-button-secondary">See the methodology</Link>
        </div>
      </section>

      <section className="mt-20 grid gap-8 border-t border-gold/30 pt-10 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <p className="editorial-kicker">Why this matters</p>
          <h2 className="mt-3 font-headline text-4xl font-semibold tracking-tight text-on-background">Readiness before volume</h2>
        </div>
        <p className="font-body text-lg leading-relaxed text-on-surface-variant">{whyItMatters}</p>
      </section>

      <section className="mt-20">
        <p className="editorial-kicker">What to check</p>
        <h2 className="mt-3 font-headline text-4xl font-semibold tracking-tight text-on-background md:text-5xl">The controllable foundations</h2>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {foundations.map((item, index) => (
            <article key={item.title} className={`rounded-3xl border border-gold/20 p-7 shadow-float ${editorialCardColors[index % editorialCardColors.length]}`}>
              <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary">0{index + 1}</p>
              <h3 className="mt-5 font-headline text-2xl font-semibold tracking-tight text-on-background">{item.title}</h3>
              <p className="mt-3 font-body leading-relaxed text-on-surface-variant">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-20 rounded-[2rem] border border-gold/20 bg-[rgb(var(--blog-card-c))] p-7 md:p-11">
        <p className="editorial-kicker">A practical workflow</p>
        <h2 className="mt-3 font-headline text-4xl font-semibold tracking-tight text-on-background md:text-5xl">See the gap, then ship the fix</h2>
        <ol className="mt-9 grid gap-5 md:grid-cols-3">
          {workflow.map((item, index) => (
            <li key={item.title} className="rounded-2xl border border-gold/20 bg-surface-container-lowest p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/45 font-label text-sm font-bold text-primary">{index + 1}</span>
              <h3 className="mt-5 font-headline text-2xl font-semibold tracking-tight text-on-background">{item.title}</h3>
              <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20">
        <p className="editorial-kicker">Related guides</p>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {related.map((item, index) => (
            <Link key={item.href} href={item.href} className={`group rounded-3xl border border-gold/20 p-7 transition hover:-translate-y-1 hover:border-gold/50 hover:shadow-float ${editorialCardColors[index % editorialCardColors.length]}`}>
              <h2 className="font-headline text-2xl font-semibold tracking-tight text-on-background group-hover:text-primary">{item.label}</h2>
              <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
              <span className="mt-6 block font-body text-sm font-semibold text-primary">Read guide &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-20 max-w-4xl border-t border-gold/30 pt-10">
        <p className="editorial-kicker">Questions</p>
        <h2 className="mt-3 font-headline text-4xl font-semibold tracking-tight text-on-background md:text-5xl">Common questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-2xl border border-gold/20 bg-surface-container-lowest p-6">
              <h3 className="font-headline text-2xl font-semibold tracking-tight text-on-background">{faq.question}</h3>
              <p className="mt-3 font-body leading-relaxed text-on-surface-variant">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
