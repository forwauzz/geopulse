import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { setReportEvalJudgment } from '../../actions';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

type ReportRun = {
  id: string;
  framework: string | null;
  domain: string | null;
  site_url: string | null;
  prompt_set_name: string | null;
  rubric_version: string;
  generator_version: string;
  overall_score: number | null;
  metrics: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  scan_id: string | null;
};

type ReportRow = {
  pdf_url: string | null;
  markdown_url: string | null;
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

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function toMetricString(value: unknown, kind: 'count' | 'percent' | 'score' = 'count'): string {
  const num = toNumber(value);
  if (num == null) return '\u2014';
  if (kind === 'percent') return `${Math.round(num * 100)}%`;
  if (kind === 'score') return `${num}/100`;
  return String(num);
}

function variantLabel(row: ReportRun): string {
  const variant = row.metadata?.['artifact_variant'];
  if (variant === 'internal_rewrite') return 'Internal rewrite';
  return 'Deterministic';
}

function isRewrite(row: ReportRun): boolean {
  return row.metadata?.['artifact_variant'] === 'internal_rewrite';
}

function metricDelta(lhs: number | null, rhs: number | null): string {
  if (lhs == null || rhs == null) return '\u2014';
  const delta = lhs - rhs;
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function formatJudgment(value: unknown): string {
  if (value === 'better') return 'Better';
  if (value === 'worse') return 'Worse';
  if (value === 'unclear') return 'Unclear';
  return 'Not set';
}

const COMPARISON_METRICS: Array<{
  key: string;
  label: string;
  kind?: 'count' | 'percent' | 'score';
}> = [
  { key: 'overall_score', label: 'Overall score', kind: 'score' },
  { key: 'pass_rate', label: 'Pass rate', kind: 'percent' },
  { key: 'passed_tests', label: 'Passed tests' },
  { key: 'failed_tests', label: 'Failed tests' },
  { key: 'warning_tests', label: 'Warnings' },
  { key: 'low_confidence_tests', label: 'Low-confidence tests' },
  { key: 'total_tests', label: 'Total tests' },
];

export default async function ReportEvalDetailPage({ params }: Props) {
  const { id } = await params;
  const adminContext = await loadAdminPageContext(`/dashboard/evals/report/${id}`);
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const adminDb = adminContext.adminDb;

  const { data: run, error: runError } = await adminDb
    .from('report_eval_runs')
    .select(
      'id,framework,domain,site_url,prompt_set_name,rubric_version,generator_version,overall_score,metrics,metadata,created_at,scan_id'
    )
    .eq('id', id)
    .maybeSingle();

  if (runError || !run) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">Could not load report eval detail.</p>
      </main>
    );
  }

  const runRow = run as ReportRun;

  const siblingPromise = runRow.scan_id
    ? adminDb
        .from('report_eval_runs')
        .select(
          'id,framework,domain,site_url,prompt_set_name,rubric_version,generator_version,overall_score,metrics,metadata,created_at,scan_id'
        )
        .eq('scan_id', runRow.scan_id)
        .eq('framework', runRow.framework ?? 'layer_one_report')
        .order('created_at', { ascending: true })
    : Promise.resolve({ data: [], error: null } as { data: ReportRun[]; error: null });

  const reportPromise = runRow.scan_id
    ? adminDb
        .from('reports')
        .select('pdf_url,markdown_url')
        .eq('scan_id', runRow.scan_id)
        .eq('type', 'deep_audit')
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null } as { data: ReportRow | null; error: null });

  const [{ data: siblingRuns }, { data: reportRow }] = await Promise.all([
    siblingPromise,
    reportPromise,
  ]);

  const siblings = ((siblingRuns ?? []) as ReportRun[]).sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const deterministicRun = siblings.find((row) => !isRewrite(row)) ?? null;
  const rewrittenRun = [...siblings].reverse().find((row) => isRewrite(row)) ?? null;
  const activeVariant = variantLabel(runRow);
  const judgmentRow = rewrittenRun ?? (isRewrite(runRow) ? runRow : null);
  const currentJudgment = judgmentRow?.metadata?.['operator_rewrite_judgment'];
  const currentJudgmentAt = judgmentRow?.metadata?.['operator_rewrite_judged_at'];
  const currentJudgmentBy = judgmentRow?.metadata?.['operator_rewrite_judged_by'];

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Report eval detail</h1>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            {runRow.domain ?? 'unknown site'} · {activeVariant} · {runRow.prompt_set_name ?? 'default'}
          </p>
          <p className="mt-1 font-body text-sm text-on-surface-variant">{formatTs(runRow.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {runRow.scan_id ? (
            <Link
              href={`/results/${runRow.scan_id}`}
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Open results
            </Link>
          ) : null}
          <Link
            href="/dashboard/evals"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Back to eval analytics
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Overall score</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {runRow.overall_score != null ? `${runRow.overall_score}/100` : '\u2014'}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Pass rate</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toMetricString(runRow.metrics?.['pass_rate'], 'percent')}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Failed tests</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {toMetricString(runRow.metrics?.['failed_tests'])}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Variant</p>
          <p className="mt-2 font-headline text-2xl font-bold text-on-background">{activeVariant}</p>
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Scan comparison</h2>
        {!runRow.scan_id || siblings.length === 0 ? (
          <p className="mt-4 text-sm text-on-surface-variant">
            No comparable report-eval siblings were found for this run.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {[deterministicRun, rewrittenRun].map((row, index) => (
                <div key={index} className="rounded-xl bg-surface-container-low p-5">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                    {row ? variantLabel(row) : index === 0 ? 'Deterministic' : 'Internal rewrite'}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-on-background">
                    {row?.overall_score != null ? `${row.overall_score}/100` : '\u2014'}
                  </p>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    {row ? `${row.generator_version} · ${formatTs(row.created_at)}` : 'Not available for this scan.'}
                  </p>
                  {row?.id ? (
                    <p className="mt-1 text-xs text-on-surface-variant">eval id: {row.id}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-outline-variant/10">
              <table className="w-full min-w-[720px] border-collapse text-left font-body text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/10 bg-surface-container-low">
                    <th className="px-4 py-3 font-semibold text-on-background">Metric</th>
                    <th className="px-4 py-3 font-semibold text-on-background">Deterministic</th>
                    <th className="px-4 py-3 font-semibold text-on-background">Internal rewrite</th>
                    <th className="px-4 py-3 font-semibold text-on-background">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_METRICS.map((metric) => {
                    const deterministicValue =
                      metric.key === 'overall_score'
                        ? deterministicRun?.overall_score ?? null
                        : deterministicRun?.metrics?.[metric.key];
                    const rewrittenValue =
                      metric.key === 'overall_score'
                        ? rewrittenRun?.overall_score ?? null
                        : rewrittenRun?.metrics?.[metric.key];
                    return (
                      <tr key={metric.key} className="border-b border-outline-variant/10">
                        <td className="px-4 py-3 text-on-background">{metric.label}</td>
                        <td className="px-4 py-3 text-on-background">
                          {toMetricString(deterministicValue, metric.kind)}
                        </td>
                        <td className="px-4 py-3 text-on-background">
                          {toMetricString(rewrittenValue, metric.kind)}
                        </td>
                        <td className="px-4 py-3 text-on-background">
                          {metricDelta(toNumber(rewrittenValue), toNumber(deterministicValue))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Operator judgment</h2>
        {judgmentRow ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">
                Rewritten report judgment
              </p>
              <p className="mt-2 text-2xl font-semibold text-on-background">
                {formatJudgment(currentJudgment)}
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">
                {currentJudgmentAt
                  ? `Last set ${formatTs(String(currentJudgmentAt))}${currentJudgmentBy ? ` by ${String(currentJudgmentBy)}` : ''}.`
                  : 'No operator judgment recorded yet.'}
              </p>
            </div>

            <form action={setReportEvalJudgment} className="flex flex-wrap gap-3">
              <input type="hidden" name="evalRunId" value={judgmentRow.id} />
              <input type="hidden" name="returnPath" value={`/dashboard/evals/report/${id}`} />
              <button
                type="submit"
                name="judgment"
                value="better"
                className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
              >
                Rewrite is better
              </button>
              <button
                type="submit"
                name="judgment"
                value="worse"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Rewrite is worse
              </button>
              <button
                type="submit"
                name="judgment"
                value="unclear"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Unclear
              </button>
            </form>
          </div>
        ) : (
          <p className="mt-4 text-sm text-on-surface-variant">
            No internal rewritten report variant exists for this scan yet.
          </p>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Run metadata</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Scan ID</p>
              <p className="mt-1 text-sm text-on-background">{runRow.scan_id ?? '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Site URL</p>
              <p className="mt-1 text-sm text-on-background">{runRow.site_url ?? '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Generator</p>
              <p className="mt-1 text-sm text-on-background">{runRow.generator_version}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Rubric</p>
              <p className="mt-1 text-sm text-on-background">{runRow.rubric_version}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Prompt set</p>
              <p className="mt-1 text-sm text-on-background">{runRow.prompt_set_name ?? '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant">Artifact variant</p>
              <p className="mt-1 text-sm text-on-background">{variantLabel(runRow)}</p>
            </div>
          </div>

          {(reportRow?.pdf_url || reportRow?.markdown_url) && runRow.scan_id ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {reportRow.markdown_url ? (
                <a
                  href={`/api/scans/${runRow.scan_id}/report-markdown?download=1`}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
                >
                  Download deterministic markdown
                </a>
              ) : null}
              {reportRow.pdf_url ? (
                <a
                  href={reportRow.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
                >
                  Download PDF
                </a>
              ) : null}
              {typeof runRow.metadata?.['rewrite_artifact_url'] === 'string' &&
              runRow.metadata['rewrite_artifact_url'].length > 0 ? (
                <a
                  href={String(runRow.metadata['rewrite_artifact_url'])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
                >
                  Download rewritten markdown
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <h2 className="font-headline text-lg font-semibold text-on-background">Raw metadata</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-container-low p-4 text-xs text-on-background">
            {JSON.stringify(runRow.metadata ?? {}, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}
