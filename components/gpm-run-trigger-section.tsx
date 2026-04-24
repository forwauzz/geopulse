'use client';

import { useActionState } from 'react';
import {
  triggerGpmDryRunAction,
  type GpmDryRunActionState,
} from '@/app/dashboard/benchmarks/gpm-configs/manual-run/actions';
import type { GpmReportAdminRow } from '@/lib/server/geo-performance-admin-data';

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

const STATUS_LABELS: Record<string, string> = {
  launched: 'launched',
  skipped_existing: 'already existed',
  failed: 'failed',
};

export function GpmRunTriggerSection({
  configId,
  reports,
}: {
  configId: string;
  reports: GpmReportAdminRow[];
}) {
  const [state, action, pending] = useActionState<GpmDryRunActionState | null, FormData>(
    triggerGpmDryRunAction,
    null
  );

  return (
    <div className="space-y-4">
      {/* Reports table */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-medium text-on-surface">Generated reports</p>
          <span className="text-xs text-on-surface-variant">
            {reports.length} record{reports.length !== 1 ? 's' : ''}
          </span>
        </div>

        {reports.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-on-surface-variant">
            No reports yet. Trigger a dry run or wait for the first scheduled sweep.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-surface-container-lowest">
                <tr className="text-xs text-on-surface-variant">
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5">Window</th>
                  <th className="px-4 py-2.5">Narrative</th>
                  <th className="px-4 py-2.5">PDF</th>
                  <th className="px-4 py-2.5">Generated</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t border-outline-variant/10">
                    <td className="px-4 py-2.5 text-sm text-on-surface">
                      {PLATFORM_LABELS[r.platform] ?? r.platform}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-on-surface-variant">
                      {r.window_date}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.narrative_generated ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant/60">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.pdf_url ? (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          View PDF ↗
                        </a>
                      ) : (
                        <span className="text-xs text-on-surface-variant/60">No PDF</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">
                      {new Date(r.generated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dry run trigger */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
        <p className="text-sm font-medium text-on-surface">Dry run trigger</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          Creates run-group stubs using a no-op adapter — validates config, entitlement, and
          idempotency without real AI calls. Confirms wiring before the first scheduled delivery.
        </p>

        {state && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.ok ? 'bg-primary/5 text-primary' : 'bg-error/5 text-error'}`}
          >
            <p>{state.message}</p>
            {state.ok && state.summary && state.summary.platformResults.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {state.summary.platformResults.map((r) => (
                  <li key={r.platform} className="flex items-center gap-1.5">
                    <span className="font-medium">
                      {PLATFORM_LABELS[r.platform] ?? r.platform}
                    </span>
                    <span className="text-current/60">
                      — {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    {r.runGroupId && (
                      <span className="font-mono text-current/40">
                        {r.runGroupId.slice(0, 8)}…
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form action={action} className="mt-3">
          <input type="hidden" name="configId" value={configId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-secondary px-4 py-1.5 text-sm font-medium text-on-secondary disabled:opacity-50"
          >
            {pending ? 'Running…' : 'Trigger dry run'}
          </button>
        </form>
      </div>
    </div>
  );
}
