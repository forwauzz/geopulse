import type { Metadata } from 'next';
import { SearchFoundationPage } from '@/components/search-foundation-page';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

const title = 'AI SEO Audit: Check Your Website for AI Search Readiness | GEO-Pulse';
const description =
  'Run a practical AI SEO audit to find crawl, structure, trust, and extractability gaps that make public pages harder for AI search systems to understand.';

async function loadBaseUrl() {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({
    baseUrl: await loadBaseUrl(),
    title,
    description,
    canonicalPath: '/ai-seo-audit',
  });
}

export default async function AiSeoAuditPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/ai-seo-audit');
  const schema = buildWebPageStructuredData({
    url: pageUrl,
    title,
    description,
    siteUrl: toAbsoluteUrl(baseUrl, '/'),
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <SearchFoundationPage
        eyebrow="AI SEO audit"
        title="An AI SEO audit starts with what a public page actually exposes."
        lede="An AI SEO audit reviews the technical and editorial signals that affect whether AI search systems can reach, understand, and accurately reuse a public webpage. It is a useful extension of SEO auditing, not a new name for ranking predictions."
        directAnswer="GEO-Pulse audits observable AI-search readiness signals: crawl access, page structure, machine-readable context, trust cues, internal linking, and extractability. Start with a public URL, then use the results to fix the page-level issues your team can control."
        whyItMatters="A conventional SEO audit can uncover valuable problems, but a page can still be difficult for an answer system to interpret when the main answer is buried, claims are ambiguous, or essential context is unavailable in the rendered page. The goal is not to chase a mystery score; it is to make important pages easier to verify and use."
        foundations={[
          {
            title: 'Crawlability first',
            body: 'Confirm that important public content is reachable and not accidentally limited by directives, response behavior, or fragile rendering.',
          },
          {
            title: 'A page with a clear job',
            body: 'Give each commercial or educational page a direct topic, a clear H1, useful headings, and a self-contained answer to the buyer question it targets.',
          },
          {
            title: 'Facts a system can verify',
            body: 'Make product facts, business identity, authorship, evidence, canonical URLs, and relevant structured data explicit rather than implied.',
          },
          {
            title: 'A practical priority order',
            body: 'Fix access and indexability blockers before polishing language; then improve structure, evidence, and internal links on the pages that capture demand.',
          },
        ]}
        workflow={[
          {
            title: 'Audit a high-intent page',
            body: 'Begin with the homepage, product, service, pricing, category, or documentation page that matters most to a prospect.',
          },
          {
            title: 'Interpret the finding',
            body: 'Use the signal and recommended next move to decide whether engineering, SEO, content, or the product owner should make the change.',
          },
          {
            title: 'Verify after shipping',
            body: 'Re-audit the URL to confirm the observable readiness condition changed, then measure indexation, impressions, and conversions over time.',
          },
        ]}
        related={[
          {
            href: '/ai-visibility-audit',
            label: 'AI visibility audit',
            body: 'See how a free AI visibility audit is scoped and what it measures.',
          },
          {
            href: '/ai-search-optimization',
            label: 'AI search optimization',
            body: 'Turn the audit findings into a wider page and site improvement program.',
          },
          {
            href: '/generative-engine-optimization',
            label: 'GEO guide',
            body: 'Understand where AI SEO auditing fits within generative engine optimization.',
          },
        ]}
        faqs={[
          {
            question: 'What is an AI SEO audit?',
            answer:
              'It is an audit of the controllable public-site signals that affect how AI search can access and interpret a page, including crawl access, structure, extractability, machine-readable context, and trust signals.',
          },
          {
            question: 'Is AI SEO different from regular SEO?',
            answer:
              'It builds on regular SEO rather than replacing it. Crawlability, relevance, quality, and useful original content remain fundamental; AI search raises the importance of direct answers, explicit context, and verifiable claims.',
          },
          {
            question: 'Will an AI SEO audit guarantee a ChatGPT or Google AI citation?',
            answer:
              'No. An audit can show and improve observable readiness conditions, but citation and ranking decisions also depend on each system, the query, index state, and other sources.',
          },
        ]}
      />
    </>
  );
}
