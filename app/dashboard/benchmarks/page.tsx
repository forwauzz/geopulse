import { BenchmarkOverviewView } from '@/components/benchmark-overview-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createBenchmarkAdminData } from '@/lib/server/benchmark-admin-data';
import { resolveBenchmarkExecutionConfig } from '@/lib/server/benchmark-execution';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    domain?: string;
    querySet?: string;
    model?: string;
    status?: string;
  }>;
};

export default async function BenchmarksAdminPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const selectedDomain = sp.domain ?? 'all';
  const selectedQuerySet = sp.querySet ?? 'all';
  const selectedModel = sp.model ?? 'all';
  const selectedStatus = sp.status ?? 'all';

  const adminContext = await loadAdminPageContext('/dashboard/benchmarks');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const executionConfig = resolveBenchmarkExecutionConfig(adminContext.env);
  const benchmarkData = createBenchmarkAdminData(adminContext.adminDb);

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
    const message = error instanceof Error ? error.message : 'Could not load benchmark runs.';
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

  return (
    <BenchmarkOverviewView
      runGroups={runGroups}
      domainSelectOptions={domainSelectOptions}
      querySetSelectOptions={querySetSelectOptions}
      defaultModelId={executionConfig.model}
      liveLaneLabel={
        executionConfig.provider === 'gemini'
          ? `gemini · ${executionConfig.model}`
          : 'stub only'
      }
      selectedDomain={selectedDomain}
      selectedQuerySet={selectedQuerySet}
      selectedModel={selectedModel}
      selectedStatus={selectedStatus}
    />
  );
}
