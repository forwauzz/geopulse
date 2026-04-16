import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PricingBundleCard, type PricingBundleCardProps } from '@/components/pricing-bundle-card';
import { SubscriptionStatusBanner } from '@/components/subscription-status-banner';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  buildPublicPageMetadata,
  buildWebPageStructuredData,
  SITE_AUTHOR_NAME,
  SITE_AUTHOR_URL_PATH,
  SITE_DESCRIPTION,
  toAbsoluteUrl,
} from '@/lib/server/public-site-seo';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

const pricingFaqItems = [
  {
    question: 'What is included in the free audit?',
    answer:
      'The free audit gives you a first-pass score, the highest-priority blockers, and a practical first move for crawl access, trust, metadata, and extractability.',
  },
  {
    question: 'When should I upgrade to a paid bundle?',
    answer:
      'Upgrade when you need ongoing audit history, dashboard access, workspace workflows, or a shareable deep audit artifact for a team or client.',
  },
  {
    question: 'Which pages should I audit first?',
    answer:
      'Start with the homepage, pricing page, product pages, docs, and any public page that explains your offer or captures high-intent demand.',
  },
] as const;

const BUNDLE_META: Record<
  string,
  { name: string; tagline: string; features: string[] }
> = {
  startup_dev: {
    name: 'Startup Dev',
    tagline: 'Full audit platform for early-stage teams tracking AI search visibility.',
    features: [
      'Same scan signals as the homepage audit, plus the full platform',
      'Unlimited deep audit reports',
      'Startup workspace dashboard',
      'Audit history & comparison',
      'GitHub integration',
      'Slack delivery',
    ],
  },
  agency_core: {
    name: 'Agency Core',
    tagline: 'Multi-client audit management for agencies managing AI search at scale.',
    features: [
      'Everything in Startup Dev',
      'Agency account dashboard',
      'Multi-client management',
      'Client audit history',
      'Bundle entitlement controls',
      'Team member access',
    ],
  },
  agency_pro: {
    name: 'Agency Pro',
    tagline: 'Full agency platform with advanced benchmarking and white-label reporting.',
    features: [
      'Everything in Agency Core',
      'Advanced benchmark tracking',
      'Competitor cohort analysis',
      'Priority support',
      'Custom model policy controls',
    ],
  },
};

function formatPriceLabel(cents: number | null, billingMode: string): string {
  if (billingMode === 'free') return 'Free';
  if (!cents) return 'Price TBD';
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const formatted = remainder === 0 ? `$${dollars}` : `$${dollars}.${String(remainder).padStart(2, '0')}`;
  return billingMode === 'monthly' ? `${formatted}/mo` : `${formatted}/yr`;
}

type BundleRow = {
  bundle_key: string;
  billing_mode: string;
  stripe_price_id: string | null;
  monthly_price_cents: number | null;
  trial_period_days: number;
};

type SubRow = {
  bundle_key: string;
  status: string;
};

async function loadBaseUrl(): Promise<string> {
  const env = await getPaymentApiEnv();
  return env.NEXT_PUBLIC_APP_URL || 'https://getgeopulse.com/';
}

async function loadPricingData(userId: string | null): Promise<{
  bundles: BundleRow[];
  activeSubs: SubRow[];
}> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!supabaseUrl || !serviceKey) {
    return { bundles: [], activeSubs: [] };
  }

  const adminDb = createServiceRoleClient(supabaseUrl, serviceKey);

  const [bundleRes, subRes] = await Promise.all([
    adminDb
      .from('service_bundles')
      .select('bundle_key, billing_mode, stripe_price_id, monthly_price_cents, trial_period_days')
      .in('bundle_key', ['startup_dev', 'agency_core', 'agency_pro']),
    userId
      ? adminDb
          .from('user_subscriptions')
          .select('bundle_key, status')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing'])
      : Promise.resolve({ data: [] as SubRow[], error: null }),
  ]);

  return {
    bundles: (bundleRes.data ?? []) as BundleRow[],
    activeSubs: (subRes.data ?? []) as SubRow[],
  };
}

const DISPLAY_ORDER = ['startup_dev', 'agency_core', 'agency_pro'];

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await loadBaseUrl();
  return buildPublicPageMetadata({
    baseUrl,
    title: 'Pricing | GEO-Pulse',
    description:
      'Simple, transparent pricing for GEO-Pulse AI search readiness. Start free and subscribe when your team needs the full platform.',
    canonicalPath: '/pricing',
    openGraphType: 'website',
  });
}

