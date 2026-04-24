'use client';

import { useActionState } from 'react';
import type {
  GpmConfigAdminRow,
  GpmDomainOption,
  GpmQuerySetOption,
  GpmWorkspaceOption,
  GpmAgencyOption,
} from '@/lib/server/geo-performance-admin-data';
import {
  createGpmConfigAction,
  updateGpmCompetitorListAction,
  deleteGpmConfigAction,
  type GpmConfigActionState,
} from '@/app/dashboard/benchmarks/gpm-configs/actions';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

function ownerLabel(config: GpmConfigAdminRow): string {
  if (config.startup_workspace_id) return `startup:${config.startup_workspace_id.slice(0, 8)}`;
  if (config.agency_account_id) return `agency:${config.agency_account_id.slice(0, 8)}`;
  return '—';
}

// ── Competitor edit form ──────────────────────────────────────────────────────

function CompetitorEditForm({ config }: { config: GpmConfigAdminRow }) {
  const [state, formAction, pending] = useActionState<GpmConfigActionState | null, FormData>(
    updateGpmCompetitorListAction,
    null
  );

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-on-surface-variant hover:text-on-surface">
        Edit competitors ({config.competitor_list.length})
      </summary>
      <form action={formAction} className="mt-2 space-y-2">
        <input type="hidden" name="configId" value={config.id} />
        <textarea
          name="competitorListText"
          defaultValue={config.competitor_list.join('\n')}
          rows={Math.max(3, Math.min(config.competitor_list.length + 1, 8))}
          placeholder="One domain per line, e.g.&#10;competitor.com&#10;rival.ca"
          className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-on-surface-variant">One domain per line or comma-separated. Max 50.</p>
        {state && (
          <p className={`text-sm ${state.ok ? 'text-success' : 'text-error'}`}>{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save competitors'}
        </button>
      </form>
    </details>
  );
}

// ── Delete form ───────────────────────────────────────────────────────────────

function DeleteConfigForm({ configId }: { configId: string }) {
  const [state, formAction, pending] = useActionState<GpmConfigActionState | null, FormData>(
    deleteGpmConfigAction,
    null
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm('Delete this GPM config? This cannot be undone.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="configId" value={configId} />
      {state && !state.ok && <p className="text-xs text-error">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded px-2 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
    </form>
  );
}

// ── Create config form ────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = ['chatgpt', 'gemini', 'perplexity'] as const;
const CADENCE_OPTIONS = ['monthly', 'biweekly', 'weekly'] as const;

function CreateConfigForm({
  domainOptions,
  querySetOptions,
  workspaceOptions,
  agencyOptions,
}: {
  domainOptions: GpmDomainOption[];
  querySetOptions: GpmQuerySetOption[];
  workspaceOptions: GpmWorkspaceOption[];
  agencyOptions: GpmAgencyOption[];
}) {
  const [state, formAction, pending] = useActionState<GpmConfigActionState | null, FormData>(
    createGpmConfigAction,
    null
  );

  return (
    <details className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <summary className="cursor-pointer font-medium text-on-surface">Add GPM Config</summary>
      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Domain */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Domain *</label>
          <select
            name="benchmarkDomainId"
            required
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          >
            <option value="">Select domain…</option>
            {domainOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName ?? d.canonicalDomain}
              </option>
            ))}
          </select>
        </div>

        {/* Query Set */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Query set</label>
          <select
            name="querySetId"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          >
            <option value="">None</option>
            {querySetOptions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} v{q.version}
              </option>
            ))}
          </select>
        </div>

        {/* Topic */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Topic *</label>
          <input
            name="topic"
            required
            placeholder="e.g. Vestibular Rehabilitation"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          />
        </div>

        {/* Location */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Location *</label>
          <input
            name="location"
            required
            placeholder="e.g. Vancouver"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          />
        </div>

        {/* Cadence */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Cadence *</label>
          <select
            name="cadence"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          >
            {CADENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Platforms (hidden comma-joined value) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Platforms *</label>
          <div className="flex gap-3">
            {PLATFORM_OPTIONS.map((p) => (
              <label key={p} className="flex items-center gap-1 text-sm text-on-surface">
                <input type="checkbox" name={`platform_${p}`} value={p} defaultChecked />
                {PLATFORM_LABELS[p]}
              </label>
            ))}
          </div>
          {/* Collect checked platforms into a single comma-joined field via JS */}
          <PlatformHiddenInput />
        </div>

        {/* Owner — mutually exclusive; leave the other blank */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Startup workspace</label>
          <select
            name="startupWorkspaceId"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          >
            <option value="">— None (agency config) —</option>
            {workspaceOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Agency account</label>
          <select
            name="agencyAccountId"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          >
            <option value="">— None (startup config) —</option>
            {agencyOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-on-surface-variant">Select exactly one of startup or agency.</p>
        </div>

        {/* Report email */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-variant">Report email</label>
          <input
            name="reportEmail"
            type="email"
            placeholder="client@example.com"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
          />
        </div>

        {/* Competitor list */}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-on-surface-variant">Competitors (one per line)</label>
          <textarea
            name="competitorListText"
            rows={3}
            placeholder="competitor.com&#10;rival.ca"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 font-mono text-sm text-on-surface"
          />
        </div>

        {state && (
          <p className={`sm:col-span-2 text-sm ${state.ok ? 'text-success' : 'text-error'}`}>
            {state.message}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create config'}
          </button>
        </div>
      </form>
    </details>
  );
}

// Collects checked platform checkboxes into the hidden `platforms` field on submit
function PlatformHiddenInput() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || !form.querySelector('[name="platform_chatgpt"]')) return;
    var checked = Array.from(form.querySelectorAll('[name^="platform_"]:checked')).map(function(el){return el.value;});
    var hidden = form.querySelector('[name="platforms"]');
    if (!hidden) { hidden = document.createElement('input'); hidden.type='hidden'; hidden.name='platforms'; form.appendChild(hidden); }
    hidden.value = checked.join(',');
  });
})();
`,
      }}
    />
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function GpmConfigsAdminView({
  configs,
  domainOptions,
  querySetOptions,
  workspaceOptions,
  agencyOptions,
}: {
  configs: GpmConfigAdminRow[];
  domainOptions: GpmDomainOption[];
  querySetOptions: GpmQuerySetOption[];
  workspaceOptions: GpmWorkspaceOption[];
  agencyOptions: GpmAgencyOption[];
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <div>
        <h1 className="font-headline text-3xl font-bold text-on-background">GPM Configs</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          GEO Performance Monitoring — client benchmark configurations and competitor rosters
        </p>
      </div>

      <CreateConfigForm
        domainOptions={domainOptions}
        querySetOptions={querySetOptions}
        workspaceOptions={workspaceOptions}
        agencyOptions={agencyOptions}
      />

      {configs.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No GPM configs found.</p>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-on-surface">
                    {config.domain_display ?? config.domain_canonical}
                    <span className="ml-2 text-sm text-on-surface-variant">
                      {config.domain_canonical}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    {config.topic}, {config.location} · {config.cadence} ·{' '}
                    {config.platforms_enabled
                      .map((p) => PLATFORM_LABELS[p] ?? p)
                      .join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {ownerLabel(config)}
                    {config.report_email ? ` · ${config.report_email}` : ''}
                    {config.query_set_id ? '' : ' · no query set'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`/dashboard/benchmarks/gpm-configs/${config.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Reports &amp; dry run →
                  </a>
                  <DeleteConfigForm configId={config.id} />
                </div>
              </div>
              <CompetitorEditForm config={config} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
