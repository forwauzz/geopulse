'use client';

import { useActionState } from 'react';
import {
  updateGpmBundleCapsAction,
  type GpmCapsActionState,
} from '@/app/dashboard/services/gpm-caps/actions';
import type { GpmBundleCapOverride } from '@/lib/server/geo-performance-admin-data';
import { BUNDLE_GPM_CAPS } from '@/lib/server/geo-performance-entitlements';

const EDITABLE_BUNDLES = ['startup_dev', 'agency_core', 'agency_pro'] as const;
type EditableBundle = (typeof EDITABLE_BUNDLES)[number];

const BUNDLE_LABELS: Record<EditableBundle, string> = {
  startup_dev: 'Startup Dev',
  agency_core: 'Agency Core',
  agency_pro: 'Agency Pro',
};

const CADENCE_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
};

const DELIVERY_LABELS: Record<string, string> = {
  email: 'Email',
  slack: 'Slack',
  portal: 'Portal',
};

function effectiveCaps(bundleKey: EditableBundle, overrides: Record<string, GpmBundleCapOverride>) {
  const override = overrides[bundleKey];
  if (override) return override;
  const hardcoded = BUNDLE_GPM_CAPS[bundleKey];
  if (!hardcoded) return null;
  return {
    maxPromptsPerRun: hardcoded.maxPromptsPerRun,
    allowedCadences: hardcoded.allowedCadences,
    deliverySurfaces: hardcoded.deliverySurfaces,
  };
}

function BundleCapsTable({
  overrides,
}: {
  overrides: Record<string, GpmBundleCapOverride>;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-outline-variant/20">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-container-low">
          <tr className="text-xs text-on-surface-variant">
            <th className="px-4 py-2.5">Bundle</th>
            <th className="px-4 py-2.5">Max prompts/run</th>
            <th className="px-4 py-2.5">Cadences</th>
            <th className="px-4 py-2.5">Delivery surfaces</th>
            <th className="px-4 py-2.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {EDITABLE_BUNDLES.map((bundleKey) => {
            const caps = effectiveCaps(bundleKey, overrides);
            const isOverridden = !!overrides[bundleKey];
            return (
              <tr key={bundleKey} className="border-t border-outline-variant/10">
                <td className="px-4 py-2.5 font-medium text-on-surface">
                  {BUNDLE_LABELS[bundleKey]}
                </td>
                <td className="px-4 py-2.5 text-on-surface-variant">
                  {caps?.maxPromptsPerRun == null ? '∞ unlimited' : caps.maxPromptsPerRun}
                </td>
                <td className="px-4 py-2.5 text-on-surface-variant">
                  {caps?.allowedCadences.join(', ') ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-on-surface-variant">
                  {caps?.deliverySurfaces.join(', ') ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-on-surface-variant">
                  {isOverridden ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">DB override</span>
                  ) : (
                    <span className="text-on-surface-variant/60">hardcoded</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditBundleCapsForm() {
  const [state, action, pending] = useActionState<GpmCapsActionState | null, FormData>(
    updateGpmBundleCapsAction,
    null
  );

  return (
    <form action={action} className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <p className="text-sm font-medium text-on-surface">Override bundle caps (stored in DB)</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        Overrides take precedence over hardcoded constants at runtime. Applies on next scheduled sweep.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Bundle</span>
          <select
            name="bundleKey"
            required
            className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
          >
            {EDITABLE_BUNDLES.map((bk) => (
              <option key={bk} value={bk}>
                {BUNDLE_LABELS[bk]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Max prompts/run</span>
          <input
            name="maxPromptsPerRun"
            placeholder="e.g. 10 or unlimited"
            className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
          />
          <span className="text-xs text-on-surface-variant">Blank or "unlimited" = no limit</span>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Allowed cadences</span>
          <div className="flex flex-col gap-1">
            {(['monthly', 'biweekly', 'weekly'] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm text-on-surface">
                <input type="checkbox" name="allowedCadences" value={c} defaultChecked />
                {CADENCE_LABELS[c]}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Delivery surfaces</span>
          <div className="flex flex-col gap-1">
            {(['email', 'slack', 'portal'] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-on-surface">
                <input type="checkbox" name="deliverySurfaces" value={d} defaultChecked />
                {DELIVERY_LABELS[d]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {state && (
        <p className={`mt-2 text-xs ${state.ok ? 'text-success' : 'text-error'}`}>{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save caps override'}
      </button>
    </form>
  );
}

export function GpmBundleCapsSection({
  bundleCapOverrides,
}: {
  bundleCapOverrides: Record<string, GpmBundleCapOverride>;
}) {
  return (
    <section className="mt-10 rounded-xl bg-surface-container-lowest p-5 shadow-float">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">
            GEO Performance Monitoring — bundle caps
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Per-bundle limits for prompts per run, scheduling cadence, and report delivery
            surfaces. Hardcoded constants are the playbook baseline; DB overrides take precedence.
          </p>
        </div>
      </div>

      <BundleCapsTable overrides={bundleCapOverrides} />
      <EditBundleCapsForm />
    </section>
  );
}