export default async function PricingPage() {
  const userSupabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  const isAuthenticated = Boolean(user);
  const { bundles, activeSubs } = await loadPricingData(user?.id ?? null);
  const turnstileSiteKey = getTurnstileSiteKey();
  const baseUrl = await loadBaseUrl();
  const pageModifiedAt = new Date().toISOString();
  const pageSchema = buildWebPageStructuredData({
    url: toAbsoluteUrl(baseUrl, '/pricing'),
    title: 'Pricing | GEO-Pulse',
    description:
      'Simple, transparent pricing for GEO-Pulse AI search readiness. Start free and subscribe when your team needs the full platform.',
    siteUrl: toAbsoluteUrl(baseUrl, '/'),
    dateModified: pageModifiedAt,
    authorName: SITE_AUTHOR_NAME,
    authorUrl: toAbsoluteUrl(baseUrl, SITE_AUTHOR_URL_PATH),
  });
  const activeSubKeys = new Set(activeSubs.map((s) => s.bundle_key));

  const cards: PricingBundleCardProps[] = DISPLAY_ORDER.flatMap((key) => {
    const row = bundles.find((b) => b.bundle_key === key);
    const meta = BUNDLE_META[key];
    if (!meta) return [];

    const billingMode = row?.billing_mode ?? 'monthly';
    const priceLabel = formatPriceLabel(row?.monthly_price_cents ?? null, billingMode);
    const trialDays = row?.trial_period_days ?? 0;

    return [
      {
        bundleKey: key,
        name: meta.name,
        tagline: meta.tagline,
        priceLabel,
        trialDays,
        features: meta.features,
        isAuthenticated,
        isCurrentPlan: activeSubKeys.has(key),
        isFree: billingMode === 'free',
        turnstileSiteKey,
      } satisfies PricingBundleCardProps,
    ];
  });

  return (
    <main className="mx-auto max-w-screen-2xl px-6 py-16 md:px-10 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />

      <section className="mx-auto max-w-3xl text-center">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          Pricing
        </p>
        <h1 className="mt-4 font-headline text-4xl font-bold text-on-background md:text-5xl">
          Start free. Subscribe when you need the full platform.
        </h1>
        <p className="mt-6 font-body text-lg leading-relaxed text-on-surface-variant">
          Run your first AI search readiness scan for free. Upgrade to a bundle when your team
          needs ongoing audits, dashboards, or client management.
        </p>
        <p className="mt-3 font-body text-sm text-on-surface-variant">
          Reviewed by{' '}
          <Link href="/about" className="font-semibold text-primary hover:underline">
            {SITE_AUTHOR_NAME}
          </Link>
          .
        </p>
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          Need a trust anchor first? Visit the{' '}
          <Link href="/about" className="font-semibold text-primary hover:underline">
            About page
          </Link>
          . Read the{' '}
          <Link href="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>{' '}
          before checkout if you want the data handling details.
        </p>
      </section>

      <div className="mx-auto mt-10 max-w-3xl">
        <Suspense fallback={null}>
          <SubscriptionStatusBanner />
        </Suspense>
      </div>

      <section className="mt-12 grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Suspense key={card.bundleKey} fallback={null}>
            <PricingBundleCard {...card} />
          </Suspense>
        ))}
      </section>

      <p className="mt-12 text-center font-body text-sm text-on-surface-variant">
        All paid plans include a free trial. Credit card required. Cancel anytime.
      </p>

      <section className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="font-label text-xs uppercase tracking-widest text-primary">Pricing questions</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-on-background md:text-3xl">
            Direct answers before checkout
          </h2>
          <p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
            This page should answer what the free audit includes, when the paid bundle matters, and
            which pages are worth auditing first.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-8">
          {pricingFaqItems.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float"
            >
              <h3 className="font-headline text-lg font-bold text-on-background">{item.question}</h3>
              <p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl bg-surface-container-low p-6 shadow-float">
        <p className="font-label text-xs uppercase tracking-widest text-primary">References</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          <li>
            <a
              href="https://stripe.com/docs/payments/checkout"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
            >
              Stripe Checkout docs
            </a>
          </li>
          <li>
            <a
              href="https://developers.cloudflare.com/turnstile/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
            >
              Cloudflare Turnstile docs
            </a>
          </li>
          <li>
            <a
              href="https://developers.google.com/search/docs/crawling-indexing/robots/intro"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-high"
            >
              Crawlability guidance
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
