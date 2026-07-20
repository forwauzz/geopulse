import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import {
  buildBundleReadinessSummary,
  type BundleReadinessBillingMappingRow,
  type BundleReadinessBundleRow,
  type BundleReadinessBundleServiceRow,
  type BundleReadinessEntitlementOverrideRow,
  type BundleReadinessServiceRow,
} from '@/lib/server/bundle-readiness';
import { updateBundleBilling, upsertBundleServices } from './actions';

export const dynamic = 'force-dynamic';

type BundleRow = {
  id: string;
  bundle_key: string;
  name: string;
  workspace_type: string;
  status: string;
  billing_mode: string | null;
  stripe_price_id: string | null;
  monthly_price_cents: number | null;
  trial_period_days: number | null;
};

type ServiceRow = {
  id: string;
  service_key: string;
  name: string;
  category: string | null;
  is_active: boolean;
};

type BundleServiceRow = {
  service_id: string;
  enabled: boolean;
  access_mode: string | null;
  usage_limit: number | null;
};

type BillingMappingRow = {
  service_id: string;
  is_active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  billing_mode: string;
};

type EntitlementOverrideRow = {
  service_id: string;
  scope_type: 'global' | 'bundle_default';
  enabled: boolean;
  access_mode: string | null;
};

export default async function AdminBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ bundleKey: string }>;
  searchParams?: Promise<{ saved?: string; included?: string; excluded?: string }>;
}) {
  const { bundleKey } = await params;
  const sp = (await searchParams) ?? {};
  const ctx = await loadAdminPageContext('/admin/services');
  if (!ctx.ok) {
    return <p className="text-sm text-error">{ctx.message}</p>;
  }

  // Load bundle and service catalog in parallel; bundle services need the bundle UUID so load after
  const [bundleResult, servicesResult] = await Promise.all([
    ctx.adminDb
      .from('service_bundles')
      .select('id, bundle_key, name, workspace_type, status, billing_mode, stripe_price_id, monthly_price_cents, trial_period_days')
      .eq('bundle_key', bundleKey)
      .maybeSingle<BundleRow>(),
    ctx.adminDb
      .from('service_catalog')
      .select('id, service_key, name, category, is_active')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .returns<ServiceRow[]>(),
  ]);

  const bundle = bundleResult.data;
  if (!bundle) {
    return (
      <div>
        <Link href="/admin/services" className="text-sm text-primary hover:underline">
          ← Back to services
        </Link>
        <p className="mt-4 text-sm text-error">Bundle not found: {bundleKey}</p>
      </div>
    );
  }

  // Now fetch bundle services and readiness inputs with the real bundle UUID
  const [bundleServicesResult, billingMappingsResult, overridesResult] = await Promise.all([
    ctx.adminDb
      .from('service_bundle_services')
      .select('service_id, enabled, access_mode, usage_limit')
      .eq('bundle_id', bundle.id)
      .returns<BundleServiceRow[]>(),
    ctx.adminDb
      .from('service_billing_mappings')
      .select('service_id, is_active, stripe_product_id, stripe_price_id, billing_mode')
      .eq('bundle_id', bundle.id)
      .eq('provider', 'stripe')
      .returns<BillingMappingRow[]>(),
    ctx.adminDb
      .from('service_entitlement_overrides')
      .select('service_id, scope_type, enabled, access_mode')
      .eq('bundle_id', bundle.id)
      .in('scope_type', ['bundle_default', 'global'])
      .returns<EntitlementOverrideRow[]>(),
  ]);

  const services = servicesResult.data ?? [];
  const bundleServices = bundleServicesResult.data ?? [];
  const billingMappings = billingMappingsResult.data ?? [];
  const overrides = overridesResult.data ?? [];
  const bsMap = new Map(bundleServices.map((r) => [r.service_id, r]));
  const readiness = buildBundleReadinessSummary({
    bundle: bundle as BundleReadinessBundleRow,
    services: services as BundleReadinessServiceRow[],
    bundleServices: bundleServices as BundleReadinessBundleServiceRow[],
    billingMappings: billingMappings as BundleReadinessBillingMappingRow[],
    overrides: overrides as BundleReadinessEntitlementOverrideRow[],
  });

  const BILLING_MODES = ['free', 'monthly', 'annual'];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/services" className="text-sm text-primary hover:underline">
          ← Back to services
        </Link>
      </div>

      <div>
        <h1 className="font-headline text-3xl font-bold text-on-background">
          {bundle.name}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Included services:{' '}
          <span className="font-medium text-on-background">{bundleServices.filter((row) => row.enabled).length}</span>
        </p>
        {sp.saved === 'services' ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            Bundle services saved.
            {sp.included || sp.excluded ? (
              <span className="ml-1">
                Included: {sp.included ?? '0'}, excluded: {sp.excluded ?? '0'}.
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="mt-1 text-sm text-on-surface-variant">
          Bundle key: <code className="rounded bg-surface-container px-1 py-0.5 text-xs">{bundle.bundle_key}</code>
          {' · '}
          {bundle.workspace_type} · {bundle.status}
        </p>
        <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          <p className="font-medium text-on-background">What this page controls</p>
          <ul className="mt-2 space-y-1">
            <li>- Billing mode, Stripe price id, monthly price, and trial period for this bundle.</li>
            <li>- Which services are included in the bundle after subscription purchase.</li>
            <li>- Which bundle-default overrides are present for launch readiness checks.</li>
          </ul>
          <p className="mt-3 font-medium text-on-background">What this page does not control</p>
          <p className="mt-2">
            Deep-audit bypass behavior is controlled by service entitlements and payment-required
            overrides in the service control center at <Link href="/admin/services" className="text-primary hover:underline">/admin/services</Link>.
          </p>
        </div>
      </div>

      {/* Section 0: Readiness summary */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-semibold text-on-background">
              Bundle readiness check
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Operator-facing summary for billing config, Stripe mappings, and entitlement coverage.
              Use this before enabling self-serve onboarding for a bundle.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              readiness.status === 'ready'
                ? 'bg-emerald-500/15 text-emerald-700'
                : readiness.status === 'review'
                  ? 'bg-amber-500/15 text-amber-700'
                  : 'bg-red-500/15 text-red-700'
            }`}
          >
            {readiness.status.replace('_', ' ')}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Billing
            </p>
            <p className="mt-2 text-sm font-medium text-on-background">
              {readiness.billing.ready ? 'Ready' : 'Needs setup'}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Mode:{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-xs">
                {readiness.billing.label}
              </code>
            </p>
            <ul className="mt-3 space-y-1 text-sm text-on-surface-variant">
              {readiness.billing.issues.length > 0 ? (
                readiness.billing.issues.map((issue) => <li key={issue}>- {issue}</li>)
              ) : (
                <li>- Billing mode, price, and trial config are internally consistent for subscription checkout.</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Mappings
            </p>
            <p className="mt-2 text-sm font-medium text-on-background">
              {readiness.mappings.ready ? 'Ready' : 'Needs setup'}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {readiness.mappings.mappedServices} mapped of {readiness.mappings.enabledServices} enabled services
            </p>
            <ul className="mt-3 space-y-1 text-sm text-on-surface-variant">
              {readiness.mappings.issues.length > 0 ? (
                readiness.mappings.issues.map((issue) => <li key={issue}>- {issue}</li>)
              ) : (
                <li>- Every enabled paid/trial service has an active Stripe mapping.</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Entitlements
            </p>
            <p className="mt-2 text-sm font-medium text-on-background">
              {readiness.entitlements.ready ? 'Ready' : 'Review'}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {readiness.entitlements.bundleOverrides} bundle overrides,{' '}
              {readiness.entitlements.globalOverrides} global overrides
            </p>
            <ul className="mt-3 space-y-1 text-sm text-on-surface-variant">
              {readiness.entitlements.issues.length > 0 ? (
                readiness.entitlements.issues.map((issue) => <li key={issue}>- {issue}</li>)
              ) : (
                <li>- Bundle and global overrides are present where this bundle expects them.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
          <p className="font-medium text-on-background">Launch checklist</p>
          <ul className="mt-2 space-y-1">
            <li>- Paid bundles should have `billing_mode` set to `monthly` or `annual`.</li>
            <li>- Paid bundles should have a Stripe price id and monthly price in cents.</li>
            <li>- Every enabled paid or trial service should have an active Stripe mapping.</li>
            <li>- Any deep-audit bypass rule should be configured in the service control center, not here.</li>
          </ul>
        </div>
      </section>

      {/* Section 1: Billing config */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6">
        <div>
          <h2 className="font-headline text-xl font-semibold text-on-background">Billing configuration</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Set the Stripe Price ID used for subscription checkout. One price ID per bundle —
            this is what Stripe charges for.
          </p>
        </div>

        <form action={updateBundleBilling} className="space-y-5">
          <input type="hidden" name="bundleKey" value={bundle.bundle_key} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="billingMode" className="text-xs font-medium text-on-surface-variant">
                Billing mode
              </label>
              <select
                id="billingMode"
                name="billingMode"
                defaultValue={bundle.billing_mode ?? 'free'}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-background focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {BILLING_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="stripePriceId" className="text-xs font-medium text-on-surface-variant">
                Stripe Price ID
                <span className="ml-1 text-on-surface-variant/60">(e.g. price_xxx)</span>
              </label>
              <input
                id="stripePriceId"
                name="stripePriceId"
                type="text"
                defaultValue={bundle.stripe_price_id ?? ''}
                placeholder="price_1ABC…"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm font-mono text-on-background placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="monthlyCents" className="text-xs font-medium text-on-surface-variant">
                Monthly price (cents)
                <span className="ml-1 text-on-surface-variant/60">(e.g. 4900 = $49)</span>
              </label>
              <input
                id="monthlyCents"
                name="monthlyCents"
                type="number"
                min="0"
                defaultValue={bundle.monthly_price_cents ?? ''}
                placeholder="4900"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="trialDays" className="text-xs font-medium text-on-surface-variant">
                Trial period (days)
                <span className="ml-1 text-on-surface-variant/60">(0 = no trial)</span>
              </label>
              <input
                id="trialDays"
                name="trialDays"
                type="number"
                min="0"
                defaultValue={bundle.trial_period_days ?? 0}
                placeholder="7"
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-background placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition hover:opacity-90"
          >
            Save billing config
          </button>
        </form>
      </section>

      {/* Section 2: Services checklist */}
      <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6">
        <div>
          <h2 className="font-headline text-xl font-semibold text-on-background">
            Included services ({services.length})
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Toggle whether each service is included in this bundle.
            Included services are saved as free rows; excluded services are saved as off rows.
            Hit "Save included services" once to apply all changes in one go.
          </p>
        </div>

        <form action={upsertBundleServices} className="space-y-4">
          <input type="hidden" name="bundleKey" value={bundle.bundle_key} />

          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Service</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-on-surface-variant">Included</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Usage limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {services.map((svc) => {
                  const existing = bsMap.get(svc.id);
                  return (
                    <tr key={svc.id} className="bg-surface-container-lowest">
                      <td className="px-4 py-3">
                        {/* Hidden field carries the service ID */}
                        <input type="hidden" name="serviceId" value={svc.id} />
                        <p className="font-medium text-on-background">{svc.name}</p>
                        <p className="text-xs text-on-surface-variant font-mono">{svc.service_key}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant capitalize">
                        {svc.category ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {/* Select keeps the positional arrays aligned across rows. */}
                        <select
                          name="included"
                          defaultValue={(existing?.enabled ?? false) ? 'true' : 'false'}
                          className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-1 text-xs text-on-background focus:border-primary focus:outline-none"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          name="usageLimit"
                          min="0"
                          defaultValue={existing?.usage_limit ?? ''}
                          placeholder="∞"
                          className="w-20 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-1 text-xs text-on-background placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition hover:opacity-90"
          >
            Save included services
          </button>
        </form>
      </section>
    </div>
  );
}


