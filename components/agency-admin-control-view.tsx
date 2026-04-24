'use client';

import { useActionState } from 'react';
import {
  createAgencyAccount,
  createAgencyClient,
  createAgencyUser,
  deleteAgencyAccount,
  removeAgencyMember,
  upsertAgencyFeatureFlag,
  upsertAgencyModelPolicy,
  type AgencyAdminActionState,
} from '@/app/dashboard/agencies/actions';
import type { AgencyAccountAdminDetail } from '@/lib/server/agency-admin-data';
import type { GpmConfigAdminRow, GpmQuerySetOption } from '@/lib/server/geo-performance-admin-data';
import { GpmWorkspaceConfigSection } from '@/components/gpm-workspace-config-section';

const initialState: AgencyAdminActionState | null = null;

type Props = {
  readonly accounts: AgencyAccountAdminDetail[];
  readonly gpmConfigsByAccountId?: ReadonlyMap<string, GpmConfigAdminRow[]>;
  readonly gpmQuerySetOptions?: GpmQuerySetOption[];
};

const agencyFlagOptions = [
  {
    key: 'payment_required',
    label: 'payment_required',
    description: 'Require Stripe checkout for deep audit unless explicitly bypassed.',
  },
  {
    key: 'agency_dashboard_enabled',
    label: 'agency_dashboard_enabled',
    description: 'Show or hide the agency dashboard module on /dashboard.',
  },
  {
    key: 'scan_launch_enabled',
    label: 'scan_launch_enabled',
    description: 'Allow or block new agency-context scan launches.',
  },
  {
    key: 'report_history_enabled',
    label: 'report_history_enabled',
    description: 'Show or hide agency scan and report history.',
  },
  {
    key: 'deep_audit_enabled',
    label: 'deep_audit_enabled',
    description: 'Allow or block the agency deep-audit CTA and runtime path.',
  },
  {
    key: 'geo_tracker_enabled',
    label: 'geo_tracker_enabled',
    description: 'Mark the agency GEO tracker module as enabled for future surfaces.',
  },
] as const;

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AgencyAdminControlView({ accounts, gpmConfigsByAccountId, gpmQuerySetOptions }: Props) {
  const [accountState, accountAction, accountPending] = useActionState(
    createAgencyAccount,
    initialState
  );
  const [clientState, clientAction, clientPending] = useActionState(
    createAgencyClient,
    initialState
  );
  const [flagState, flagAction, flagPending] = useActionState(
    upsertAgencyFeatureFlag,
    initialState
  );
  const [userState, userAction, userPending] = useActionState(createAgencyUser, initialState);
  const [policyState, policyAction, policyPending] = useActionState(
    upsertAgencyModelPolicy,
    initialState
  );
  const [removeMemberState, removeMemberAction, removeMemberPending] = useActionState(
    removeAgencyMember,
    initialState
  );
  const [deleteAccountState, deleteAccountAction, deleteAccountPending] = useActionState(
    deleteAgencyAccount,
    initialState
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Agency pilot control
          </h1>
          <p className="mt-1 max-w-3xl font-body text-on-surface-variant">
            Provision pilot agencies, clients, feature entitlements, and model policies without
            manual SQL. Start with `lifter` and keep this surface scoped to pilot control only.
          </p>
        </div>
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <form action={accountAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Create agency account</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Account key</span>
              <input name="accountKey" required placeholder="lifter" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Name</span>
              <input name="name" required placeholder="Lifter" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Website domain</span>
              <input name="websiteDomain" placeholder="lifter.ca" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Canonical domain</span>
              <input name="canonicalDomain" placeholder="lifter.ca" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Benchmark vertical</span>
              <input name="benchmarkVertical" placeholder="healthcare" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Benchmark subvertical</span>
              <input name="benchmarkSubvertical" placeholder="medical_clinics" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={accountPending} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">
              {accountPending ? 'Saving…' : 'Create agency'}
            </button>
            {accountState ? (
              <p className={`text-sm ${accountState.ok ? 'text-primary' : 'text-error'}`}>
                {accountState.message}
              </p>
            ) : null}
          </div>
        </form>

        <form action={clientAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Add client</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-on-background md:col-span-2">
              <span className="font-medium">Agency</span>
              <select name="agencyAccountId" required className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Choose an agency</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.account_key})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Client key</span>
              <input name="clientKey" required placeholder="lifter-self" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Client name</span>
              <input name="name" required placeholder="Lifter" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Display name</span>
              <input name="displayName" placeholder="Lifter" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Website domain</span>
              <input name="websiteDomain" placeholder="lifter.ca" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Vertical</span>
              <input name="vertical" placeholder="healthcare" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Subvertical</span>
              <input name="subvertical" placeholder="medical_clinics" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background md:col-span-2">
              <span className="font-medium">ICP tag</span>
              <input name="icpTag" placeholder="medical_clinics" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={clientPending} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">
              {clientPending ? 'Saving…' : 'Add client'}
            </button>
            {clientState ? (
              <p className={`text-sm ${clientState.ok ? 'text-primary' : 'text-error'}`}>
                {clientState.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <form action={flagAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Set feature flag</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Agency</span>
              <select name="agencyAccountId" required className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Choose an agency</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Client override</span>
              <select name="agencyClientId" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Account-level only</option>
                {accounts.flatMap((account) =>
                  account.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {account.name} · {client.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Flag key</span>
              <select
                name="flagKey"
                required
                defaultValue="payment_required"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                {agencyFlagOptions.map((flag) => (
                  <option key={flag.key} value={flag.key}>
                    {flag.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Enabled</span>
              <select name="enabled" defaultValue="false" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
            <p className="font-medium text-on-background">Live flag presets</p>
            <ul className="mt-2 space-y-2">
              {agencyFlagOptions.map((flag) => (
                <li key={flag.key}>
                  <code className="rounded bg-surface-container-lowest px-1.5 py-0.5 text-xs">
                    {flag.key}
                  </code>{' '}
                  {flag.description}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={flagPending} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">
              {flagPending ? 'Saving…' : 'Save flag'}
            </button>
            {flagState ? (
              <p className={`text-sm ${flagState.ok ? 'text-primary' : 'text-error'}`}>
                {flagState.message}
              </p>
            ) : null}
          </div>
        </form>

        <form action={userAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Add agency user</h2>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Agency</span>
              <select name="agencyAccountId" required className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Choose an agency</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Email</span>
              <input name="email" type="email" required placeholder="pilot@lifter.ca" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Password</span>
              <input name="password" type="password" required minLength={8} className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Role</span>
              <select name="role" defaultValue="member" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="owner">owner</option>
                <option value="manager">manager</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={userPending} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">
              {userPending ? 'Saving…' : 'Save user'}
            </button>
            {userState ? (
              <p className={`text-sm ${userState.ok ? 'text-primary' : 'text-error'}`}>
                {userState.message}
              </p>
            ) : null}
          </div>
        </form>

        <form action={policyAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Set model policy</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Agency</span>
              <select name="agencyAccountId" required className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Choose an agency</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Client override</span>
              <select name="agencyClientId" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="">Account-level only</option>
                {accounts.flatMap((account) =>
                  account.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {account.name} · {client.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Surface</span>
              <select name="productSurface" defaultValue="deep_audit" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="deep_audit">Deep audit</option>
                <option value="free_scan">Free scan</option>
                <option value="benchmark">Benchmark</option>
                <option value="report_rewrite">Report rewrite</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Provider</span>
              <select name="providerName" defaultValue="openai" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <option value="openai">openai</option>
                <option value="gemini">gemini</option>
                <option value="anthropic">anthropic</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background md:col-span-2">
              <span className="font-medium">Model id</span>
              <input name="modelId" required placeholder="gpt-5.5" className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={policyPending} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">
              {policyPending ? 'Saving…' : 'Save model policy'}
            </button>
            {policyState ? (
              <p className={`text-sm ${policyState.ok ? 'text-primary' : 'text-error'}`}>
                {policyState.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-12 space-y-6">
        {accounts.length === 0 ? (
          <div className="rounded-xl bg-surface-container-low p-6 text-sm text-on-surface-variant">
            No agency accounts yet. Create `lifter` here first, then add clients, flags, and model
            policy.
          </div>
        ) : (
          accounts.map((account) => (
            <article key={account.id} className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-headline text-2xl font-bold text-on-background">
                    {account.name}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {account.account_key}
                    {account.canonical_domain ? ` · ${account.canonical_domain}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-primary/15 px-3 py-1 text-primary">
                    {formatLabel(account.status)}
                  </span>
                  <span className="rounded-lg bg-surface-container-high px-3 py-1 text-on-surface-variant">
                    {formatLabel(account.billing_mode)}
                  </span>
                  {account.benchmark_subvertical ? (
                    <span className="rounded-lg bg-tertiary/15 px-3 py-1 text-tertiary">
                      {account.benchmark_subvertical}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-4">
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">Clients</p>
                  <p className="mt-1 text-2xl font-bold text-on-background">{account.clients.length}</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">Users</p>
                  <p className="mt-1 text-2xl font-bold text-on-background">{account.users.length}</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">Flags</p>
                  <p className="mt-1 text-2xl font-bold text-on-background">{account.featureFlags.length}</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">Policies</p>
                  <p className="mt-1 text-2xl font-bold text-on-background">{account.modelPolicies.length}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section>
                  <h3 className="font-headline text-lg font-semibold text-on-background">Clients</h3>
                  <div className="mt-3 overflow-x-auto rounded-xl bg-surface-container-low">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-on-surface-variant">
                        <tr>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Vertical</th>
                          <th className="px-4 py-3">ICP</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.clients.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-on-surface-variant">
                              No clients yet.
                            </td>
                          </tr>
                        ) : (
                          account.clients.map((client) => (
                            <tr key={client.id} className="border-t border-outline-variant/10">
                              <td className="px-4 py-3">
                                <div className="font-medium text-on-background">{client.name}</div>
                                <div className="text-xs text-on-surface-variant">
                                  {client.canonical_domain ?? client.client_key}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-on-surface-variant">
                                {client.subvertical ?? client.vertical ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-on-surface-variant">
                                {client.icp_tag ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-on-surface-variant">
                                {formatLabel(client.status)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="font-headline text-lg font-semibold text-on-background">Control state</h3>
                  <div className="mt-3 space-y-4">
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p className="text-sm font-medium text-on-background">Feature flags</p>
                      <ul className="mt-2 space-y-2 text-sm text-on-surface-variant">
                        {account.featureFlags.length === 0 ? (
                          <li>No flags yet.</li>
                        ) : (
                          account.featureFlags.map((flag) => (
                            <li key={flag.id}>
                              {flag.agency_client_id ? 'Client override' : 'Account'} · {flag.flag_key} ·{' '}
                              <span className={flag.enabled ? 'text-primary' : 'text-error'}>
                                {String(flag.enabled)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p className="text-sm font-medium text-on-background">Model policies</p>
                      <ul className="mt-2 space-y-2 text-sm text-on-surface-variant">
                        {account.modelPolicies.length === 0 ? (
                          <li>No model policies yet.</li>
                        ) : (
                          account.modelPolicies.map((policy) => (
                            <li key={policy.id}>
                              {policy.agency_client_id ? 'Client override' : 'Account'} ·{' '}
                              {formatLabel(policy.product_surface)} · {policy.provider_name} / {policy.model_id}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p className="text-sm font-medium text-on-background">Agency users</p>
                      <ul className="mt-2 space-y-2 text-sm text-on-surface-variant">
                        {account.users.length === 0 ? (
                          <li>No users assigned yet.</li>
                        ) : (
                          account.users.map((user) => (
                            <li key={user.id} className="flex items-center justify-between gap-3">
                              <span>
                                {user.email ?? user.user_id} · {formatLabel(user.role)} · {formatLabel(user.status)}
                              </span>
                              <form action={removeMemberAction} className="shrink-0">
                                <input type="hidden" name="agencyAccountId" value={account.id} />
                                <input type="hidden" name="userId" value={user.user_id} />
                                <button
                                  type="submit"
                                  disabled={removeMemberPending}
                                  className="text-xs text-error hover:underline disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </form>
                            </li>
                          ))
                        )}
                        {removeMemberState?.ok === false && (
                          <li className="text-xs text-error">{removeMemberState.message}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </section>
              </div>

              <GpmWorkspaceConfigSection
                configs={gpmConfigsByAccountId?.get(account.id) ?? []}
                querySetOptions={gpmQuerySetOptions ?? []}
              />

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-error hover:underline">
                  Delete account
                </summary>
                <form action={deleteAccountAction} className="mt-3 flex flex-col gap-3 rounded-xl border border-error/20 bg-surface-container-low p-4">
                  <input type="hidden" name="agencyAccountId" value={account.id} />
                  <label className="flex flex-col gap-1 text-sm text-on-background">
                    <span className="font-medium">
                      Type <span className="font-mono text-error">{account.name}</span> to confirm
                    </span>
                    <input
                      type="text"
                      name="confirmName"
                      autoComplete="off"
                      placeholder={account.name}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={deleteAccountPending}
                      className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-on-error disabled:opacity-50"
                    >
                      {deleteAccountPending ? 'Deleting…' : 'Delete account'}
                    </button>
                    {deleteAccountState?.ok === false && (
                      <p className="text-xs text-error">{deleteAccountState.message}</p>
                    )}
                    {deleteAccountState?.ok === true && (
                      <p className="text-xs text-primary">{deleteAccountState.message}</p>
                    )}
                  </div>
                </form>
              </details>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
