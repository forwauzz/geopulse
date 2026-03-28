import type { ReactNode } from 'react';
import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    site?: string;
    framework?: string;
  }>;
};

type ReportEvalRow = {
  id: string;
  rubric_version: string;
  generator_version: string;
  overall_score: number | null;
  created_at: string;
  framework: string | null;
  domain: string | null;
  site_url: string | null;
  prompt_set_name: string | null;
  metrics: Record<string, unknown> | null;
};

type RetrievalEvalRow = {
  id: string;
  rubric_version: string;
  generator_version: string;
  overall_score: number | null;
  created_at: string;
  framework: string | null;
  domain: string | null;
  site_url: string | null;
  prompt_set_name: string;
  metrics: Record<string, unknown> | null;
};

type CombinedEvalRow = {
  id: string;
  sourceTable: 'report_eval_runs' | 'retrieval_eval_runs';
  rubricVersion: string;
  generatorVersion: string;
  overallScore: number | null;
  createdAt: string;
  framework: string;
  domain: string;
  siteUrl: string | null;
  promptSetName: string;
  metrics: Record<string, unknown>;
};

const FRAMEWORKS = [
  { id: 'all', label: 'All evals' },
  { id: 'promptfoo_report', label: 'Promptfoo Report' },
  { id: 'promptfoo_retrieval', label: 'Promptfoo Retrieval' },
  { id: 'deterministic_retrieval', label: 'Deterministic Retrieval' },
  { id: 'ragas_retrieval', label: 'RAGAS' },
] as const;

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFrameworkLabel(value: string): string {
  const known = FRAMEWORKS.find((item) => item.id === value);
  if (known) return known.label;
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toMetricNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function formatMetricValue(value: number | null, kind: 'count' | 'percent'): string {
  if (value == null) return '\u2014';
  if (kind === 'percent') return `${Math.round(value * 100)}%`;
  return String(value);
}

function buildHref(site: string, framework: string): string {
  const params = new URLSearchParams();
  if (site && site !== 'all') params.set('site', site);
  if (framework && framework !== 'all') params.set('framework', framework);
  const query = params.toString();
  return query ? `/dashboard/evals?${query}` : '/dashboard/evals';
}

function metricSeries(rows: readonly CombinedEvalRow[], key: string): number[] {
  return rows
    .slice()
    .reverse()
    .map((row) => toMetricNumber(row.metrics[key]))
    .filter((value): value is number => value != null);
}

function TrendSvg(rows: readonly CombinedEvalRow[], metricKey = 'overall'): ReactNode {
  const values =
    metricKey === 'overall'
      ? rows
          .slice()
          .reverse()
          .map((row) => row.overallScore)
          .filter((score): score is number => typeof score === 'number' && !Number.isNaN(score))
      : metricSeries(rows, metricKey);
  if (values.length < 2) {
    return (
      <p className="font-body text-sm text-on-surface-variant">
        Run the same suite for the same site at least twice to see a trend line.
      </p>
    );
  }

  const w = 360;
  const h = 120;
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
      className="h-32 w-full max-w-md text-primary"
      role="img"
      aria-label={`${metricKey} over time`}
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

function combineRuns(
  reportRuns: readonly ReportEvalRow[],
  retrievalRuns: readonly RetrievalEvalRow[]
): CombinedEvalRow[] {
  const reportRows = reportRuns.map((row) => ({
    id: row.id,
    sourceTable: 'report_eval_runs' as const,
    rubricVersion: row.rubric_version,
    generatorVersion: row.generator_version,
    overallScore: row.overall_score,
    createdAt: row.created_at,
    framework: row.framework ?? 'report_smoke',
    domain: row.domain ?? 'unknown',
    siteUrl: row.site_url,
    promptSetName: row.prompt_set_name ?? 'default',
    metrics: row.metrics ?? {},
  }));

  const retrievalRowsMapped = retrievalRuns.map((row) => ({
    id: row.id,
    sourceTable: 'retrieval_eval_runs' as const,
    rubricVersion: row.rubric_version,
    generatorVersion: row.generator_version,
    overallScore: row.overall_score,
    createdAt: row.created_at,
    framework: row.framework ?? 'retrieval_foundation',
    domain: row.domain ?? 'unknown',
    siteUrl: row.site_url,
    promptSetName: row.prompt_set_name ?? 'default',
    metrics: row.metrics ?? {},
  }));

  return [...reportRows, ...retrievalRowsMapped].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export default async function ReportEvalsAdminPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const selectedSite = sp.site ?? 'all';
  const selectedFramework = sp.framework ?? 'all';

  const adminContext = await loadAdminPageContext('/dashboard/evals');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const adminDb = adminContext.adminDb;

  const [{ data: reportRuns, error: reportError }, { data: retrievalRuns, error: retrievalError }] =
    await Promise.all([
      adminDb
        .from('report_eval_runs')
        .select(
          'id,rubric_version,generator_version,overall_score,created_at,framework,domain,site_url,prompt_set_name,metrics'
        )
        .order('created_at', { ascending: false })
        .limit(200),
      adminDb
        .from('retrieval_eval_runs')
        .select(
          'id,rubric_version,generator_version,overall_score,created_at,framework,domain,site_url,prompt_set_name,metrics'
        )
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

  if (reportError || retrievalError) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">
          Could not load eval runs. Apply the latest eval migrations before using this page.
        </p>
      </main>
    );
  }

  const allRuns = combineRuns(
    (reportRuns ?? []) as ReportEvalRow[],
    (retrievalRuns ?? []) as RetrievalEvalRow[]
  );

  const siteOptions = Array.from(new Set(allRuns.map((row) => row.domain))).sort();
  const filteredRuns = allRuns.filter((row) => {
    const siteMatch = selectedSite === 'all' || row.domain === selectedSite;
    const frameworkMatch = selectedFramework === 'all' || row.framework === selectedFramework;
    return siteMatch && frameworkMatch;
  });

  const latest = filteredRuns[0] ?? null;
  const previousComparable =
    latest == null
      ? null
      : filteredRuns.find(
          (row) =>
            row.id !== latest.id &&
            row.domain === latest.domain &&
            row.framework === latest.framework &&
            row.promptSetName === latest.promptSetName
        ) ?? null;
  const delta =
    latest?.overallScore != null && previousComparable?.overallScore != null
      ? latest.overallScore - previousComparable.overallScore
      : null;

  const passRateSeries = metricSeries(filteredRuns, 'pass_rate');
  const unsupportedClaimSeries = metricSeries(filteredRuns, 'unsupported_claim_total');
  const latestPassRate = toMetricNumber(latest?.metrics['pass_rate']);
  const latestUnsupportedClaims = toMetricNumber(latest?.metrics['unsupported_claim_total']);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Eval analytics</h1>
          <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
            Site-level history for Promptfoo and retrieval evaluation runs. Use the same site key repeatedly to audit
            quality improvements over time.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          Back to dashboard
        </Link>
      </div>

      <section className="mt-8 rounded-2xl bg-surface-container-lowest p-6 shadow-float">
        <div className="flex flex-wrap gap-3">
          <Link
            href={buildHref('all', selectedFramework)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              selectedSite === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-background'
            }`}
          >
            All sites
          </Link>
          {siteOptions.map((site) => (
            <Link
              key={site}
              href={buildHref(site, selectedFramework)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedSite === site
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-background'
              }`}
            >
              {site}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {FRAMEWORKS.map((framework) => (
            <Link
              key={framework.id}
              href={buildHref(selectedSite, framework.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedFramework === framework.id
                  ? 'bg-tertiary text-on-primary'
                  : 'bg-surface-container-high text-on-background'
              }`}
            >
              {framework.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Runs</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">{filteredRuns.length}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Latest score</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {latest?.overallScore != null ? `${latest.overallScore}/100` : '\u2014'}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Delta vs previous</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {delta != null ? `${delta > 0 ? '+' : ''}${delta}` : '\u2014'}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Latest pass rate</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {formatMetricValue(latestPassRate, 'percent')}
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Overall trend</h2>
          <div className="mt-4">{TrendSvg(filteredRuns, 'overall')}</div>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Metric snapshot</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Pass rate</p>
              <p className="mt-2 text-2xl font-semibold text-on-background">
                {formatMetricValue(latestPassRate, 'percent')}
              </p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Historical points: {passRateSeries.length > 0 ? String(passRateSeries.length) : '\u2014'}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Unsupported claims</p>
              <p className="mt-2 text-2xl font-semibold text-on-background">
                {formatMetricValue(latestUnsupportedClaims, 'count')}
              </p>
              <p className="mt-2 text-xs text-on-surface-variant">
                Historical points: {unsupportedClaimSeries.length > 0 ? String(unsupportedClaimSeries.length) : '\u2014'}
              </p>
            </div>
          </div>
          {selectedFramework === 'ragas_retrieval' && filteredRuns.length === 0 ? (
            <p className="mt-4 text-sm text-on-surface-variant">
              No RAGAS runs yet. The repo still treats RAGAS as an offline, admin-only future slice.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-lg font-semibold text-on-background">Recent runs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/15">
          <table className="w-full min-w-[920px] border-collapse text-left font-body text-sm">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-low">
                <th className="px-4 py-3 font-semibold text-on-background">When</th>
                <th className="px-4 py-3 font-semibold text-on-background">Site</th>
                <th className="px-4 py-3 font-semibold text-on-background">Framework</th>
                <th className="px-4 py-3 font-semibold text-on-background">Prompt set</th>
                <th className="px-4 py-3 font-semibold text-on-background">Rubric</th>
                <th className="px-4 py-3 font-semibold text-on-background">Generator</th>
                <th className="px-4 py-3 font-semibold text-on-background">Score</th>
                <th className="px-4 py-3 font-semibold text-on-background">Tests</th>
                <th className="px-4 py-3 font-semibold text-on-background">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-on-surface-variant">
                    No eval runs match this filter. Use{' '}
                    <code className="rounded bg-surface-container-high px-1">npm run eval:promptfoo:write:report</code>{' '}
                    or{' '}
                    <code className="rounded bg-surface-container-high px-1">
                      npm run eval:promptfoo:write:retrieval
                    </code>{' '}
                    after applying the latest eval migration.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((row) => (
                  <tr key={`${row.sourceTable}-${row.id}`} className="border-b border-outline-variant/10">
                    <td className="px-4 py-3 text-on-surface-variant">{formatTs(row.createdAt)}</td>
                    <td className="px-4 py-3 text-on-background">
                      <div>{row.domain}</div>
                      {row.siteUrl ? (
                        <div className="mt-1 text-xs text-on-surface-variant">{row.siteUrl}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-on-background">{formatFrameworkLabel(row.framework)}</td>
                    <td className="px-4 py-3 text-on-background">{row.promptSetName}</td>
                    <td className="px-4 py-3 text-on-background">{row.rubricVersion}</td>
                    <td className="px-4 py-3 text-on-background">{row.generatorVersion}</td>
                    <td className="px-4 py-3 font-medium text-on-background">
                      {row.overallScore != null ? String(row.overallScore) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {String(row.metrics['passed_tests'] ?? '\u2014')}/{String(row.metrics['total_tests'] ?? '\u2014')}
                    </td>
                    <td className="px-4 py-3 text-on-background">
                      {row.sourceTable === 'retrieval_eval_runs' ? (
                        <Link
                          href={`/dashboard/evals/retrieval/${row.id}`}
                          className="font-medium text-tertiary hover:underline"
                        >
                          View detail
                        </Link>
                      ) : (
                        <span className="text-on-surface-variant">\u2014</span>
                      )}
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
