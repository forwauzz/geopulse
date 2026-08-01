import type { CSSProperties, ReactNode } from 'react';
import type { AgencyReportQuestion, AgencyReportSnapshotV2 } from '@/lib/server/agency-report-snapshot';

export type AgencyReportAction = {
  readonly key: string;
  readonly nextStep: string;
  readonly why: string;
  readonly impact: 'high' | 'medium' | 'low';
  readonly effort: 'small' | 'medium' | 'large';
};

function pct(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function period(value: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (!month) return value;
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month[1]}-${month[2]}-01T00:00:00.000Z`));
}

function Section({ eyebrow, title, children, id }: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <section id={id} className="border-t border-[#172033]/10 px-6 py-10 md:px-12 md:py-14 print:break-inside-avoid">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#687083]">{eyebrow}</p>
      <h2 className="mt-2 max-w-3xl font-headline text-2xl font-semibold tracking-[-0.02em] text-[#111827] md:text-3xl">{title}</h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function QuestionRow({ question }: { readonly question: AgencyReportQuestion }) {
  return (
    <div className="grid gap-3 border-t border-[#172033]/10 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <p className="text-[14px] font-semibold leading-relaxed text-[#20283a]">{question.queryText}</p>
      <div className="flex flex-wrap gap-1.5 md:justify-end">
        {(Object.entries(question.results) as Array<[string, { cited: boolean }]>).map(([engine, result]) => (
          <span
            key={engine}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${result.cited ? 'bg-emerald-100 text-emerald-800' : 'bg-[#f0f1f3] text-[#697083]'}`}
          >
            {engine === 'chatgpt' ? 'ChatGPT' : engine === 'gemini' ? 'Gemini' : 'Perplexity'} · {result.cited ? 'cited' : 'not cited'}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AgencyReportView({
  snapshot,
  agencyName,
  brandColor,
  logoUrl,
  footerNote,
  showPoweredBy = true,
  readinessScore,
  readinessChange,
  actions = [],
  downloadUrl,
  compact = false,
}: {
  readonly snapshot: AgencyReportSnapshotV2;
  readonly agencyName: string;
  readonly brandColor: string;
  readonly logoUrl?: string | null;
  readonly footerNote?: string | null;
  readonly showPoweredBy?: boolean;
  readonly readinessScore?: number | null;
  readonly readinessChange?: number | null;
  readonly actions?: readonly AgencyReportAction[];
  readonly downloadUrl?: string | null;
  readonly compact?: boolean;
}) {
  const settings = snapshot.settings;
  const topWin = snapshot.wins[0] ?? null;
  const topOpportunity = snapshot.opportunities[0] ?? null;
  const trendStart = snapshot.trend[0] ?? null;
  const trendEnd = snapshot.trend.at(-1) ?? null;
  const trendDelta = trendStart && trendEnd ? trendEnd.visibilityPct - trendStart.visibilityPct : 0;
  const style = { '--report-accent': brandColor } as CSSProperties;

  return (
    <article
      style={style}
      className={`overflow-hidden bg-white text-[#111827] ${compact ? 'rounded-2xl border border-[#172033]/10' : 'rounded-[32px] shadow-[0_28px_80px_rgba(15,23,42,0.16)] print:rounded-none print:shadow-none'}`}
    >
      <header className="relative overflow-hidden bg-[#111827] px-6 pb-10 pt-7 text-white md:px-12 md:pb-14 md:pt-10">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: brandColor }} />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ backgroundColor: brandColor }} />
        <div className="relative flex items-start justify-between gap-6 border-b border-white/15 pb-8">
          <div>
            {logoUrl ? <img src={logoUrl} alt={`${agencyName} logo`} className="h-9 max-w-[160px] object-contain object-left brightness-0 invert" /> : <p className="font-headline text-lg font-semibold">{agencyName}</p>}
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">AI visibility performance report</p>
          </div>
          <div className="text-right text-xs text-white/65">
            <p className="font-semibold text-white">{period(snapshot.windowDate)}</p>
            <p className="mt-1">Profile {snapshot.profileVersion}</p>
          </div>
        </div>
        <div className="relative mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">Prepared for</p>
            <h1 className="mt-3 max-w-3xl font-headline text-4xl font-semibold leading-[1.05] tracking-[-0.04em] md:text-6xl">{snapshot.clientName}</h1>
            <p className="mt-4 text-sm text-white/65">{snapshot.domain} · {snapshot.topic} · {snapshot.location}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Measured visibility</p>
            <p className="mt-2 text-5xl font-bold tracking-[-0.05em]">{pct(snapshot.combinedVisibilityPct)}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/65">{snapshot.evaluationsCited} citations from {snapshot.evaluationsTracked} measured answers</p>
          </div>
        </div>
      </header>

      <section className="px-6 py-10 md:px-12 md:py-14">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
          {settings.sections.executiveSummary ? (
            <div className="rounded-2xl bg-[#f6f7f8] p-6 md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#687083]">Executive readout</p>
              <p className="mt-4 text-xl font-medium leading-relaxed tracking-[-0.015em] text-[#20283a]">
                {snapshot.clientName} appeared in {snapshot.evaluationsCited} of {snapshot.evaluationsTracked} measured AI answers. {topWin ? <>The strongest result was “{topWin.queryText},” cited by {topWin.citedByEngines} of {topWin.enginesMeasured} assistants.</> : <>This is the first transparent baseline.</>} {topOpportunity ? <>The clearest growth opportunity is “{topOpportunity.queryText}.”</> : <>Every selected buyer question earned at least one citation.</>}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {readinessScore !== undefined ? (
              <div className="rounded-2xl border border-[#172033]/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#687083]">AI readiness</p>
                <p className="mt-3 text-3xl font-bold">{readinessScore === null ? '—' : `${readinessScore}/100`}</p>
                <p className="mt-2 text-xs font-semibold" style={{ color: brandColor }}>{readinessChange === null || readinessChange === undefined ? 'First baseline' : `${readinessChange > 0 ? '+' : ''}${readinessChange} points`}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-[#172033]/10 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#687083]">Buyer questions</p>
              <p className="mt-3 text-3xl font-bold">{snapshot.questionsTracked}</p>
              <p className="mt-2 text-xs font-semibold" style={{ color: brandColor }}>{snapshot.questionsCited} earned a citation</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-[#172033]/10 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#687083]">Measurement scope</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[#344054]">{snapshot.scope.disclosure}</p>
            </div>
          </div>
        </div>
      </section>

      {settings.sections.visibilityByEngine ? (
        <Section eyebrow="Performance" title="Visibility across measured AI assistants" id="visibilityByEngine">
          <div className="grid gap-3 md:grid-cols-3">
            {snapshot.engines.map((engine) => (
              <div key={engine.key} className="rounded-2xl border border-[#172033]/10 p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold text-[#344054]">{engine.label}</p>
                  <span className={`h-2.5 w-2.5 rounded-full ${engine.visibilityPct > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </div>
                <p className="mt-5 text-4xl font-bold tracking-[-0.04em]">{pct(engine.visibilityPct)}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf0f2]"><div className="h-full rounded-full" style={{ backgroundColor: brandColor, width: pct(engine.visibilityPct) }} /></div>
                <p className="mt-3 text-xs text-[#687083]">{engine.queriesCited} of {engine.queriesTracked} measured answers</p>
              </div>
            ))}
          </div>
          {snapshot.unavailableEngines.length > 0 ? <p className="mt-4 text-xs text-[#687083]">Unavailable assistants were omitted from the average, never scored as zero.</p> : null}
        </Section>
      ) : null}

      {settings.sections.trendOverTime ? (
        <Section eyebrow="Momentum" title={`Visibility over the selected ${snapshot.comparisonMonths}-month horizon`} id="trendOverTime">
          {snapshot.trend.length > 1 ? (
            <div>
              <div className="flex items-end gap-3 rounded-2xl bg-[#f6f7f8] px-5 pb-5 pt-8 md:gap-5">
                {snapshot.trend.map((point) => (
                  <div key={point.windowDate} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-bold text-[#20283a]">{pct(point.visibilityPct)}</span>
                    <div className="flex h-40 w-full max-w-16 items-end overflow-hidden rounded-t-lg bg-white">
                      <div className="w-full rounded-t-lg" style={{ backgroundColor: brandColor, height: `${String(Math.max(4, Math.round(point.visibilityPct * 100)))}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold text-[#687083]">{period(point.windowDate)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold" style={{ color: trendDelta >= 0 ? brandColor : '#b54708' }}>
                {trendDelta === 0 ? 'Visibility held steady' : `${trendDelta > 0 ? '+' : ''}${String(Math.round(trendDelta * 100))} percentage points`} across {snapshot.trend.length} comparable monthly measurements.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#172033]/20 p-6">
              <p className="font-semibold text-[#20283a]">Comparable baseline established at {pct(snapshot.combinedVisibilityPct)}.</p>
              <p className="mt-2 text-sm leading-relaxed text-[#687083]">Future monthly measurements will appear here only when the same versioned prompt and engine profile is used.</p>
            </div>
          )}
        </Section>
      ) : null}

      {(settings.sections.buyerQuestions || settings.sections.promptPerformance) ? (
        <Section eyebrow="Evidence" title="What buyers asked—and whether the brand appeared" id="buyerQuestions">
          <div>{snapshot.questions.map((question) => <QuestionRow key={question.queryKey} question={question} />)}</div>
        </Section>
      ) : null}

      {(settings.sections.priorityActionPlan || settings.sections.opportunities) ? (
        <Section eyebrow="Growth plan" title="The next moves most likely to improve visibility" id="priorityActionPlan">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              {(actions.length > 0 ? actions : snapshot.opportunities.slice(0, 4).map((question) => ({
                key: question.queryKey,
                nextStep: `Publish a specific, evidence-backed answer to “${question.queryText}” on the most relevant service page.`,
                why: 'No measured assistant cited the brand for this selected buyer question.',
                impact: 'high' as const,
                effort: 'medium' as const,
              }))).slice(0, 4).map((action, index) => (
                <div key={action.key} className="rounded-2xl bg-[#f6f7f8] p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: brandColor }}>{index + 1}</span>
                    <div>
                      <p className="font-semibold leading-relaxed text-[#20283a]">{action.nextStep}</p>
                      <p className="mt-2 text-xs leading-relaxed text-[#687083]">{action.why}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: brandColor }}>{action.impact} impact · {action.effort} effort</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {settings.sections.competitorsTracked ? (
              <div className="rounded-2xl border border-[#172033]/10 p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#687083]">Who appeared instead</p>
                <div className="mt-5 space-y-5">
                  {snapshot.competitors.length > 0 ? snapshot.competitors.slice(0, 6).map((competitor) => {
                    const max = snapshot.competitors[0]?.appearedInsteadCount || 1;
                    return (
                      <div key={competitor.name}>
                        <div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold">{competitor.name}</span><span className="font-bold">{competitor.appearedInsteadCount}</span></div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0f2]"><div className="h-full rounded-full" style={{ backgroundColor: brandColor, width: `${String(Math.round(competitor.appearedInsteadCount / max * 100))}%` }} /></div>
                      </div>
                    );
                  }) : <p className="text-sm leading-relaxed text-[#687083]">No competing domain was captured in the selected scope.</p>}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {settings.sections.methodology ? (
        <Section eyebrow="Transparency" title="How this measurement was built" id="methodology">
          <div className="grid gap-4 text-sm leading-relaxed text-[#596174] md:grid-cols-3">
            <p className="rounded-2xl bg-[#f6f7f8] p-5"><strong className="mb-2 block text-[#20283a]">One denominator</strong>The combined figure is recalculated from this report’s exact selected prompts and completed assistants.</p>
            <p className="rounded-2xl bg-[#f6f7f8] p-5"><strong className="mb-2 block text-[#20283a]">Truthful selection</strong>{snapshot.scope.isCurated ? 'This report uses a curated scope, disclosed above and versioned for reproduction.' : 'This report includes the full measured scope for the period.'}</p>
            <p className="rounded-2xl bg-[#f6f7f8] p-5"><strong className="mb-2 block text-[#20283a]">Dated evidence</strong>AI answers can vary by session. Results describe the recorded measurement period, not a guaranteed future placement.</p>
          </div>
          {downloadUrl ? <a href={downloadUrl} className="mt-7 inline-flex rounded-xl px-5 py-3 text-sm font-bold text-white" style={{ backgroundColor: brandColor }}>Download the client-ready PDF</a> : null}
        </Section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#172033]/10 px-6 py-6 text-[11px] text-[#7a8293] md:px-12">
        <span>{footerNote || `Prepared for ${snapshot.clientName} by ${agencyName}.`}</span>
        <span>{showPoweredBy ? 'Powered by GEO-Pulse · ' : ''}{snapshot.profileVersion}</span>
      </footer>
    </article>
  );
}
