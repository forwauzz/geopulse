import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createBenchmarkRepository } from '@/lib/server/benchmark-repository';
import type { ClientBenchmarkConfigRow } from '@/lib/server/benchmark-repository';
import {
  createClientBenchmarkConfig,
  deleteClientBenchmarkConfig,
  generateQuerySetForConfig,
} from './actions';

export const dynamic = 'force-dynamic';

function ConfigCard({ config }: { config: ClientBenchmarkConfigRow }) {
  const owner = config.startup_workspace_id
    ? `startup: ${config.startup_workspace_id}`
    : `agency: ${config.agency_account_id}`;

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-2 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-on-surface">{config.topic} · {config.location}</p>
          <p className="text-on-surface-variant text-xs mt-0.5">{owner}</p>
          <p className="text-on-surface-variant text-xs">domain: {config.benchmark_domain_id}</p>
        </div>
        <div className="text-right text-xs text-on-surface-variant shrink-0">
          <p>{config.cadence}</p>
          <p>{config.platforms_enabled.join(', ')}</p>
        </div>
      </div>

      {config.competitor_list.length > 0 && (
        <p className="text-xs text-on-surface-variant">
          Competitors: {config.competitor_list.join(', ')}
        </p>
      )}

      {config.report_email && (
        <p className="text-xs text-on-surface-variant">Email: {config.report_email}</p>
      )}

      {config.query_set_id ? (
        <p className="text-xs text-on-surface-variant">Query set: <code className="text-xs">{config.query_set_id}</code></p>
      ) : (
        <form action={generateQuerySetForConfig} className="pt-1 space-y-2 border-t border-outline-variant/20">
          <p className="text-xs font-medium text-warning pt-2">No query set — generate one:</p>
          <input type="hidden" name="config_id" value={config.id} />
          <input type="hidden" name="topic" value={config.topic} />
          <input type="hidden" name="location" value={config.location} />
          <div className="flex gap-2 items-center">
            <label className="text-xs text-on-surface-variant">Brand name (optional)</label>
            <input name="brand_name" type="text" placeholder="e.g. Elite Physio" className="flex-1 rounded border border-outline-variant/40 bg-surface px-2 py-0.5 text-xs" />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-on-surface-variant">Prompts</label>
            <select name="prompt_count" className="rounded border border-outline-variant/40 bg-surface px-2 py-0.5 text-xs">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="15">15</option>
            </select>
            <button type="submit" className="rounded bg-secondary px-3 py-0.5 text-xs font-medium text-on-secondary hover:opacity-90">
              Generate with Claude
            </button>
          </div>
        </form>
      )}

      <form action={deleteClientBenchmarkConfig} className="pt-1">
        <input type="hidden" name="id" value={config.id} />
        <button
          type="submit"
          className="text-xs text-error hover:underline"
          onClick={(e) => {
            if (!confirm('Delete this GEO Performance config? This cannot be undone.')) {
              e.preventDefault();
            }
          }}
        >
          Delete config
        </button>
      </form>
    </div>
  );
}

function CreateConfigForm() {
  return (
    <form action={createClientBenchmarkConfig} className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <h2 className="font-medium text-on-surface">Enroll a client</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Startup workspace ID</label>
          <input name="startup_workspace_id" type="text" placeholder="uuid or blank" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Agency account ID</label>
          <input name="agency_account_id" type="text" placeholder="uuid or blank" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-on-surface-variant mb-1">Benchmark domain ID *</label>
        <input name="benchmark_domain_id" type="text" required placeholder="uuid" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Topic *</label>
          <input name="topic" type="text" required placeholder="e.g. Vestibular Rehabilitation" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Location *</label>
          <input name="location" type="text" required placeholder="e.g. Vancouver" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Query set ID (optional)</label>
          <input name="query_set_id" type="text" placeholder="uuid or blank" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Report email (optional)</label>
          <input name="report_email" type="email" placeholder="client@example.com" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-on-surface-variant mb-1">Cadence *</label>
        <select name="cadence" defaultValue="monthly" className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm">
          <option value="monthly">Monthly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      <div>
        <p className="text-xs text-on-surface-variant mb-1">Platforms *</p>
        <div className="flex gap-4">
          {(['chatgpt', 'gemini', 'perplexity'] as const).map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={`platform_${p}`} defaultChecked />
              {p}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-on-surface-variant mb-1">Competitors (one per line)</label>
        <textarea
          name="competitor_list"
          rows={3}
          placeholder={'physio.ca\nVestibular Rehab Center\nacupuncture.com'}
          className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm font-mono"
        />
      </div>

      <button
        type="submit"
        className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:opacity-90"
      >
        Enroll client
      </button>
    </form>
  );
}

export default async function GeoPerformanceAdminPage() {
  const adminContext = await loadAdminPageContext('/admin');
  if (!adminContext.ok) {
    return <p className="text-sm text-error">{adminContext.message}</p>;
  }

  try {
    const repo = createBenchmarkRepository(adminContext.adminDb);

    // fetch all configs via a raw admin query (no workspace filter = full list)
    const { data: allConfigs, error } = await adminContext.adminDb
      .from('client_benchmark_configs')
      .select(
        'id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at'
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const configs = (allConfigs ?? []) as ClientBenchmarkConfigRow[];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-headline text-3xl font-bold text-on-background">GEO Performance Monitoring</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {configs.length} client config{configs.length !== 1 ? 's' : ''} enrolled
          </p>
        </div>

        <CreateConfigForm />

        {configs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wide">Enrolled clients</h2>
            {configs.map((config) => (
              <ConfigCard key={config.id} config={config} />
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load GEO Performance configs.';
    const missingTable = /client_benchmark_configs|relation .* does not exist|column .* does not exist|schema cache/i.test(message);
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">GEO Performance Monitoring</h1>
        <p className="text-sm text-error">{message}</p>
        {missingTable && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply the migration before using this page:{' '}
            <code>supabase/migrations/043_client_benchmark_configs.sql</code>
          </div>
        )}
      </div>
    );
  }
}
