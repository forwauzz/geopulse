import type { Metadata } from 'next';
import { SearchFoundationPage } from '@/components/search-foundation-page';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';

const title = 'AI Search Audits for Agencies and SEO Consultants | GEO-Pulse';
const description =
  'Run practical AI search readiness audits for client websites. GEO-Pulse helps agencies identify crawl, structure, trust, and extractability gaps to prioritize.';

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

export default async function AgenciesSolutionPage() {
  const baseUrl = await loadBaseUrl();
  const pageUrl = toAbsoluteUrl(baseUrl, '/solutions/agencies');
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
        eyebrow="For agencies and SEO consultants"
        title="Give every client a practical AI search readiness baseline."
        lede="GEO-Pulse helps agencies and consultants turn a vague AI-search concern into a clear audit, a prioritized handoff, and a repeatable re-audit process for client websites."
        directAnswer="Start with the client pages that explain the offer or capture demand. GEO-Pulse reviews observable readiness signals around crawl access, page structure, machine-readable context, trust cues, and extractability so your team can separate a real blocker from a generic content recommendation."
        whyItMatters="Clients do not need another vague AI visibility score. They need a credible explanation of what is observable on their site, which finding matters first, and who can fix it. A readiness audit adds an AI-search lens to the technical and editorial work an agency already knows how to deliver."
        foundations={[
          {
            title: 'Start with a client-defining page',
            body: 'Audit the homepage, service, product, pricing, category, or documentation page that most affects how a buyer understands the client.',
          },
          {
            title: 'Separate blockers from improvements',
            body: 'Treat access, directives, or broken rendering as urgent technical work. Route structure, evidence, and internal-link improvements to the appropriate content or SEO owner.',
          },
          {
            title: 'Use a repeatable client handoff',
            body: 'Frame each recommendation around the observed signal, the practical change, and the page it affects instead of presenting an unexplained composite score.',
          },
          {
            title: 'Re-audit after the work ships',
            body: 'Use a follow-up audit to check whether the observable readiness issue changed. It is a verification step, not a promise about a specific answer engine.',
          },
        ]}
        workflow={[
          {
            title: 'Run a focused baseline',
            body: 'Choose the client URL with the clearest commercial importance and establish its readiness gaps before proposing a broad content project.',
          },
          {
            title: 'Turn evidence into scope',
            body: 'Group findings into technical access, page structure, trust, and content work so the client can see the rationale and owners.',
          },
          {
            title: 'Show the improvement',
            body: 'Re-audit the changed URL and use search and conversion data over time to evaluate whether the program is earning demand.',
          },
        ]}
        related={[
          {
            href: '/ai-visibility-audit',
            label: 'AI visibility audit',
            body: 'See what the free audit checks on a public client URL.',
          },
          {
            href: '/ai-search-optimization',
            label: 'AI search optimization',
            body: 'Use the core implementation framework behind the agency handoff.',
          },
          {
            href: '/methodology/ai-search-readiness-audit',
            label: 'Methodology',
            body: 'Review the observable signals and the limits of the audit.',
          },
        ]}
        faqs={[
          {
            question: 'Can an agency run audits for client sites?',
            answer:
              'Yes. Start with a public client URL to establish a readiness baseline, then use the audit findings to prioritize an implementation plan with the relevant client and delivery owners.',
          },
          {
            question: 'Does an AI search audit replace a technical SEO audit?',
            answer:
              'No. It complements technical SEO by focusing the review on whether public pages are accessible, understandable, and extractable for AI search. The underlying technical SEO fundamentals still matter.',
          },
          {
            question: 'What should an agency promise a client?',
            answer:
              'Promise a transparent assessment of observable site signals and a practical next move. Do not promise citations, rankings, traffic, or recommendations from a particular AI system.',
          },
        ]}
      />
    </>
  );
}
