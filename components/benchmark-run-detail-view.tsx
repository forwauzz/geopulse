import Link from 'next/link';
import type { BenchmarkRunGroupDetail } from '@/lib/server/benchmark-admin-data';
import {
  formatBenchmarkCount,
  formatBenchmarkPercent,
  formatBenchmarkRunTimestamp,
  readBenchmarkGroundingEvidence,
  readBenchmarkResponseBody,
} from '@/lib/server/benchmark-run-detail';

type BenchmarkRunDetailViewProps = {
  readonly detail: BenchmarkRunGroupDetail;
};

export function BenchmarkRunDetailView({ detail }: BenchmarkRunDetailViewProps) {
  const { runGroup, queryRuns, citations } = detail;
  const metricDetail = (runGroup.metadata ?? {}) as Record<string, unknown>;
  const groundingEvidence = readBenchmarkGroundingEvidence(metricDetail);
  const completedRuns = queryRuns.filter((row) => row.status === 'completed').length;
  const failedRuns = queryRuns.filter((row) => row.status === 'failed').length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Benchmark run detail
          </h1>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            {runGroup.display_name ?? runGroup.canonical_domain} | {runGroup.query_set_name} |{' '}
            {runGroup.model_set_version}
          </p>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            {formatBenchmarkRunTimestamp(runGroup.created_at)}
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
        <MetricCard label="Query coverage" value={formatBenchmarkPercent(runGroup.query_coverage)} />
        <MetricCard label="Citation rate" value={formatBenchmarkPercent(runGroup.citation_rate)} />
        <MetricCard label="Share of voice" value={formatBenchmarkPercent(runGroup.share_of_voice)} />
        <MetricCard label="Completed queries" value={String(completedRuns)} />
        <MetricCard label="Failed queries" value={String(failedRuns)} />
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Run metadata</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <MetadataItem label="Run label" value={runGroup.label} />
          <MetadataItem label="Status" value={runGroup.status} className="capitalize" />
          <MetadataItem
            label="Run mode"
            value={
              typeof metricDetail['run_mode'] === 'string'
                ? String(metricDetail['run_mode'])
                : '-'
            }
          />
          <MetadataItem
            label="Grounding source"
            value={
              typeof metricDetail['grounding_context_source'] === 'string'
                ? String(metricDetail['grounding_context_source'])
                : '-'
            }
          />
          <MetadataItem
            label="Exact-page quality"
            value={formatBenchmarkPercent(
              typeof metricDetail['exact_page_quality_rate'] === 'number'
                ? metricDetail['exact_page_quality_rate']
                : null
            )}
          />
          <MetadataItem label="Site URL" value={runGroup.site_url ?? '-'} />
          <MetadataItem label="Notes" value={runGroup.notes ?? '-'} />
          <MetadataItem
            label="Started at"
            value={formatBenchmarkRunTimestamp(runGroup.started_at)}
          />
          <MetadataItem
            label="Completed at"
            value={formatBenchmarkRunTimestamp(runGroup.completed_at)}
          />
          <MetadataItem
            label="Skipped queries"
            value={formatBenchmarkCount(metricDetail['skipped_query_count'])}
          />
          <MetadataItem
            label="Completed queries"
            value={formatBenchmarkCount(metricDetail['completed_query_count'])}
          />
          <MetadataItem
            label="Failed queries"
            value={formatBenchmarkCount(metricDetail['failed_query_count'])}
          />
          <MetadataItem
            label="Exact-page matches"
            value={formatBenchmarkCount(metricDetail['exact_page_matched_runs'])}
          />
          <MetadataItem
            label="Supported page matches"
            value={formatBenchmarkCount(metricDetail['exact_page_supported_runs'])}
          />
          <MetadataItem label="Citation rows" value={String(citations.length)} />
          <MetadataItem
            label="Grounding error"
            value={
              typeof metricDetail['grounding_context_error'] === 'string' &&
              metricDetail['grounding_context_error'].trim().length > 0
                ? String(metricDetail['grounding_context_error'])
                : '-'
            }
          />
        </div>
      </section>

      {groundingEvidence.length > 0 ? (
        <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-lg font-semibold text-on-background">
                Grounding evidence
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                This run used structured site evidence captured at run time for grounded mode.
              </p>
            </div>
            <p className="text-sm text-on-surface-variant">
              {groundingEvidence.length} evidence item{groundingEvidence.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="mt-4 space-y-4">
            {groundingEvidence.map((item, index) => (
              <div
                key={`${item.source_label}-${index}`}
                className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-widest text-on-surface-variant">
                  <span>{item.evidence_label ?? item.source_label}</span>
                  {item.page_type ? <span>{item.page_type}</span> : null}
                  {typeof item.fetch_order === 'number' ? (
                    <span>fetch {item.fetch_order}</span>
                  ) : null}
                  {item.fetch_status ? <span>{item.fetch_status}</span> : null}
                  {item.page_url ? (
                    <a
                      href={item.page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="normal-case tracking-normal text-primary underline-offset-2 hover:underline"
                    >
                      {item.page_url}
                    </a>
                  ) : null}
                </div>
                {(item.selection_reason || item.page_title) && (
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {item.selection_reason ? `Selection: ${item.selection_reason}` : null}
                    {item.selection_reason && item.page_title ? ' | ' : null}
                    {item.page_title ? `Title: ${item.page_title}` : null}
                  </p>
                )}
                <p className="mt-3 whitespace-pre-wrap text-sm text-on-background">
                  {item.excerpt}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
                queryRuns.map((row) => {
                  const responseBody = readBenchmarkResponseBody(row.response_metadata);

                  return (
                    <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                      <td className="px-4 py-3 font-medium text-on-background">
                        {row.query_key}
                      </td>
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
                              {row.error_message ?? '-'}
                            </div>
                            {responseBody ? (
                              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-background">
                                {responseBody}
                              </pre>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {formatBenchmarkRunTimestamp(row.executed_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-xl font-bold text-on-background">Extracted citations</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
          <table className="min-w-[1120px] w-full border-collapse text-left font-body text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-on-surface-variant">
                <th className="px-4 py-3">Query run</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Grounded source</th>
                <th className="px-4 py-3 text-right">Rank</th>
                <th className="px-4 py-3 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {citations.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-on-surface-variant" colSpan={7}>
                    No citations were extracted for this run group.
                  </td>
                </tr>
              ) : (
                citations.map((citation) => (
                  <tr key={citation.id} className="border-t border-outline-variant/10">
                    <td className="px-4 py-3">{citation.query_run_id}</td>
                    <td className="px-4 py-3">{citation.citation_type}</td>
                    <td className="px-4 py-3">{citation.cited_domain ?? '-'}</td>
                    <td className="px-4 py-3 break-all">{citation.cited_url ?? '-'}</td>
                    <td className="px-4 py-3">
                      {citation.grounding_page_url ? (
                        <div className="space-y-1">
                          <a
                            href={citation.grounding_page_url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-primary underline-offset-2 hover:underline"
                          >
                            {citation.grounding_page_url}
                          </a>
                          <div className="text-xs text-on-surface-variant">
                            {citation.grounding_page_type ?? 'page'} | matched grounded page
                          </div>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant">Unresolved</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{citation.rank_position ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {typeof citation.confidence === 'number'
                        ? citation.confidence.toFixed(2)
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
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

function MetadataItem({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-sm text-on-background${className ? ` ${className}` : ''}`}>
        {value}
      </p>
    </div>
  );
}
