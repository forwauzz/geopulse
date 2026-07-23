import type { Metadata } from 'next';
import { SearchFoundationPage } from '@/components/search-foundation-page';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildPublicPageMetadata, buildWebPageStructuredData, toAbsoluteUrl } from '@/lib/server/public-site-seo';

const title = 'Generative Engine Optimization (GEO): A Practical Guide | GEO-Pulse';
const description = 'Generative engine optimization is the work of making public content easier for AI answer systems to understand and reuse. Learn the practical foundations.';

async function loadBaseUrl() { const env = await getPaymentApiEnv(); return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/'; }
export async function generateMetadata(): Promise<Metadata> { return buildPublicPageMetadata({ baseUrl: await loadBaseUrl(), title, description, canonicalPath: '/generative-engine-optimization' }); }

export default async function GenerativeEngineOptimizationPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/generative-engine-optimization');
  const schema = buildWebPageStructuredData({ url: pageUrl, title, description, siteUrl: toAbsoluteUrl(baseUrl, '/') });
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} /><SearchFoundationPage
    eyebrow="Generative engine optimization"
    title="Generative engine optimization is clarity your site can prove."
    lede="Generative engine optimization, often shortened to GEO, is the practice of improving the public website signals that help AI answer systems access, understand, and reuse information accurately. It is not local-map GEO, and it is not a promise that an AI system will recommend a brand."
    directAnswer="GEO builds on technical SEO and useful content. The practical work is to make important pages crawlable, render meaningful content reliably, communicate entities and claims explicitly, organize answers clearly, and supply the trust context a buyer or system needs to verify what the page says."
    whyItMatters="Classic rankings still matter, but a search result and a synthesized answer are different experiences. A company cannot control the answer engine, but it can reduce ambiguity in the pages that explain its offer and make the underlying facts easier to retrieve and validate."
    foundations={[{ title: 'SEO fundamentals remain', body: 'Crawlability, relevance, performance, internal links, clear information architecture, and useful original content continue to matter.' }, { title: 'Answer-ready structure', body: 'Definitions, lists, steps, and short sections should still make sense when a reader encounters them apart from the rest of the page.' }, { title: 'Verifiable claims', body: 'State what the product does, who it is for, and the evidence behind important claims without forcing a system to infer the answer.' }, { title: 'Measurement with limits', body: 'Track observable readiness and, where available, prompt-level visibility. Do not mistake a score for a guaranteed business outcome.' }]}
    workflow={[{ title: 'Establish a baseline', body: 'Audit the pages that explain your offer and record the technical, structure, and trust gaps that actually exist.' }, { title: 'Improve the page system', body: 'Fix blockers, then strengthen the page’s topic clarity, supporting evidence, internal links, and structured context.' }, { title: 'Measure carefully', body: 'Use re-audits and search data to confirm improvement. Treat model output as changing evidence, not as a permanent rank.' }]}
    related={[{ href: '/ai-search-optimization', label: 'AI search optimization', body: 'Turn the GEO concept into a page-level program.' }, { href: '/ai-visibility-audit', label: 'Free audit', body: 'Find the readiness gaps on a real public URL.' }, { href: '/methodology/ai-search-readiness-audit', label: 'Methodology', body: 'Read how GEO-Pulse keeps audit claims bounded and useful.' }]}
    faqs={[{ question: 'Is GEO the same as local SEO?', answer: 'No. In this context GEO means generative engine optimization: improving how a site is represented in AI-generated answers. It is distinct from geographic or local-map optimization.' }, { question: 'Does GEO replace SEO?', answer: 'No. GEO builds on SEO fundamentals. If a site is inaccessible, unclear, or weak in conventional search, a new AI-search label does not solve the underlying problem.' }, { question: 'What is the first GEO task for a website?', answer: 'Audit the pages that explain the offer and capture demand. Resolve crawl blockers, then improve the clarity, structure, and evidence on those pages before expanding content volume.' }]}
  /></>;
}
