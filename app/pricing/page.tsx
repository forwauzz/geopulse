import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { loadUiFlags } from '@/lib/server/app-ui-flags';
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
      'The free audit gives you a readiness score, your highest-priority visibility blockers, and a practical first move. No account or credit card is required.',
  },
  {
    question: 'When should a business upgrade?',
    answer:
      'Upgrade when you want GEO-Pulse to keep tracking your AI visibility, competitors, website improvements, and progress instead of relying on a one-time snapshot.',
  },
  {
    question: 'Which agency plan should I choose?',
    answer:
      'Choose Agency when you need recurring client measurement and reporting. Choose Agency Scale when weekly monitoring, unlimited prompts, and a client-facing portal are central to your service.',
  },
] as const;

const BUNDLE_META: Record<
  string,
  { name: string; tagline: string; features: string[] }
> = {
  startup_dev: {
    name: 'Business',
    tagline: 'For one business ready to improve and monitor its visibility.',
    features: [
      'Automatic AI visibility baseline',
      'Monthly tracking for up to 10 buyer prompts',
      'Website readiness audits and priority fixes',
      'Competitor and citation monitoring',
      'Full history and progress dashboard',
      'Reports delivered by email',
    ],
  },
  agency_core: {
    name: 'Agency',
    tagline: 'For agencies proving search visibility progress across clients.',
    features: [
      'Everything in Business',
      'Multi-client agency portfolio',
      'Monthly or biweekly monitoring',
      'Up to 15 buyer prompts per client run',
      'Shareable scorecards and recurring reports',
      'Email and Slack delivery',
    ],
  },
  agency_pro: {
    name: 'Agency Scale',
    tagline: 'For agencies making GEO a recurring, client-facing service.',
    features: [
      'Everything in Agency',
      'Weekly client monitoring',
      'Unlimited prompts per client run',
      'Advanced competitor benchmarking',
      'White-label reporting',
      'Email, Slack, and portal delivery',
    ],
  },
};

function formatPriceLabel(cents: number | null, billingMode: string): string {
  if (billingMode === 'free') return 'Free';
  if (!cents) return 'Price TBD';
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const formatted = remainder === 0 ? `$${dollars}` : `$${dollars}.${String(remainder).padStart(2, '0')}`;
  return billingMode === 'monthly' ? `${formatted} CAD/mo` : `${formatted} CAD/yr`;
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
  // Hidden by the super-admin App Settings flag → send visitors to sign-in instead of a dead page.
  if (!(await loadUiFlags()).show_pricing) redirect('/login');
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
  const paidTrialDays = Array.from(
    new Set(
      bundles
        .filter((bundle) => bundle.billing_mode !== 'free' && bundle.trial_period_days > 0)
        .map((bundle) => bundle.trial_period_days),
    ),
  );

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
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />

      <section className="mx-auto max-w-4xl text-center">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          Pricing
        </p>
        <h1 className="mt-4 text-balance font-headline text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-on-background md:text-6xl">
          Start free. Pay when you want GEO-Pulse working continuously.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl font-body text-lg leading-relaxed text-on-surface-variant">
          The free audit shows your starting point. Paid plans keep measuring AI visibility,
          competitors, citations, and progress—whether you manage one business or many clients.
        </p>
      </section>

      <section className="mx-auto mt-9 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low p-5">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-primary">One business</p>
          <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">Choose Business for your own website, competitors, and monthly progress.</p>
        </div>
        <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low p-5">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-primary">Client portfolio</p>
          <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">Choose an Agency plan to manage, measure, and report across clients.</p>
        </div>
      </section>

      <div className="mx-auto mt-10 max-w-3xl">
        <Suspense fallback={null}>
          <SubscriptionStatusBanner />
        </Suspense>
      </div>

      <section id="plans" className="mt-10 grid scroll-mt-24 gap-6 md:grid-cols-3">
        {cards.map((card) => (
          <Suspense key={card.bundleKey} fallback={null}>
            <PricingBundleCard {...card} />
          </Suspense>
        ))}
      </section>

      <p className="mt-8 text-center font-body text-sm text-on-surface-variant">
        {paidTrialDays.length === 1
          ? `Every paid plan includes a ${paidTrialDays[0]}-day trial. `
          : 'Trial length is shown on each plan. '}
        Credit card required. Cancel before the trial ends and you will not be charged.
      </p>

      <section className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="font-label text-xs uppercase tracking-widest text-primary">Pricing questions</p>
          <h2 className="mt-3 font-sans text-2xl font-black uppercase tracking-tight text-on-background md:text-3xl">
            Direct answers before checkout
          </h2>
          <p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">Choose based on who you manage and how often you need proof of progress.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-8">
          {pricingFaqItems.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-float"
            >
              <h3 className="font-sans text-lg font-black uppercase tracking-tight text-on-background">{item.question}</h3>
              <p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
