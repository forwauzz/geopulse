import Link from 'next/link';
import { BenchmarkDomainForm } from '@/components/benchmark-domain-form';
import { BenchmarkQuerySetForm } from '@/components/benchmark-query-set-form';
import { BenchmarkTriggerForm } from '@/components/benchmark-trigger-form';
import type { BenchmarkRunListRow, BenchmarkOption } from '@/lib/server/benchmark-admin-data';
import {
  buildBenchmarkOverviewHref,
  formatBenchmarkOverviewPercent,
  formatBenchmarkOverviewTimestamp,
} from '@/lib/server/benchmark-overview';

type BenchmarkOverviewViewProps = {
  readonly runGroups: BenchmarkRunListRow[];
  readonly domainSelectOptions: BenchmarkOption[];
  readonly querySetSelectOptions: BenchmarkOption[];
  readonly defaultModelId: string;
  readonly liveLaneLabel: string;
  readonly selectedDomain: string;
  readonly selectedQuerySet: string;
  readonly selectedModel: string;
  readonly selectedStatus: string;
};

export function BenchmarkOverviewView({
  runGroups,
  domainSelectOptions,
  querySetSelectOptions,
  defaultModelId,
  liveLaneLabel,
  selectedDomain,
  selectedQuerySet,
  selectedModel,
  selectedStatus,
}: BenchmarkOverviewViewProps) {
  const domainOptions = Array.from(
    new Map(runGroups.map((row) => [row.domain_id, row.display_name ?? row.canonical_domain]))
  );
  const querySetOptions = Array.from(
    new Map(
      runGroups.map((row) => [row.query_set_id, `${row.query_set_name} · ${row.query_set_version}`])
    )
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
        <MetricCard label="Run groups" value={String(totalRuns)} />
        <MetricCard label="Completed" value={String(completedRuns)} />
        <MetricCard label="Failed" value={String(failedRuns)} />
        <MetricCard
          label="Avg query coverage"
          value={formatBenchmarkOverviewPercent(avgCoverage)}
        />
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Filters</h2>
        <FilterRow
          allLabel="All domains"
          selectedValue={selectedDomain}
          allHref={buildBenchmarkOverviewHref({
            querySet: selectedQuerySet,
            model: selectedModel,
            status: selectedStatus,
          })}
          items={domainOptions.map(([id, label]) => ({
            key: id,
            label,
            href: buildBenchmarkOverviewHref({
              domain: id,
              querySet: selectedQuerySet,
              model: selectedModel,
              status: selectedStatus,
            }),
          }))}
        />
        <FilterRow
          allLabel="All query sets"
          selectedValue={selectedQuerySet}
          allHref={buildBenchmarkOverviewHref({
            domain: selectedDomain,
            model: selectedModel,
            status: selectedStatus,
          })}
          items={querySetOptions.map(([id, label]) => ({
            key: id,
            label,
            href: buildBenchmarkOverviewHref({
              domain: selectedDomain,
              querySet: id,
              model: selectedModel,
              status: selectedStatus,
            }),
          }))}
          className="mt-3"
        />
        <FilterRow
          allLabel="All models"
          selectedValue={selectedModel}
          allHref={buildBenchmarkOverviewHref({
            domain: selectedDomain,
            querySet: selectedQuerySet,
            status: selectedStatus,
          })}
          items={modelOptions.map((model) => ({
            key: model,
            label: model,
            href: buildBenchmarkOverviewHref({
              domain: selectedDomain,
              querySet: selectedQuerySet,
              model,
              status: selectedStatus,
            }),
          }))}
          className="mt-3"
        />
        <FilterRow
          allLabel="All statuses"
          selectedValue={selectedStatus}
          allHref={buildBenchmarkOverviewHref({
            domain: selectedDomain,
            querySet: selectedQuerySet,
            model: selectedModel,
          })}
          items={statusOptions.map((status) => ({
            key: status,
            label: status,
            href: buildBenchmarkOverviewHref({
              domain: selectedDomain,
              querySet: selectedQuerySet,
              model: selectedModel,
              status,
            }),
            capitalize: true,
          }))}
          className="mt-3"
        />
      </section>

      <BenchmarkDomainForm />
      <BenchmarkQuerySetForm />

      <BenchmarkTriggerForm
        domainOptions={domainSelectOptions}
        querySetOptions={querySetSelectOptions}
        defaultModelId={defaultModelId}
        liveLaneLabel={liveLaneLabel}
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
                    <td className="px-4 py-3">
                      {formatBenchmarkOverviewTimestamp(row.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-on-background">{row.label}</td>
                    <td className="px-4 py-3">{row.display_name ?? row.canonical_domain}</td>
                    <td className="px-4 py-3">
                      {row.query_set_name}{' '}
                      <span className="text-on-surface-variant">· {row.query_set_version}</span>
                    </td>
                    <td className="px-4 py-3">{row.model_set_version}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 text-right">
                      {formatBenchmarkOverviewPercent(row.query_coverage)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatBenchmarkOverviewPercent(row.citation_rate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatBenchmarkOverviewPercent(row.share_of_voice)}
                    </td>
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

function MetricCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
      <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="mt-2 font-headline text-3xl font-bold text-on-background">{value}</p>
    </div>
  );
}

function FilterRow({
  allLabel,
  selectedValue,
  allHref,
  items,
  className,
}: {
  readonly allLabel: string;
  readonly selectedValue: string;
  readonly allHref: string;
  readonly items: ReadonlyArray<{
    key: string;
    label: string;
    href: string;
    capitalize?: boolean;
  }>;
  readonly className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2${className ? ` ${className}` : ' mt-4'}`}>
      <Link
        href={allHref}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
          selectedValue === 'all'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
        }`}
      >
        {allLabel}
      </Link>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            selectedValue === item.key
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-low text-on-background hover:bg-surface-container-high'
          }${item.capitalize ? ' capitalize' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
