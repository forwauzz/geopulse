import type { Metadata } from 'next';
import { SearchFoundationPage } from '@/components/search-foundation-page';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildPublicPageMetadata, buildWebPageStructuredData, toAbsoluteUrl } from '@/lib/server/public-site-seo';

const title = 'AI Search Optimization: Audit and Fix Website Readiness | GEO-Pulse';
const description = 'Learn how to make a public website easier for AI search to crawl, understand, and reuse. Run a free AI search readiness audit with GEO-Pulse.';

async function loadBaseUrl() {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({ baseUrl: await loadBaseUrl(), title, description, canonicalPath: '/ai-search-optimization' });
}

export default async function AiSearchOptimizationPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/ai-search-optimization');
  const schema = buildWebPageStructuredData({ url: pageUrl, title, description, siteUrl: toAbsoluteUrl(baseUrl, '/') });
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} /><SearchFoundationPage
    eyebrow="AI search optimization"
    title="AI search optimization starts with a site systems can understand."
    lede="AI search optimization is the work of making the public pages that explain your offer easier to crawl, segment, understand, and reuse accurately in answer-driven search experiences."
    directAnswer="Start with what you control: ensure important pages are available to crawlers, render meaningful content without fragile client-side dependencies, state the page topic and entities clearly, and structure answers so they stand on their own. GEO-Pulse audits those readiness signals and turns the gaps into a practical fix list."
    whyItMatters="More content does not solve a site that is unclear, blocked, or difficult to extract from. A strong AI-search program preserves traditional SEO fundamentals while improving the structure, explicitness, and trust signals that help systems interpret a page without guessing."
    foundations={[{ title: 'Crawl access', body: 'Important public pages must be fetchable. Check robots rules, noindex directives, WAF behavior, status codes, and sitemap coverage before investing in more copy.' }, { title: 'Rendered meaning', body: 'The primary answer, product facts, and navigation should exist in the delivered page experience—not only behind a client-side interaction or a script failure.' }, { title: 'Clear structure', body: 'Use a direct H1, descriptive headings, short sections, and pages that answer one buyer question at a time.' }, { title: 'Explicit entities and trust', body: 'Make authorship, business identity, product claims, sources, canonical URLs, and structured data easy to verify.' }]}
    workflow={[{ title: 'Scan the page', body: 'Start with the homepage, product, pricing, and high-intent pages that shape a buyer’s understanding of your offer.' }, { title: 'Prioritize blockers', body: 'Resolve access and rendering failures first, then improve weak structure, unclear claims, and missing trust context.' }, { title: 'Re-audit after shipping', body: 'Use the next run to verify the page changed in the expected direction. Readiness is a practical baseline, not a citation guarantee.' }]}
    related={[{ href: '/ai-visibility-audit', label: 'AI visibility audit', body: 'See what an audit should check before you make a content plan.' }, { href: '/generative-engine-optimization', label: 'Generative engine optimization', body: 'Understand the GEO category and how it relates to SEO.' }, { href: '/methodology/ai-search-readiness-audit', label: 'Methodology', body: 'Read the observable signals behind a readiness audit.' }]}
    faqs={[{ question: 'Is AI search optimization different from SEO?', answer: 'It is complementary, not a replacement. The same crawlability, relevance, technical quality, and useful content still matter. AI search adds pressure to make claims, entities, and answer structure easy to interpret and reuse.' }, { question: 'Can AI search optimization guarantee citations?', answer: 'No. A site can improve its readiness without controlling every system’s retrieval, ranking, or citation decisions. GEO-Pulse focuses on the observable page signals a team can improve.' }, { question: 'Which pages should I optimize first?', answer: 'Start with pages that define the offer or capture high-intent demand: the homepage, product and service pages, pricing, comparison pages, documentation, and key local or category pages.' }]}
  /></>;
}
