import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createBenchmarkAdminData } from '@/lib/server/benchmark-admin-data';
import { requireAdminOrRedirect } from '@/lib/server/require-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ runGroupId: string }>;
};

function formatTs(iso: string | null): string {
  if (!iso) return '\u2014';
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

function toCount(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return String(value);
}

function readResponseBody(metadata: Record<string, unknown>): string | null {
  const value = metadata['response_body'];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export default async function BenchmarkRunGroupDetailPage({ params }: Props) {
  const { runGroupId } = await params;
  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect(`/login?next=/dashboard/benchmarks/${runGroupId}`);
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
  const benchmarkData = createBenchmarkAdminData(adminDb);

  let detail;
  try {
    detail = await benchmarkData.getRunGroupDetail(runGroupId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load benchmark run detail.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark run detail
        </h1>
        <p className="mt-4 text-error">{message}</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark run detail
        </h1>
        <p className="mt-4 text-on-surface-variant">Run group not found.</p>
      </main>
    );
  }

  const { runGroup, queryRuns, citations } = detail;
  const metricDetail = (runGroup.metadata ?? {}) as Record<string, unknown>;
  const completedRuns = queryRuns.filter((row) => row.status === 'completed').length;
  const failedRuns = queryRuns.filter((row) => row.status === 'failed').length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Benchmark run detail
          </h1>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            {runGroup.display_name ?? runGroup.canonical_domain} · {runGroup.query_set_name} ·{' '}
            {runGroup.model_set_version}
          </p>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            {formatTs(runGroup.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/benchmarks"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Back to benchmarks
          </Link>
          <Link
            href={`/dashboard/benchmarks/domains/${runGroup.domain_id}`}
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Domain history
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-5">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Query coverage
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(runGroup.query_coverage)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Citation rate
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(runGroup.citation_rate)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Share of voice
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toPercent(runGroup.share_of_voice)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Completed queries
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {completedRuns}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Failed queries
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">{failedRuns}</p>
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Run metadata</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Run label</p>
            <p className="mt-1 text-sm text-on-background">{runGroup.label}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Status</p>
            <p className="mt-1 text-sm capitalize text-on-background">{runGroup.status}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Site URL</p>
            <p className="mt-1 text-sm text-on-background">{runGroup.site_url ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Notes</p>
            <p className="mt-1 text-sm text-on-background">{runGroup.notes ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Started at</p>
            <p className="mt-1 text-sm text-on-background">{formatTs(runGroup.started_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Completed at</p>
            <p className="mt-1 text-sm text-on-background">{formatTs(runGroup.completed_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Skipped queries</p>
            <p className="mt-1 text-sm text-on-background">
              {toCount(metricDetail['skipped_query_count'])}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Completed queries</p>
            <p className="mt-1 text-sm text-on-background">
              {toCount(metricDetail['completed_query_count'])}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Failed queries</p>
            <p className="mt-1 text-sm text-on-background">
              {toCount(metricDetail['failed_query_count'])}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant">Citation rows</p>
            <p className="mt-1 text-sm text-on-background">{citations.length}</p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-xl font-bold text-on-background">Query runs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[1040px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Query key</th>
                <th className="px-4 py-3">Prompt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Citations</th>
                <th className="px-4 py-3">Response</th>
                <th className="px-4 py-3">Executed</th>
              </tr>
            </thead>
            <tbody>
              {queryRuns.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={6}>
                    No query runs were found for this run group.
                  </td>
                </tr>
              ) : (
                queryRuns.map((row) => (
                  <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                    <td className="px-4 py-3 font-medium text-on-background">{row.query_key}</td>
                    <td className="px-4 py-3">{row.query_text}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 text-right">{row.citation_count}</td>
                    <td className="px-4 py-3">
                      {row.response_text ? (
                        <div className="max-w-md whitespace-pre-wrap break-words text-on-background">
                          {row.response_text}
                        </div>
                      ) : (
                        <div className="max-w-md space-y-2">
                          <div className="text-on-surface-variant">
                            {row.error_message ?? '\u2014'}
                          </div>
                          {readResponseBody(row.response_metadata) ? (
                            <pre className="overflow-x-auto rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-background whitespace-pre-wrap break-words">
                              {readResponseBody(row.response_metadata)}
                            </pre>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatTs(row.executed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-xl font-bold text-on-background">Extracted citations</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[960px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Query run</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3 text-right">Rank</th>
                <th className="px-4 py-3 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {citations.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={6}>
                    No citations were extracted for this run group.
                  </td>
                </tr>
              ) : (
                citations.map((citation) => (
                  <tr key={citation.id} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">{citation.query_run_id}</td>
                    <td className="px-4 py-3">{citation.citation_type}</td>
                    <td className="px-4 py-3">{citation.cited_domain ?? '\u2014'}</td>
                    <td className="px-4 py-3 break-all">{citation.cited_url ?? '\u2014'}</td>
                    <td className="px-4 py-3 text-right">
                      {citation.rank_position ?? '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {typeof citation.confidence === 'number'
                        ? citation.confidence.toFixed(2)
                        : '\u2014'}
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
