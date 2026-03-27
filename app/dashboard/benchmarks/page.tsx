import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BenchmarkDomainForm } from '@/components/benchmark-domain-form';
import { BenchmarkQuerySetForm } from '@/components/benchmark-query-set-form';
import { BenchmarkTriggerForm } from '@/components/benchmark-trigger-form';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { resolveBenchmarkExecutionConfig } from '@/lib/server/benchmark-execution';
import { createBenchmarkAdminData } from '@/lib/server/benchmark-admin-data';
import { requireAdminOrRedirect } from '@/lib/server/require-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    domain?: string;
    querySet?: string;
    model?: string;
    status?: string;
  }>;
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

function buildHref(filters: {
  readonly domain?: string;
  readonly querySet?: string;
  readonly model?: string;
  readonly status?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.domain && filters.domain !== 'all') params.set('domain', filters.domain);
  if (filters.querySet && filters.querySet !== 'all') params.set('querySet', filters.querySet);
  if (filters.model && filters.model !== 'all') params.set('model', filters.model);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const query = params.toString();
  return query ? `/dashboard/benchmarks?${query}` : '/dashboard/benchmarks';
}

export default async function BenchmarksAdminPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const selectedDomain = sp.domain ?? 'all';
  const selectedQuerySet = sp.querySet ?? 'all';
  const selectedModel = sp.model ?? 'all';
  const selectedStatus = sp.status ?? 'all';

  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/benchmarks');
  }

  requireAdminOrRedirect(user.email);

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">Server misconfigured: missing Supabase service role.</p>
      </main>
    );
  }

  const adminDb = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const executionConfig = resolveBenchmarkExecutionConfig(env);
  const benchmarkData = createBenchmarkAdminData(adminDb);

  let runGroups;
  let domainSelectOptions;
  let querySetSelectOptions;
  try {
    [runGroups, domainSelectOptions, querySetSelectOptions] = await Promise.all([
      benchmarkData.getRunGroups({
        domainId: selectedDomain === 'all' ? null : selectedDomain,
        querySetId: selectedQuerySet === 'all' ? null : selectedQuerySet,
        modelId: selectedModel === 'all' ? null : selectedModel,
        status: selectedStatus === 'all' ? null : selectedStatus,
      }),
      benchmarkData.getDomainOptions(),
      benchmarkData.getQuerySetOptions(),
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load benchmark runs.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Benchmarks</h1>
        <p className="mt-4 text-error">{message}</p>
        <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          Apply the benchmark foundation migration before using this page:
          <code className="ml-2">supabase/migrations/012_benchmark_foundation.sql</code>
        </div>
      </main>
    );
  }

  const domainOptions = Array.from(
    new Map(runGroups.map((row) => [row.domain_id, row.display_name ?? row.canonical_domain]))
  );
  const querySetOptions = Array.from(
    new Map(runGroups.map((row) => [row.query_set_id, `${row.query_set_name} · ${row.query_set_version}`]))
  );
  const modelOptions = Array.from(new Set(runGroups.map((row) => row.model_set_version))).sort();
  const statusOptions = Array.from(new Set(runGroups.map((row) => row.status))).sort();

  const totalRuns = runGroups.length;
  const completedRuns = runGroups.filter((row) => row.status === 'completed').length;
  const failedRuns = runGroups.filter((row) => row.status === 'failed').length;
  const coverageValues = runGroups
    .map((row) => row.query_coverage)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  const avgCoverage =
    coverageValues.length > 0
      ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length
      : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Benchmarks
          </h1>
          <p className="mt-1 font-body text-on-surface-variant">
            Internal benchmark runs, query coverage, and citation outcomes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/evals"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Eval analytics
          </Link>
          <Link
            href="/dashboard/attribution"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Attribution
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Account
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Run groups
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">{totalRuns}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Completed
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {completedRuns}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Failed
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">{failedRuns}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Avg query coverage
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(avgCoverage)}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Filters</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={buildHref({ querySet: selectedQuerySet, model: selectedModel, status: selectedStatus })}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedDomain === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
            }`}
          >
            All domains
          </Link>
          {domainOptions.map(([id, label]) => (
            <Link
              key={id}
              href={buildHref({
                domain: id,
                querySet: selectedQuerySet,
                model: selectedModel,
                status: selectedStatus,
              })}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                selectedDomain === id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={buildHref({ domain: selectedDomain, model: selectedModel, status: selectedStatus })}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedQuerySet === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
            }`}
          >
            All query sets
          </Link>
          {querySetOptions.map(([id, label]) => (
            <Link
              key={id}
              href={buildHref({
                domain: selectedDomain,
                querySet: id,
                model: selectedModel,
                status: selectedStatus,
              })}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                selectedQuerySet === id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={buildHref({ domain: selectedDomain, querySet: selectedQuerySet, status: selectedStatus })}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedModel === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
            }`}
          >
            All models
          </Link>
          {modelOptions.map((model) => (
            <Link
              key={model}
              href={buildHref({
                domain: selectedDomain,
                querySet: selectedQuerySet,
                model,
                status: selectedStatus,
              })}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                selectedModel === model
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
              }`}
            >
              {model}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={buildHref({ domain: selectedDomain, querySet: selectedQuerySet, model: selectedModel })}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedStatus === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
            }`}
          >
            All statuses
          </Link>
          {statusOptions.map((status) => (
            <Link
              key={status}
              href={buildHref({
                domain: selectedDomain,
                querySet: selectedQuerySet,
                model: selectedModel,
                status,
              })}
              className={`rounded-xl px-3 py-2 text-sm font-medium capitalize transition ${
                selectedStatus === status
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
              }`}
            >
              {status}
            </Link>
          ))}
        </div>
      </section>

      <BenchmarkDomainForm />
      <BenchmarkQuerySetForm />

      <BenchmarkTriggerForm
        domainOptions={domainSelectOptions}
        querySetOptions={querySetSelectOptions}
        defaultModelId={executionConfig.model}
        liveLaneLabel={
          executionConfig.provider === 'gemini'
            ? `gemini · ${executionConfig.model}`
            : 'stub only'
        }
      />

      <section className="mt-8">
        <h2 className="font-headline text-xl font-bold text-on-background">Recent run groups</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[1040px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Run label</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Query set</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Coverage</th>
                <th className="px-4 py-3 text-right">Citation rate</th>
                <th className="px-4 py-3 text-right">Share of voice</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runGroups.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={10}>
                    No benchmark runs yet. Seed a benchmark and run the internal runner first.
                  </td>
                </tr>
              ) : (
                runGroups.map((row) => (
                  <tr key={row.id} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">{formatTs(row.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-on-background">{row.label}</td>
                    <td className="px-4 py-3">{row.display_name ?? row.canonical_domain}</td>
                    <td className="px-4 py-3">
                      {row.query_set_name} <span className="text-on-surface-variant">· {row.query_set_version}</span>
                    </td>
                    <td className="px-4 py-3">{row.model_set_version}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.query_coverage)}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.citation_rate)}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.share_of_voice)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/dashboard/benchmarks/${row.id}`}
                          className="font-medium text-tertiary hover:underline"
                        >
                          View detail
                        </Link>
                        <Link
                          href={`/dashboard/benchmarks/domains/${row.domain_id}`}
                          className="font-medium text-on-surface-variant hover:text-primary"
                        >
                          Domain history
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
