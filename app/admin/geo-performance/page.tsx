import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import {
  createGpmAdminData,
  type GpmAgencyOption,
  type GpmConfigAdminRow,
  type GpmDomainOption,
  type GpmQuerySetOption,
  type GpmWorkspaceOption,
} from '@/lib/server/geo-performance-admin-data';
import {
  createClientBenchmarkConfig,
  deleteClientBenchmarkConfig,
  generateQuerySetForConfig,
} from './actions';

type WorkspaceNameMap = ReadonlyMap<string, string>;
type DomainNameMap = ReadonlyMap<string, string>;
type QuerySetNameMap = ReadonlyMap<string, string>;

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export const dynamic = 'force-dynamic';

function ConfigCard({
  config,
  workspaceNames,
  domainNames,
  querySetNames,
}: {
  config: GpmConfigAdminRow;
  workspaceNames: WorkspaceNameMap;
  domainNames: DomainNameMap;
  querySetNames: QuerySetNameMap;
}) {
  const rawOwner = config.startup_workspace_id ?? config.agency_account_id ?? '-';
  const ownerName = workspaceNames.get(rawOwner) ?? rawOwner;
  const ownerKind = config.startup_workspace_id ? 'startup' : 'agency';
  const owner = `${ownerKind}: ${ownerName}`;
  const domainLabel =
    config.domain_display ?? domainNames.get(config.benchmark_domain_id) ?? config.domain_canonical;
  const querySetLabel = config.query_set_id
    ? querySetNames.get(config.query_set_id) ?? config.query_set_id
    : null;

  return (
    <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-on-surface">
            {config.topic} · {config.location}
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">{owner}</p>
          <p className="text-xs text-on-surface-variant">
            domain: {domainLabel}
            {config.domain_canonical ? ` · ${config.domain_canonical}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-on-surface-variant">
          <p>{config.cadence}</p>
          <p>
            {config.platforms_enabled.map((platform) => PLATFORM_LABELS[platform] ?? platform).join(', ')}
          </p>
        </div>
      </div>

      {config.competitor_list.length > 0 ? (
        <p className="text-xs text-on-surface-variant">
          Competitors: {config.competitor_list.join(', ')}
        </p>
      ) : null}

      {config.report_email ? (
        <p className="text-xs text-on-surface-variant">Email: {config.report_email}</p>
      ) : null}

      {querySetLabel ? (
        <p className="text-xs text-on-surface-variant">
          Query set: <span className="font-mono text-xs">{querySetLabel}</span>
        </p>
      ) : (
        <form
          action={generateQuerySetForConfig}
          className="space-y-2 border-t border-outline-variant/20 pt-1"
        >
          <p className="pt-2 text-xs font-medium text-warning">No query set - generate one:</p>
          <input type="hidden" name="config_id" value={config.id} />
          <input type="hidden" name="topic" value={config.topic} />
          <input type="hidden" name="location" value={config.location} />
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant">Brand name (optional)</label>
            <input
              name="brand_name"
              type="text"
              placeholder="e.g. Elite Physio"
              className="flex-1 rounded border border-outline-variant/40 bg-surface px-2 py-0.5 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant">Prompts</label>
            <select
              name="prompt_count"
              defaultValue="10"
              className="rounded border border-outline-variant/40 bg-surface px-2 py-0.5 text-xs"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
            </select>
            <button
              type="submit"
              className="rounded bg-secondary px-3 py-0.5 text-xs font-medium text-on-secondary hover:opacity-90"
            >
              Generate with Claude
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <a
          href={`/dashboard/benchmarks/gpm-configs/${config.id}`}
          className="text-xs text-primary hover:underline"
        >
          Reports and dry run →
        </a>
        <form action={deleteClientBenchmarkConfig}>
          <input type="hidden" name="id" value={config.id} />
          <button type="submit" className="text-xs text-error hover:underline">
            Delete config
          </button>
        </form>
      </div>
    </div>
  );
}

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
  return (
    <form
      action={createClientBenchmarkConfig}
      className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4"
    >
      <h2 className="font-medium text-on-surface">Enroll a client</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Startup workspace</label>
          <select
            name="startup_workspace_id"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          >
            <option value="">- None (agency config) -</option>
            {workspaceOptions.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Agency account</label>
          <select
            name="agency_account_id"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          >
            <option value="">- None (startup config) -</option>
            {agencyOptions.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">Benchmark domain *</label>
        <select
          name="benchmark_domain_id"
          required
          className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
        >
          <option value="">Select domain...</option>
          {domainOptions.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.displayName ?? domain.canonicalDomain}
              {domain.displayName ? ` · ${domain.canonicalDomain}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Topic *</label>
          <input
            name="topic"
            type="text"
            required
            placeholder="e.g. Vestibular Rehabilitation"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Location *</label>
          <input
            name="location"
            type="text"
            required
            placeholder="e.g. Vancouver"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Query set (optional)</label>
          <select
            name="query_set_id"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {querySetOptions.map((querySet) => (
              <option key={querySet.id} value={querySet.id}>
                {querySet.name} v{querySet.version}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant">Report email (optional)</label>
          <input
            name="report_email"
            type="email"
            placeholder="client@example.com"
            className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">Cadence *</label>
        <select
          name="cadence"
          defaultValue="monthly"
          className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 text-sm"
        >
          <option value="monthly">Monthly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      <div>
        <p className="mb-1 text-xs text-on-surface-variant">Platforms *</p>
        <div className="flex gap-4">
          {(['chatgpt', 'gemini', 'perplexity'] as const).map((platform) => (
            <label key={platform} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={`platform_${platform}`} defaultChecked />
              {PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">Competitors (one per line)</label>
        <textarea
          name="competitor_list"
          rows={3}
          placeholder={'physio.ca\nvestibularrehab.example\nacupuncture.com'}
          className="w-full rounded border border-outline-variant/40 bg-surface px-2 py-1 font-mono text-sm"
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
    const gpmData = createGpmAdminData(adminContext.adminDb);
    const [configs, domainOptions, querySetOptions, workspaceOptions, agencyOptions] =
      await Promise.all([
        gpmData.listAllConfigs(),
        gpmData.getDomainOptions(),
        gpmData.getQuerySetOptions(),
        gpmData.getStartupWorkspaceOptions(),
        gpmData.getAgencyAccountOptions(),
      ]);

    const startupIds = configs.map((config) => config.startup_workspace_id).filter(Boolean) as string[];
    const agencyIds = configs.map((config) => config.agency_account_id).filter(Boolean) as string[];
    const workspaceNames = new Map<string, string>();
    const domainNames = new Map<string, string>(
      domainOptions.map((domain) => [domain.id, domain.displayName ?? domain.canonicalDomain])
    );
    const querySetNames = new Map<string, string>(
      querySetOptions.map((querySet) => [querySet.id, `${querySet.name} v${querySet.version}`])
    );

    if (startupIds.length > 0) {
      const { data: workspaces } = await adminContext.adminDb
        .from('startup_workspaces')
        .select('id,name')
        .in('id', startupIds);
      for (const workspace of (workspaces ?? []) as { id: string; name: string }[]) {
        workspaceNames.set(workspace.id, workspace.name);
      }
    }

    if (agencyIds.length > 0) {
      const { data: agencies } = await adminContext.adminDb
        .from('agency_accounts')
        .select('id,name')
        .in('id', agencyIds);
      for (const agency of (agencies ?? []) as { id: string; name: string }[]) {
        workspaceNames.set(agency.id, agency.name);
      }
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-headline text-3xl font-bold text-on-background">
            GEO Performance Monitoring
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {configs.length} client config{configs.length !== 1 ? 's' : ''} enrolled
          </p>
        </div>

        <CreateConfigForm
          domainOptions={domainOptions}
          querySetOptions={querySetOptions}
          workspaceOptions={workspaceOptions}
          agencyOptions={agencyOptions}
        />

        {configs.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-on-surface-variant">
              Enrolled clients
            </h2>
            {configs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                workspaceNames={workspaceNames}
                domainNames={domainNames}
                querySetNames={querySetNames}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  } catch (error) {
    let message = 'Could not load GEO Performance configs.';
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      const parts = [e['message'], e['details'], e['hint']].filter(
        (part): part is string => typeof part === 'string' && part.trim().length > 0
      );
      if (parts.length > 0) message = parts.join(' | ');
    }
    const missingTable =
      /client_benchmark_configs|benchmark_domains|query_sets|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          GEO Performance Monitoring
        </h1>
        <p className="text-sm text-error">{message}</p>
        {missingTable ? (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply the migration before using this page:{' '}
            <code>supabase/migrations/043_client_benchmark_configs.sql</code>
          </div>
        ) : null}
      </div>
    );
  }
}
