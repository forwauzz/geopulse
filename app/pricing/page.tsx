import { Suspense } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { PricingBundleCard, type PricingBundleCardProps } from '@/components/pricing-bundle-card';
import { SubscriptionStatusBanner } from '@/components/subscription-status-banner';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing | GEO-Pulse',
  description: 'Simple, transparent pricing for GEO-Pulse AI search readiness — start free, subscribe when you need the full platform.',
};

// ── Static feature lists per bundle ─────────────────────────────────────────
// Source of truth for what each tier provides in the UI.
// Mirrors the service_bundle_services seeded rows.

const BUNDLE_META: Record<
  string,
  { name: string; tagline: string; features: string[] }
> = {
  startup_lite: {
    name: 'Startup Lite',
    tagline: 'Run an AI search readiness scan in under a minute. No account required.',
    features: [
      'AI search readiness score',
      'Top issues to fix',
      'Priority recommendations',
      'Save preview by email',
    ],
  },
  startup_dev: {
    name: 'Startup Dev',
    tagline: 'Full audit platform for early-stage teams tracking AI search visibility.',
    features: [
      'Everything in Lite',
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

// ── Price formatting ─────────────────────────────────────────────────────────

function formatPriceLabel(cents: number | null, billingMode: string): string {
  if (billingMode === 'free') return 'Free';
  if (!cents) return 'Price TBD';
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const formatted = remainder === 0 ? `$${dollars}` : `$${dollars}.${String(remainder).padStart(2, '0')}`;
  return billingMode === 'monthly' ? `${formatted}/mo` : `${formatted}/yr`;
}

// ── Server data fetching ─────────────────────────────────────────────────────

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
      .in('bundle_key', ['startup_lite', 'startup_dev', 'agency_core', 'agency_pro']),
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

// ── Page ─────────────────────────────────────────────────────────────────────

const DISPLAY_ORDER = ['startup_lite', 'startup_dev', 'agency_core', 'agency_pro'];

export default async function PricingPage() {
  // Auth check (anon key — never service role)
  const userSupabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  const isAuthenticated = Boolean(user);
  const { bundles, activeSubs } = await loadPricingData(user?.id ?? null);
  const turnstileSiteKey = getTurnstileSiteKey();

  const activeSubKeys = new Set(activeSubs.map((s) => s.bundle_key));

  // Build card props for each bundle in display order
  const cards: PricingBundleCardProps[] = DISPLAY_ORDER.flatMap((key) => {
    const row = bundles.find((b) => b.bundle_key === key);
    const meta = BUNDLE_META[key];
    if (!meta) return [];

    const billingMode = row?.billing_mode ?? (key === 'startup_lite' ? 'free' : 'monthly');
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
      {/* Header */}
      <section className="mx-auto max-w-3xl text-center">
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          Pricing
        </p>
        <h1 className="mt-4 font-headline text-4xl font-bold text-on-background md:text-5xl">
          Start free. Subscribe when you need the full platform.
        </h1>
        <p className="mt-6 font-body text-lg leading-relaxed text-on-surface-variant">
          Run your first AI search readiness scan for free. Upgrade to a bundle when your
          team needs ongoing audits, dashboards, or client management.
        </p>
      </section>

      {/* Subscription status banner (success / cancel) */}
      <div className="mx-auto mt-10 max-w-3xl">
        <Suspense fallback={null}>
          <SubscriptionStatusBanner />
        </Suspense>
      </div>

      {/* Bundle cards */}
      <section className="mt-12 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Suspense key={card.bundleKey} fallback={null}>
            <PricingBundleCard {...card} />
          </Suspense>
        ))}
      </section>

      {/* Footer note */}
      <p className="mt-12 text-center font-body text-sm text-on-surface-variant">
        All paid plans include a free trial. Credit card required. Cancel anytime.
      </p>
    </main>
  );
}
