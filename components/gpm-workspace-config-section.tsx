'use client';

import { useActionState } from 'react';
import type { GpmConfigAdminRow, GpmQuerySetOption } from '@/lib/server/geo-performance-admin-data';
import {
  updateGpmConfigAction,
  updateGpmCompetitorListAction,
  deleteGpmConfigAction,
  type GpmConfigActionState,
} from '@/app/dashboard/benchmarks/gpm-configs/actions';

const PLATFORM_OPTIONS = ['chatgpt', 'gemini', 'perplexity'] as const;
const CADENCE_OPTIONS = ['monthly', 'biweekly', 'weekly'] as const;
const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

// ── Competitor edit form ──────────────────────────────────────────────────────

function CompetitorEditForm({ config }: { config: GpmConfigAdminRow }) {
  const [state, action, pending] = useActionState<GpmConfigActionState | null, FormData>(
    updateGpmCompetitorListAction,
    null
  );
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-on-surface-variant hover:text-on-surface">
        Competitors ({config.competitor_list.length})
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="configId" value={config.id} />
        <textarea
          name="competitorListText"
          defaultValue={config.competitor_list.join('\n')}
          rows={Math.max(3, Math.min(config.competitor_list.length + 1, 8))}
          placeholder={'One domain per line\ncompetitor.com\nrival.ca'}
          className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 font-mono text-xs text-on-surface"
        />
        {state && (
          <p className={`text-xs ${state.ok ? 'text-success' : 'text-error'}`}>{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </details>
  );
}

// ── Delete form ───────────────────────────────────────────────────────────────

function DeleteConfigForm({ configId }: { configId: string }) {
  const [state, action, pending] = useActionState<GpmConfigActionState | null, FormData>(
    deleteGpmConfigAction,
    null
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm('Delete this GPM config?')) e.preventDefault();
      }}
    >
      <input type="hidden" name="configId" value={configId} />
      {state && !state.ok && <p className="text-xs text-error">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-error hover:underline disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete config'}
      </button>
    </form>
  );
}

// ── Single config edit card ───────────────────────────────────────────────────

function ConfigEditCard({
  config,
  querySetOptions,
}: {
  config: GpmConfigAdminRow;
  querySetOptions: GpmQuerySetOption[];
}) {
  const [state, action, pending] = useActionState<GpmConfigActionState | null, FormData>(
    updateGpmConfigAction,
    null
  );

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-sm text-on-surface">
          {config.domain_display ?? config.domain_canonical}
          <span className="ml-1.5 text-xs text-on-surface-variant">{config.domain_canonical}</span>
        </p>
        <DeleteConfigForm configId={config.id} />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-on-surface-variant hover:text-on-surface">
          Edit config
        </summary>
        <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="configId" value={config.id} />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Topic</span>
            <input
              name="topic"
              defaultValue={config.topic}
              required
              className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Location</span>
            <input
              name="location"
              defaultValue={config.location}
              required
              className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Cadence</span>
            <select
              name="cadence"
              defaultValue={config.cadence}
              className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
            >
              {CADENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Query set</span>
            <select
              name="querySetId"
              defaultValue={config.query_set_id ?? ''}
              className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
            >
              <option value="">None</option>
              {querySetOptions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} v{q.version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Report email</span>
            <input
              name="reportEmail"
              type="email"
              defaultValue={config.report_email ?? ''}
              placeholder="client@example.com"
              className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface"
            />
          </label>

          {/* Platforms via hidden input + checkboxes */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-on-surface-variant">Platforms</span>
            <PlatformChecks configId={config.id} defaultPlatforms={config.platforms_enabled} />
          </div>

          {state && (
            <p className={`sm:col-span-2 text-xs ${state.ok ? 'text-success' : 'text-error'}`}>
              {state.message}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save config'}
            </button>
          </div>
        </form>
      </details>

      <CompetitorEditForm config={config} />
    </div>
  );
}

// Controlled platform checkboxes that write to a hidden `platforms` input
function PlatformChecks({
  configId,
  defaultPlatforms,
}: {
  configId: string;
  defaultPlatforms: string[];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {PLATFORM_OPTIONS.map((p) => (
        <label key={p} className="flex items-center gap-1 text-sm text-on-surface">
          <input
            type="checkbox"
            name="platform_check"
            value={p}
            defaultChecked={defaultPlatforms.includes(p)}
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (!form) return;
              const checked = Array.from(
                form.querySelectorAll<HTMLInputElement>(`[name="platform_check"]`)
              )
                .filter((el) => el.checked)
                .map((el) => el.value);
              let hidden = form.querySelector<HTMLInputElement>(`[name="platforms"][data-id="${configId}"]`);
              if (!hidden) {
                hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'platforms';
                hidden.dataset.id = configId;
                form.appendChild(hidden);
              }
              hidden.value = checked.join(',');
            }}
          />
          {PLATFORM_LABELS[p]}
        </label>
      ))}
    </div>
  );
}

// ── Main section component ────────────────────────────────────────────────────

export function GpmWorkspaceConfigSection({
  configs,
  querySetOptions,
}: {
  configs: GpmConfigAdminRow[];
  querySetOptions: GpmQuerySetOption[];
}) {
  return (
    <div className="mt-4 rounded-xl bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-on-background">GEO Performance Monitoring</p>
        <a
          href="/dashboard/benchmarks/gpm-configs"
          className="text-xs text-primary hover:underline"
        >
          Manage all configs →
        </a>
      </div>

      {configs.length === 0 ? (
        <p className="mt-2 text-xs text-on-surface-variant">
          No GPM config for this workspace.{' '}
          <a href="/dashboard/benchmarks/gpm-configs" className="text-primary hover:underline">
            Add one
          </a>
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {configs.map((config) => (
            <ConfigEditCard key={config.id} config={config} querySetOptions={querySetOptions} />
          ))}
        </div>
      )}
    </div>
  );
}
