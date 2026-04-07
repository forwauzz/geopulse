import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
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

export default async function AdminBundlePage({
  params,
}: {
  params: Promise<{ bundleKey: string }>;
}) {
  const { bundleKey } = await params;
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

  // Now fetch bundle services with the real bundle UUID
  const { data: bundleServices } = await ctx.adminDb
    .from('service_bundle_services')
    .select('service_id, enabled, access_mode, usage_limit')
    .eq('bundle_id', bundle.id)
    .returns<BundleServiceRow[]>();

  const services = servicesResult.data ?? [];
  const bsMap = new Map((bundleServices ?? []).map((r) => [r.service_id, r]));

  const ACCESS_MODES = ['free', 'paid', 'trial', 'off'];
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
          Bundle key: <code className="rounded bg-surface-container px-1 py-0.5 text-xs">{bundle.bundle_key}</code>
          {' · '}
          {bundle.workspace_type} · {bundle.status}
        </p>
      </div>

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
            Toggle which services are enabled for this bundle and set access rules.
            Hit "Save all services" once to apply all changes in one go.
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
                  <th className="px-4 py-3 text-center font-medium text-on-surface-variant">Enabled</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Access mode</th>
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
                        {/* Select instead of checkbox — positional arrays must align with serviceId[] */}
                        <select
                          name="enabled"
                          defaultValue={(existing?.enabled ?? false) ? 'true' : 'false'}
                          className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-1 text-xs text-on-background focus:border-primary focus:outline-none"
                        >
                          <option value="true">✓ Yes</option>
                          <option value="false">— No</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          name="accessMode"
                          defaultValue={existing?.access_mode ?? ''}
                          className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 py-1 text-xs text-on-background focus:border-primary focus:outline-none"
                        >
                          <option value="">—</option>
                          {ACCESS_MODES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
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
            Save all services
          </button>
        </form>
      </section>
    </div>
  );
}
