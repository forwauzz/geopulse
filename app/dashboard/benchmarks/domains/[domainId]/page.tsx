import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createBenchmarkAdminData } from '@/lib/server/benchmark-admin-data';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ domainId: string }>;
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

function TrendSvg(values: number[], ariaLabel: string) {
  if (values.length < 2) {
    return (
      <p className="font-body text-sm text-on-surface-variant">
        Run the same benchmark domain more than once to see a trend line.
      </p>
    );
  }

  const w = 320;
  const h = 110;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((value, index) => {
      const x = pad + (index / Math.max(1, values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((value - min) / span) * (h - pad * 2);
      return `${String(x)},${String(y)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      className="h-28 w-full max-w-sm text-primary"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

export default async function BenchmarkDomainHistoryPage({ params }: Props) {
  const { domainId } = await params;
  const adminContext = await loadAdminPageContext(`/dashboard/benchmarks/domains/${domainId}`);
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const benchmarkData = createBenchmarkAdminData(adminContext.adminDb);

  let runGroups;
  let history;
  try {
    [runGroups, history] = await Promise.all([
      benchmarkData.getRunGroups({ domainId }),
      benchmarkData.getDomainHistory(domainId),
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load benchmark domain history.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark domain history
        </h1>
        <p className="mt-4 text-error">{message}</p>
      </main>
    );
  }

  const domain = runGroups[0] ?? null;
  if (!domain) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark domain history
        </h1>
        <p className="mt-4 text-on-surface-variant">No benchmark history found for this domain.</p>
      </main>
    );
  }

  const coverageSeries = history
    .slice()
    .reverse()
    .map((point) => point.queryCoverage)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  const citationSeries = history
    .slice()
    .reverse()
    .map((point) => point.citationRate)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  const shareSeries = history
    .slice()
    .reverse()
    .map((point) => point.shareOfVoice)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

  const latest = history[0] ?? null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Benchmark domain history
          </h1>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            {domain.display_name ?? domain.canonical_domain} · {domain.site_url ?? domain.domain}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/benchmarks"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Back to benchmarks
          </Link>
          {latest ? (
            <Link
              href={`/dashboard/benchmarks/${latest.runGroupId}`}
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Latest run detail
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Runs
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {history.length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Latest coverage
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(latest?.queryCoverage)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Latest citation rate
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(latest?.citationRate)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Latest share of voice
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(latest?.shareOfVoice)}
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Coverage trend</h2>
          <div className="mt-4">{TrendSvg(coverageSeries, 'Query coverage over time')}</div>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Citation rate trend</h2>
          <div className="mt-4">{TrendSvg(citationSeries, 'Citation rate over time')}</div>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Share of voice trend</h2>
          <div className="mt-4">{TrendSvg(shareSeries, 'Share of voice over time')}</div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-xl font-bold text-on-background">Run history</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[920px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Run label</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Coverage</th>
                <th className="px-4 py-3 text-right">Citation rate</th>
                <th className="px-4 py-3 text-right">Share of voice</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={8}>
                    No benchmark history exists for this domain.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.runGroupId} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">{formatTs(row.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-on-background">{row.label}</td>
                    <td className="px-4 py-3">{row.modelId}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.queryCoverage)}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.citationRate)}</td>
                    <td className="px-4 py-3 text-right">{toPercent(row.shareOfVoice)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/benchmarks/${row.runGroupId}`}
                        className="font-medium text-tertiary hover:underline"
                      >
                        View detail
                      </Link>
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
