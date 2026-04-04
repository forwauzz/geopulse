'use client';

import { useActionState } from 'react';
import {
  upsertBundleServiceControl,
  upsertServiceCatalogControl,
  upsertServiceEntitlementOverride,
  type ServiceControlActionState,
} from '@/app/dashboard/services/actions';
import type { ServiceControlAdminOverview } from '@/lib/server/service-control-admin-data';

const initialState: ServiceControlActionState | null = null;

type Props = {
  readonly overview: ServiceControlAdminOverview;
};

function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderResult(state: ServiceControlActionState | null) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? 'text-primary' : 'text-error'}`}>{state.message}</p>;
}

export function ServiceControlAdminView({ overview }: Props) {
  const [serviceState, serviceAction, servicePending] = useActionState(
    upsertServiceCatalogControl,
    initialState
  );
  const [bundleState, bundleAction, bundlePending] = useActionState(
    upsertBundleServiceControl,
    initialState
  );
  const [overrideState, overrideAction, overridePending] = useActionState(
    upsertServiceEntitlementOverride,
    initialState
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Service control center
          </h1>
          <p className="mt-1 max-w-3xl font-body text-on-surface-variant">
            Centralized service defaults, bundle toggles, and scoped entitlement overrides. Every
            change is audit logged to admin logs.
          </p>
        </div>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Services
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {overview.services.length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Bundles
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {overview.bundles.length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Bundle mappings
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {overview.bundleServices.length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Overrides
          </p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-background">
            {overview.overrides.length}
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <form action={serviceAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Service defaults
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Set free/paid/trial/off defaults and active status per service.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Service</span>
              <select
                name="serviceKey"
                required
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose a service</option>
                {overview.services.map((service) => (
                  <option key={service.id} value={service.service_key}>
                    {service.name} ({service.service_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Default access mode</span>
              <select
                name="defaultAccessMode"
                defaultValue="off"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="free">free</option>
                <option value="paid">paid</option>
                <option value="trial">trial</option>
                <option value="off">off</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Service active</span>
              <select
                name="isActive"
                defaultValue="true"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={servicePending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {servicePending ? 'Saving...' : 'Save service defaults'}
            </button>
            {renderResult(serviceState)}
          </div>
        </form>

        <form action={bundleAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Bundle service mapping
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Toggle services per bundle and set Stripe placeholder IDs.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Bundle</span>
              <select
                name="bundleKey"
                required
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose a bundle</option>
                {overview.bundles.map((bundle) => (
                  <option key={bundle.id} value={bundle.bundle_key}>
                    {bundle.name} ({bundle.bundle_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Service</span>
              <select
                name="serviceKey"
                required
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose a service</option>
                {overview.services.map((service) => (
                  <option key={service.id} value={service.service_key}>
                    {service.name} ({service.service_key})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-on-background">
                <span className="font-medium">Enabled</span>
                <select
                  name="enabled"
                  defaultValue="true"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-on-background">
                <span className="font-medium">Access mode override</span>
                <select
                  name="accessMode"
                  defaultValue="free"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
                >
                  <option value="">inherit service default</option>
                  <option value="free">free</option>
                  <option value="paid">paid</option>
                  <option value="trial">trial</option>
                  <option value="off">off</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Usage limit (optional)</span>
              <input
                name="usageLimit"
                type="number"
                min={0}
                placeholder="100"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Stripe product id (placeholder)</span>
              <input
                name="stripeProductId"
                placeholder="prod_..."
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Stripe price id (placeholder)</span>
              <input
                name="stripePriceId"
                placeholder="price_..."
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={bundlePending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {bundlePending ? 'Saving...' : 'Save bundle mapping'}
            </button>
            {renderResult(bundleState)}
          </div>
        </form>

        <form action={overrideAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Entitlement override
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Set scoped runtime overrides for global, bundle, agency, client, or user.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Service</span>
              <select
                name="serviceKey"
                required
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose a service</option>
                {overview.services.map((service) => (
                  <option key={service.id} value={service.service_key}>
                    {service.name} ({service.service_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Scope type</span>
              <select
                name="scopeType"
                defaultValue="global"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="global">global</option>
                <option value="bundle_default">bundle_default</option>
                <option value="agency_account">agency_account</option>
                <option value="agency_client">agency_client</option>
                <option value="user">user</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Bundle (bundle_default only)</span>
              <select
                name="bundleKey"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">None</option>
                {overview.bundles.map((bundle) => (
                  <option key={bundle.id} value={bundle.bundle_key}>
                    {bundle.name} ({bundle.bundle_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Agency account</span>
              <select
                name="agencyAccountId"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">None</option>
                {overview.agencyAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.account_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Agency client</span>
              <select
                name="agencyClientId"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">None</option>
                {overview.agencyClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.client_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">User id (user scope only)</span>
              <input
                name="userId"
                placeholder="uuid"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-on-background">
                <span className="font-medium">Enabled</span>
                <select
                  name="enabled"
                  defaultValue="true"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-on-background">
                <span className="font-medium">Access mode</span>
                <select
                  name="accessMode"
                  defaultValue="inherit"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
                >
                  <option value="inherit">inherit</option>
                  <option value="free">free</option>
                  <option value="paid">paid</option>
                  <option value="trial">trial</option>
                  <option value="off">off</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Usage limit (optional)</span>
              <input
                name="usageLimit"
                type="number"
                min={0}
                placeholder="25"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Operator note</span>
              <textarea
                name="note"
                rows={2}
                placeholder="Reason for this override..."
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={overridePending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {overridePending ? 'Saving...' : 'Save override'}
            </button>
            {renderResult(overrideState)}
          </div>
        </form>
      </section>

      <section className="mt-12 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
        <h2 className="px-4 pt-4 font-headline text-xl font-bold text-on-background">
          Bundle service matrix
        </h2>
        <table className="min-w-[1180px] w-full border-collapse text-left font-body text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-on-surface-variant">
              <th className="px-4 py-3">Bundle</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Access mode</th>
              <th className="px-4 py-3">Usage limit</th>
              <th className="px-4 py-3">Stripe placeholder</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {overview.bundleServices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant" colSpan={7}>
                  No bundle mappings found.
                </td>
              </tr>
            ) : (
              overview.bundleServices.map((row) => {
                const stripeMeta =
                  row.metadata['stripe'] && typeof row.metadata['stripe'] === 'object'
                    ? (row.metadata['stripe'] as Record<string, unknown>)
                    : null;
                const stripeSummary = stripeMeta
                  ? `${String(stripeMeta['product_id'] ?? '-')}/${String(stripeMeta['price_id'] ?? '-')}`
                  : '-';

                return (
                  <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                    <td className="px-4 py-3">{row.bundle_key}</td>
                    <td className="px-4 py-3">{row.service_key}</td>
                    <td className="px-4 py-3">{String(row.enabled)}</td>
                    <td className="px-4 py-3">{row.access_mode ?? 'inherit'}</td>
                    <td className="px-4 py-3">{row.usage_limit ?? '-'}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{stripeSummary}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {new Date(row.updated_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
        <h2 className="px-4 pt-4 font-headline text-xl font-bold text-on-background">
          Scoped overrides
        </h2>
        <table className="min-w-[1280px] w-full border-collapse text-left font-body text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-on-surface-variant">
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Access mode</th>
              <th className="px-4 py-3">Usage limit</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {overview.overrides.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant" colSpan={8}>
                  No scoped overrides found.
                </td>
              </tr>
            ) : (
              overview.overrides.map((row) => {
                const target =
                  row.scope_type === 'bundle_default'
                    ? row.bundle_key
                    : row.scope_type === 'agency_account'
                      ? row.agency_account_key
                      : row.scope_type === 'agency_client'
                        ? row.agency_client_key
                        : row.scope_type === 'user'
                          ? row.user_id
                          : 'global';
                const note =
                  row.metadata['note'] && typeof row.metadata['note'] === 'string'
                    ? row.metadata['note']
                    : '-';

                return (
                  <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                    <td className="px-4 py-3">{row.service_key}</td>
                    <td className="px-4 py-3">{formatLabel(row.scope_type)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{target ?? '-'}</td>
                    <td className="px-4 py-3">{String(row.enabled)}</td>
                    <td className="px-4 py-3">{row.access_mode ?? 'inherit'}</td>
                    <td className="px-4 py-3">{row.usage_limit ?? '-'}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{note}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {new Date(row.updated_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

