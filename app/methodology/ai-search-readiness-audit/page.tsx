import type { Metadata } from 'next';
import Link from 'next/link';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildPublicPageMetadata, buildWebPageStructuredData, toAbsoluteUrl } from '@/lib/server/public-site-seo';

const title = 'AI Search Readiness Audit Methodology | GEO-Pulse';
const description = 'How GEO-Pulse evaluates observable AI search readiness signals, what the audit can establish, and what it cannot promise.';

async function loadBaseUrl() { const env = await getPaymentApiEnv(); return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/'; }
export async function generateMetadata(): Promise<Metadata> { return buildPublicPageMetadata({ baseUrl: await loadBaseUrl(), title, description, canonicalPath: '/methodology/ai-search-readiness-audit' }); }

const checks = [
  ['Crawl and access', 'Whether an important public page can be fetched and whether visible directives, robots rules, or response behavior create an obvious blocker.'],
  ['Rendering and page structure', 'Whether meaningful content is available in the page response and organized with a direct topic, clear headings, and extractable sections.'],
  ['Machine-readable context', 'Whether canonical information, structured context, internal links, and explicit entity details reduce ambiguity about the page and business.'],
  ['Trust and content clarity', 'Whether the page gives readers and systems enough context to understand important claims, ownership, and supporting evidence.'],
] as const;

export default async function MethodologyPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/methodology/ai-search-readiness-audit');
  const schema = buildWebPageStructuredData({ url: pageUrl, title, description, siteUrl: toAbsoluteUrl(baseUrl, '/') });
  return <main className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-24">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    <header className="max-w-4xl">
      <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Methodology</p>
      <h1 className="mt-4 font-sans text-5xl font-black uppercase leading-[0.9] tracking-tighter text-on-background md:text-7xl">What an AI search readiness audit measures.</h1>
      <p className="mt-7 font-body text-lg leading-relaxed text-on-surface-variant">GEO-Pulse evaluates observable page and site signals that affect whether important public content is available, understandable, and easier to reuse accurately. The audit is designed to produce a practical prioritization—not an opaque prediction about a specific model.</p>
    </header>
    <section className="mt-14 rounded-3xl border border-primary/25 bg-primary/5 p-7 md:p-10">
      <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">What the audit can establish</p>
      <p className="mt-4 font-body text-lg leading-relaxed text-on-background">It can identify concrete readiness issues in crawl access, rendering, page structure, machine-readable context, and trust cues. Those are controllable inputs to how public pages are processed and understood.</p>
      <p className="mt-4 font-body leading-relaxed text-on-surface-variant">It cannot guarantee a citation, ranking, traffic level, recommendation, or revenue result. Those outcomes also depend on search indexes, external authority, query context, and each answer system’s changing retrieval and ranking choices.</p>
    </section>
    <section className="mt-16">
      <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">The review areas</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {checks.map(([heading, body], index) => <article key={heading} className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-6 shadow-float"><p className="font-label text-xs font-semibold text-primary">0{index + 1}</p><h2 className="mt-3 font-sans text-2xl font-black uppercase tracking-tight text-on-background">{heading}</h2><p className="mt-3 font-body leading-relaxed text-on-surface-variant">{body}</p></article>)}
      </div>
    </section>
    <section className="mt-16 rounded-3xl bg-surface-container-low p-7 md:p-10">
      <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">How to use the result</p>
      <ol className="mt-5 space-y-4 font-body leading-relaxed text-on-surface-variant"><li><strong className="text-on-background">1. Start with pages that shape demand.</strong> Audit the homepage, product, pricing, service, category, and documentation pages that explain the offer.</li><li><strong className="text-on-background">2. Fix access failures before editorial polish.</strong> A blocked or fragile page does not become useful through another round of copywriting.</li><li><strong className="text-on-background">3. Give each finding an owner.</strong> Route technical gaps to engineering, structure and evidence gaps to content/SEO, and product-claim ambiguity to the business owner.</li><li><strong className="text-on-background">4. Re-audit after changes ship.</strong> Use the next result to verify the observable readiness signal changed, then review search and conversion data over time.</li></ol>
    </section>
    <section className="mt-16"><p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">Related pages</p><div className="mt-5 flex flex-wrap gap-4"><Link href="/ai-search-optimization" className="rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-5 py-3 text-sm font-semibold text-on-background hover:bg-surface-container-low">AI search optimization</Link><Link href="/ai-visibility-audit" className="rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-5 py-3 text-sm font-semibold text-on-background hover:bg-surface-container-low">AI visibility audit</Link><Link href="/#audit" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:opacity-90">Run a free audit</Link></div></section>
  </main>;
}
