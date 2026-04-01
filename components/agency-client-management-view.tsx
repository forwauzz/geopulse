'use client';

import { useActionState } from 'react';
import {
  addAgencyClientDomainFromDashboard,
  createAgencyClientFromDashboard,
  type AgencyDashboardActionState,
} from '@/app/dashboard/actions';
import type { AgencyDashboardClientDomain } from '@/lib/server/agency-dashboard-data';

const initialState: AgencyDashboardActionState | null = null;

type ClientOption = {
  readonly id: string;
  readonly name: string;
};

type Props = {
  readonly agencyAccountId: string;
  readonly selectedClientId: string | null;
  readonly selectedClientName: string | null;
  readonly clientOptions: ClientOption[];
  readonly selectedClientDomains: AgencyDashboardClientDomain[];
};

export function AgencyClientManagementView({
  agencyAccountId,
  selectedClientId,
  selectedClientName,
  clientOptions,
  selectedClientDomains,
}: Props) {
  const [clientState, createClientAction, clientPending] = useActionState(
    createAgencyClientFromDashboard,
    initialState
  );
  const [domainState, addDomainAction, domainPending] = useActionState(
    addAgencyClientDomainFromDashboard,
    initialState
  );

  return (
    <section className="mt-8 grid gap-6 xl:grid-cols-2">
      <form action={createClientAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <input type="hidden" name="agencyAccountId" value={agencyAccountId} />
        <h3 className="font-headline text-lg font-semibold text-on-background">Add client</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          Create a client workspace directly from the agency dashboard.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Client key</span>
            <input
              name="clientKey"
              required
              placeholder="clinic-a"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Client name</span>
            <input
              name="name"
              required
              placeholder="Clinic A"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background md:col-span-2">
            <span className="font-medium">Primary domain or site URL</span>
            <input
              name="primaryDomain"
              required
              placeholder="clinica.com"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Vertical</span>
            <input
              name="vertical"
              placeholder="healthcare"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Subvertical</span>
            <input
              name="subvertical"
              placeholder="medical_clinics"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background md:col-span-2">
            <span className="font-medium">ICP tag</span>
            <input
              name="icpTag"
              placeholder="medical_clinics"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={clientPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {clientPending ? 'Saving…' : 'Create client'}
          </button>
          {clientState ? (
            <p className={`text-sm ${clientState.ok ? 'text-primary' : 'text-error'}`}>
              {clientState.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="space-y-4">
        <form action={addDomainAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <input type="hidden" name="agencyAccountId" value={agencyAccountId} />
          <input type="hidden" name="agencyClientId" value={selectedClientId ?? ''} />
          <h3 className="font-headline text-lg font-semibold text-on-background">Add tracked domain</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            {selectedClientName
              ? `Add another tracked domain for ${selectedClientName}.`
              : 'Select a client first, then add tracked domains.'}
          </p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Selected client</span>
              <select
                value={selectedClientId ?? ''}
                disabled
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">{clientOptions.length > 0 ? 'Choose a client from the dashboard tabs' : 'No clients yet'}</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Domain or site URL</span>
              <input
                name="domainInput"
                required
                disabled={!selectedClientId}
                placeholder="support.clinica.com"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-on-background">
              <input
                type="checkbox"
                name="isPrimary"
                value="true"
                disabled={!selectedClientId}
                className="h-4 w-4 rounded border-outline-variant/20"
              />
              <span>Set as primary domain</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={domainPending || !selectedClientId}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              {domainPending ? 'Saving…' : 'Add domain'}
            </button>
            {domainState ? (
              <p className={`text-sm ${domainState.ok ? 'text-primary' : 'text-error'}`}>
                {domainState.message}
              </p>
            ) : null}
          </div>
        </form>

        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h3 className="font-headline text-lg font-semibold text-on-background">Tracked domains</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            {selectedClientName
              ? `Current tracked domains for ${selectedClientName}.`
              : 'Select a client to see its tracked domains.'}
          </p>
          <ul className="mt-4 space-y-3">
            {selectedClientDomains.length === 0 ? (
              <li className="rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
                No tracked domains yet for this client.
              </li>
            ) : (
              selectedClientDomains.map((domain) => (
                <li key={domain.id} className="rounded-xl bg-surface-container-low px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-on-background">{domain.canonicalDomain}</p>
                      <p className="text-sm text-on-surface-variant">{domain.siteUrl ?? domain.domain}</p>
                    </div>
                    {domain.isPrimary ? (
                      <span className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                        Primary
                      </span>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
