import type { Metadata } from 'next';
import { SearchFoundationPage } from '@/components/search-foundation-page';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildPublicPageMetadata, buildWebPageStructuredData, toAbsoluteUrl } from '@/lib/server/public-site-seo';

const title = 'Free AI Visibility Audit for Your Website | GEO-Pulse';
const description = 'Run a free AI visibility audit to identify crawl, structure, trust, and extractability gaps on the public pages that explain your business.';

async function loadBaseUrl() { const env = await getPaymentApiEnv(); return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/'; }
export async function generateMetadata(): Promise<Metadata> { return buildPublicPageMetadata({ baseUrl: await loadBaseUrl(), title, description, canonicalPath: '/ai-visibility-audit' }); }

export default async function AiVisibilityAuditPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/ai-visibility-audit');
  const schema = buildWebPageStructuredData({ url: pageUrl, title, description, siteUrl: toAbsoluteUrl(baseUrl, '/') });
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} /><SearchFoundationPage
    eyebrow="Free AI visibility audit"
    title="Find the gaps that make your website harder for AI search to use."
    lede="An AI visibility audit is a practical review of the public signals that help a crawler or answer system access, understand, and accurately reuse a website. It should give a team a concrete next move—not a mysterious score."
    directAnswer="GEO-Pulse starts with a free audit of a public URL. It checks readiness signals around crawl access, page structure, machine-readable context, trust cues, and extractability, then surfaces the highest-priority issues for a team to verify and fix."
    whyItMatters="Teams often respond to AI-search uncertainty by publishing more content or buying a new visibility dashboard. An audit should first show whether the pages they already own are technically available, explicit enough to interpret, and organized around useful buyer answers."
    foundations={[{ title: 'Access and indexability', body: 'The audit checks whether obvious technical directives or response behavior can prevent useful public content from being reached.' }, { title: 'Page-level clarity', body: 'A useful audit identifies pages that lack a direct topic, answer-first structure, or readable heading hierarchy.' }, { title: 'Machine-readable context', body: 'Structured data, canonical URLs, entity context, and internal links help reduce ambiguity when a system processes the page.' }, { title: 'Actionable handoff', body: 'Findings should distinguish a technical blocker from a content, trust, or structure improvement so the right owner can act.' }]}
    workflow={[{ title: 'Choose a high-intent URL', body: 'Begin with a homepage, product page, pricing page, service page, or documentation page that shapes a buyer’s decision.' }, { title: 'Read the evidence', body: 'Review the issue, the page signal behind it, and the recommended first move. Do not treat every issue as equally urgent.' }, { title: 'Ship and compare', body: 'Apply the fix, then re-run the audit to see whether the observable readiness signal improved.' }]}
    related={[{ href: '/ai-search-optimization', label: 'AI search optimization', body: 'Learn the broader program an audit supports.' }, { href: '/generative-engine-optimization', label: 'GEO explained', body: 'See how a visibility audit fits within generative engine optimization.' }, { href: '/methodology/ai-search-readiness-audit', label: 'Methodology', body: 'Understand what a readiness audit can and cannot establish.' }]}
    faqs={[{ question: 'What does an AI visibility audit measure?', answer: 'It measures observable readiness signals that affect whether public pages can be crawled, interpreted, segmented, and reused accurately. It does not promise a specific citation, rank, or amount of traffic.' }, { question: 'Do I need an account to run the free audit?', answer: 'No. Start with a public URL and use the result to decide whether deeper analysis, a saved report, or team workflow is useful.' }, { question: 'What should I fix first after an audit?', answer: 'Fix blocking directives and access failures first. Then focus on the pages that explain the offer or capture high-intent demand, improving their answer structure, evidence, and trust context.' }]}
  /></>;
}
