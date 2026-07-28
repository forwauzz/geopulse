import Link from 'next/link';
import { PrintScorecardButton } from '@/components/print-scorecard-button';
import type { VisibilityScorecardData } from '@/lib/server/visibility-scorecard-service';

function changeLabel(value: number | null): string {
  if (value === null) return 'First baseline';
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10} points`;
}

function platformName(platform: string): string {
  if (platform === 'chatgpt') return 'ChatGPT';
  if (platform === 'gemini') return 'Gemini';
  if (platform === 'perplexity') return 'Perplexity';
  return platform;
}

export function VisibilityScorecardReport({
  scorecard,
}: {
  readonly scorecard: VisibilityScorecardData;
}) {
  const brandColor = scorecard.brand?.primaryHex || '#9b7b32';
  const latestReport = scorecard.reports[0] ?? null;

  return (
    <main className="min-h-screen bg-[#f4f3ef] px-4 py-8 text-[#171713] md:px-8 print:bg-white print:p-0">
      <PrintScorecardButton />
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <section className="min-h-[760px] p-7 md:p-12 print:min-h-[100vh]" style={{ borderTop: `8px solid ${brandColor}` }}>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: brandColor }}>AI visibility report</p>
              <h1 className="mt-3 text-4xl font-bold">{scorecard.displayName}</h1>
              <p className="mt-2 text-sm text-black/60">{scorecard.domain} · {scorecard.location || 'Market not set'}</p>
            </div>
            <div className="text-right">
              {scorecard.brand?.logoUrl ? <img src={scorecard.brand.logoUrl} alt="" className="mb-3 ml-auto h-10 max-w-[160px] object-contain" /> : null}
              <p className="text-sm font-bold">{scorecard.preparedByName}</p>
              <p className="mt-1 text-xs text-black/50">
                Prepared {new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(scorecard.preparedAt))}
              </p>
            </div>
          </header>

          <div className="mt-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">Executive summary</p>
            <p className="mt-3 max-w-4xl text-xl leading-relaxed">{scorecard.outcome.executiveSummary}</p>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              ['AI readiness', scorecard.readinessScore !== null ? `${scorecard.readinessScore}/100` : '—', changeLabel(scorecard.readinessChange)],
              ['AI visibility', scorecard.outcome.visibilityPct !== null ? `${scorecard.outcome.visibilityPct}%` : '—', changeLabel(scorecard.outcome.deltaPct)],
              ['Tracked questions', scorecard.prompts.prompts.length || '—', scorecard.outcome.measured ? 'Measured live' : 'Baseline pending'],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="rounded-2xl bg-[#f4f3ef] p-5">
                <p className="text-xs font-semibold text-black/50">{label}</p>
                <p className="mt-3 text-3xl font-bold">{value}</p>
                <p className="mt-2 text-xs font-semibold" style={{ color: brandColor }}>{note}</p>
              </div>
            ))}
          </div>

          <div className="mt-9 grid gap-7 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold">Visibility by AI platform</h2>
              <div className="mt-4 space-y-3">
                {scorecard.outcome.engines.length > 0 ? scorecard.outcome.engines.map((engine) => (
                  <div key={engine.engine} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3">
                    <div>
                      <p className="font-semibold">{platformName(engine.engine)}</p>
                      <p className="mt-0.5 text-xs text-black/45">{engine.modelId}</p>
                    </div>
                    <p className="text-2xl font-bold">{engine.visibilityPct}%</p>
                  </div>
                )) : <p className="rounded-xl bg-[#f4f3ef] p-4 text-sm text-black/55">The first live provider check has not completed yet.</p>}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold">Competitors tracked</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {scorecard.competitors.length > 0
                  ? scorecard.competitors.map((competitor) => (
                      <span key={competitor} className="rounded-full bg-[#f4f3ef] px-3 py-2 text-sm font-semibold">{competitor}</span>
                    ))
                  : <p className="rounded-xl bg-[#f4f3ef] p-4 text-sm text-black/55">Competitor tracking starts with the first visibility setup.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-[760px] border-t border-black/10 p-7 md:p-12 print:min-h-[100vh] print:break-before-page">
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brandColor }}>Customer questions</p>
              <h2 className="mt-2 text-2xl font-bold">What buyers are asking AI</h2>
              <div className="mt-5 space-y-2">
                {scorecard.prompts.prompts.slice(0, 10).map((prompt) => (
                  <div key={prompt.queryText} className="rounded-xl border border-black/10 p-4">
                    <p className="text-sm font-semibold">{prompt.queryText}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {scorecard.prompts.engineOrder.map((engine) => (
                        <span key={engine} className={`rounded-full px-2 py-1 font-semibold ${prompt.engines[engine] ? 'bg-emerald-100 text-emerald-800' : 'bg-[#f4f3ef] text-black/55'}`}>
                          {platformName(engine)} · {prompt.engines[engine] === null ? 'queued' : prompt.engines[engine] ? 'cited' : 'not cited'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {scorecard.prompts.prompts.length === 0 ? (
                  <p className="rounded-xl bg-[#f4f3ef] p-4 text-sm text-black/55">Buyer questions will appear after monitoring starts.</p>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brandColor }}>Recommended next</p>
              <h2 className="mt-2 text-2xl font-bold">Priority action plan</h2>
              <div className="mt-5 space-y-3">
                {scorecard.outcome.actions.slice(0, 5).map((action, index) => (
                  <div key={action.key} className="rounded-xl bg-[#f4f3ef] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{index + 1}</span>
                      <div>
                        <p className="font-semibold">{action.title}</p>
                        <p className="mt-2 text-sm leading-relaxed text-black/60">{action.nextStep}</p>
                        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>{action.impact} impact · {action.effort} effort</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-black/10 p-4 text-sm text-black/55">
                <p className="font-semibold text-black">Method</p>
                <p className="mt-2 leading-relaxed">{scorecard.outcome.methodology}</p>
              </div>
              {latestReport?.pdfUrl ? (
                <Link href={latestReport.pdfUrl} className="mt-5 inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
                  Download full measurement report
                </Link>
              ) : null}
            </div>
          </div>
          {scorecard.evidence.length > 0 ? (
            <div className="mt-9">
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brandColor }}>Measurement receipts</p>
              <h2 className="mt-2 text-2xl font-bold">What the AI answers actually showed</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {scorecard.evidence.map((engine) => (
                  <div key={engine.engine} className="rounded-xl border border-black/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{platformName(engine.engine)}</p>
                      <p className="text-lg font-bold">{engine.citedCount}/{engine.totalCount}</p>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-black/55">
                      {engine.rows[0]?.cited && engine.rows[0]?.excerpt
                        ? engine.rows[0].excerpt
                        : engine.rows[0]?.namedInstead.length
                          ? `Named instead: ${engine.rows[0].namedInstead.join(', ')}`
                          : 'The raw answer and citation evidence are saved with this measurement.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <footer className="mt-10 border-t border-black/10 pt-5 text-xs text-black/45">
            {scorecard.brand?.footerNote || `Prepared for ${scorecard.displayName} by ${scorecard.preparedByName}.`}
            {scorecard.brand?.showPoweredBy !== false ? ' Powered by GEO-Pulse.' : ''}
          </footer>
        </section>
      </div>
    </main>
  );
}
