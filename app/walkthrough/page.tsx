import type { Metadata } from 'next';
import Link from 'next/link';
import { WalkthroughRequestForm } from '@/components/walkthrough-request-form';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { buildPublicPageMetadata } from '@/lib/server/public-site-seo';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

const title = 'Request a GEO-Pulse Walkthrough';
const description =
  'Request a focused review of your website’s AI-search readiness evidence and the most useful next step.';

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata({
    baseUrl: await loadBaseUrl(),
    title,
    description,
    canonicalPath: '/walkthrough',
  });
}

function sourceFor(raw: string | undefined) {
  if (raw === 'outreach') return 'outreach' as const;
  if (raw === 'agency') return 'agency_solution' as const;
  return 'walkthrough_page' as const;
}

export default async function WalkthroughPage({
  searchParams,
}: {
  searchParams: Promise<{ website?: string; company?: string; source?: string }>;
}) {
  const { website = '', company = '', source } = await searchParams;

  return (
    <main className="px-6 py-16 md:px-10 md:py-24">
      <section className="mx-auto grid max-w-6xl gap-10 rounded-[2rem] border border-gold/25 bg-[rgb(var(--blog-card-a))] p-7 shadow-float md:p-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="font-label text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Talk through the evidence
          </p>
          <h1 className="mt-4 text-balance font-headline text-4xl font-semibold leading-tight tracking-[-0.035em] text-on-background md:text-6xl">
            Get a focused walkthrough of the next useful move.
          </h1>
          <p className="mt-6 font-body text-lg leading-8 text-on-surface-variant">
            Send the site and the question you are trying to answer. We will review the public
            evidence and keep the conversation grounded in what GEO-Pulse can actually observe.
          </p>
          <div className="mt-8 rounded-2xl border border-gold/25 bg-surface-container-lowest p-6">
            <p className="font-sans text-sm font-semibold text-on-background">What happens next</p>
            <ol className="mt-4 space-y-4 font-body text-sm leading-6 text-on-surface-variant">
              <li><strong className="text-on-background">1.</strong> Elena reviews the public site and your stated goal.</li>
              <li><strong className="text-on-background">2.</strong> You receive a personal response with the most useful next step.</li>
              <li><strong className="text-on-background">3.</strong> If monitoring fits, the existing $39/month option remains available—without a bespoke price or unsupported promise.</li>
            </ol>
          </div>
          <Link href="/#audit" className="mt-6 inline-flex font-body text-sm font-semibold text-primary hover:underline">
            Prefer self-serve? Run the free audit →
          </Link>
        </div>
        <div className="rounded-3xl border border-gold/30 bg-surface-container-lowest p-7 shadow-float md:p-10">
          <WalkthroughRequestForm
            siteKey={getTurnstileSiteKey()}
            source={sourceFor(source)}
            defaultWebsite={website}
            defaultCompany={company}
          />
        </div>
      </section>
    </main>
  );
}
