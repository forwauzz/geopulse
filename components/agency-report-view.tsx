import type { CSSProperties, ReactNode } from 'react';
import type { AgencyReportQuestion, AgencyReportSnapshotV2 } from '@/lib/server/agency-report-snapshot';
import type {
  BuyerIntelligenceReportViewModel,
  BuyerIntelligenceViewModel,
} from '@/lib/intelligence/buyer-intelligence-view-model';

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

function marketLabel(snapshot: AgencyReportSnapshotV2): string {
  const market = snapshot.integrity.market;
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(market.countryCode) ?? market.countryCode;
  return [market.locality, ...market.serviceAreas, country]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(', ');
}

function engineLabel(value: string): string {
  return value === 'chatgpt' ? 'ChatGPT' : value === 'gemini' ? 'Google Gemini' : value === 'perplexity' ? 'Perplexity' : value;
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
              <dl className="mt-4 grid gap-3 border-t border-[#172033]/10 pt-4 text-xs text-[#596174] sm:grid-cols-2">
                <div><dt className="font-bold text-[#20283a]">Business & market</dt><dd className="mt-1">{snapshot.integrity.businessName} · {marketLabel(snapshot)} · {snapshot.integrity.market.languages.join(', ')}</dd></div>
                <div><dt className="font-bold text-[#20283a]">Period & denominator</dt><dd className="mt-1">{period(snapshot.integrity.period)} · {snapshot.integrity.selectedPromptKeys.length} prompts · {snapshot.integrity.denominator.evaluations} completed answers</dd></div>
                <div><dt className="font-bold text-[#20283a]">Measured assistants</dt><dd className="mt-1">{snapshot.integrity.measuredEngines.map(engineLabel).join(', ')}</dd></div>
                <div><dt className="font-bold text-[#20283a]">Approved competitors</dt><dd className="mt-1">{snapshot.integrity.competitorDomains.join(', ') || 'None configured'}</dd></div>
              </dl>
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

function viewHas(model: BuyerIntelligenceViewModel, key: string): boolean {
  return model.manifest.some((section) => section.key === key && section.visible);
}

function StateBadge({ state }: { readonly state: string }) {
  const positive = state === 'supported' || state === 'verified_improved' || state === 'ready';
  const caution = state === 'partial' || state === 'verified_unchanged';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${positive ? 'bg-emerald-100 text-emerald-800' : caution ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
      {state.replaceAll('_', ' ')}
    </span>
  );
}

export type BuyerIntelligenceArtifactBranding = {
  readonly publisherName: string;
  readonly preparedBy: string;
  readonly accentColor: string;
  readonly logoUrl?: string | null;
  readonly heroImageUrl?: string | null;
  readonly footerNote?: string | null;
};

const DEFAULT_BUYER_INTELLIGENCE_BRANDING: BuyerIntelligenceArtifactBranding = {
  publisherName: 'GEO-Pulse',
  preparedBy: 'The GEO-Pulse team, Montreal, Quebec',
  accentColor: '#3155d9',
};

function BuyerIntelligenceReport({
  model,
  branding,
}: {
  readonly model: BuyerIntelligenceReportViewModel;
  readonly branding: BuyerIntelligenceArtifactBranding;
}) {
  return (
    <article data-view-kind={model.kind} data-snapshot-id={model.snapshotId} className="overflow-hidden rounded-[28px] border border-[#172033]/10 bg-white text-[#111827] shadow-[0_24px_70px_rgba(15,23,42,0.14)] print:rounded-none print:shadow-none">
      <header className="relative overflow-hidden bg-[#111827] px-6 py-10 text-white md:px-12 md:py-14">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: branding.accentColor }} />
        <div className="relative flex items-center justify-between gap-6">
          {branding.logoUrl ? <img src={branding.logoUrl} alt={`${branding.publisherName} logo`} className="h-9 max-w-[180px] object-contain object-left" /> : <p className="font-headline text-lg font-semibold">{branding.publisherName}</p>}
          <p className="text-right text-[10px] font-bold uppercase tracking-[0.22em] text-[#93a4c4]">{model.kind.replaceAll('_', ' ')}</p>
        </div>
        <h1 className="mt-4 max-w-4xl font-headline text-4xl font-semibold leading-tight tracking-[-0.035em] md:text-6xl">{model.headline}</h1>
        {branding.heroImageUrl ? (
          <figure data-client-hero-proof className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-white/5">
            <img src={branding.heroImageUrl} alt={`${model.identity.displayName} website home page`} className="aspect-[16/7] w-full object-cover object-top" />
            <figcaption className="border-t border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Website captured for this measurement · {model.identity.canonicalDomain}</figcaption>
          </figure>
        ) : null}
        <div className="mt-8 grid gap-2 border-t border-white/15 pt-6 text-sm text-white/70 md:grid-cols-2">
          <p><strong className="text-white">Prepared for:</strong> {model.identity.displayName}</p>
          <p className="md:text-right">{model.identity.canonicalDomain} · {model.identity.marketLabel}</p>
        </div>
        <p className="mt-2 text-xs text-white/55">Prepared by {branding.preparedBy}</p>
      </header>

      {viewHas(model, 'summary') ? (
        <Section eyebrow="Executive readout" title="What the measured evidence supports">
          <p className="max-w-4xl text-xl font-medium leading-relaxed text-[#20283a]">{model.summary}</p>
        </Section>
      ) : null}

      {viewHas(model, 'observations') ? (
        <Section eyebrow="Buyer questions" title="What an AI buyer can verify">
          <div className="space-y-3">
            {model.observations.map((observation) => (
              <div key={observation.id} className="rounded-2xl border border-[#172033]/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="max-w-3xl font-semibold leading-relaxed text-[#20283a]">{observation.question}</h3>
                  <StateBadge state={observation.state} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#596174]">{observation.answer ?? 'No eligible answer was available in this measurement period.'}</p>
                {observation.evidenceIds.length ? <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8293]">{observation.evidenceIds.length} evidence reference{observation.evidenceIds.length === 1 ? '' : 's'} · {observation.runIds.length} source run{observation.runIds.length === 1 ? '' : 's'}</p> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {viewHas(model, 'benchmark') && model.benchmark ? (
        model.benchmark.state === 'eligible' ? (
          <Section eyebrow="Benchmark" title={`Compared with ${model.benchmark.label}`}>
            <p className="text-sm leading-relaxed text-[#596174]">Eligible cohort: {model.benchmark.sampleSize} organizations · methodology {model.benchmark.methodologyVersion}. Each metric retains its own denominator.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {model.benchmark.comparisons.map((comparison) => (
                <div key={comparison.metricKey} className="rounded-2xl bg-[#f6f7f8] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#687083]">{comparison.metricKey.replaceAll('_', ' ')}</p>
                  <p className="mt-3 text-2xl font-bold">{comparison.businessValue} <span className="text-sm font-medium text-[#687083]">vs {comparison.cohortMedian} median</span></p>
                  <p className="mt-2 text-xs text-[#687083]">n={comparison.denominator}{comparison.percentile === null ? '' : ` · ${comparison.percentile}th percentile`}</p>
                </div>
              ))}
            </div>
          </Section>
        ) : (
          <Section eyebrow="Benchmark" title="No eligible comparison cohort was attached">
            <p className="max-w-3xl text-sm leading-relaxed text-[#596174]">This baseline reports only the measured organization. It does not invent a peer rank or treat a missing cohort as zero.</p>
          </Section>
        )
      ) : null}

      {viewHas(model, 'recommendations') ? (
        <Section eyebrow="Action plan" title="What to fix next">
          <div className="space-y-3">
            {model.recommendations.map((recommendation, index) => (
              <div key={recommendation.id} className="grid gap-4 rounded-2xl bg-[#f6f7f8] p-5 md:grid-cols-[40px_minmax(0,1fr)_auto]">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: branding.accentColor }}>{index + 1}</span>
                <div><h3 className="font-semibold text-[#20283a]">{recommendation.title}</h3><p className="mt-2 text-sm leading-relaxed text-[#596174]">{recommendation.action}</p></div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#687083]">{recommendation.priority} impact · {recommendation.effort} effort</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {viewHas(model, 'change') && model.change ? (
        <Section eyebrow="Measured movement" title="Like-for-like change">
          <div className="grid gap-3 md:grid-cols-3">
            {model.change.changes.map((change) => (
              <div key={change.metricKey} className="rounded-2xl border border-[#172033]/10 p-5">
                <StateBadge state={change.direction} />
                <p className="mt-4 text-sm font-semibold">{change.metricKey.replace('buyer_question:', '').replaceAll('_', ' ')}</p>
                <p className="mt-2 text-xs text-[#687083]">{change.previousValue ?? '—'} → {change.currentValue ?? '—'}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {viewHas(model, 'verification') ? (
        <Section eyebrow="Verification" title="What changed after the work">
          <div className="space-y-3">{model.recommendations.map((recommendation) => <div key={recommendation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#172033]/10 p-5"><p className="font-semibold">{recommendation.title}</p><StateBadge state={recommendation.verification.result} /></div>)}</div>
        </Section>
      ) : null}

      {viewHas(model, 'unavailable_measurements') ? (
        <Section eyebrow="Coverage" title="Measurements not available this period">
          <ul className="list-disc space-y-2 pl-5 text-sm text-[#596174]">{model.unavailableMeasurements.map((item) => <li key={item}>{item.replace(':', ': ')}</li>)}</ul>
        </Section>
      ) : null}

      {viewHas(model, 'provenance') && model.provenance ? (
        <Section eyebrow="Provenance" title="How to reproduce this baseline">
          <dl className="grid gap-3 text-sm text-[#596174] md:grid-cols-2"><div><dt className="font-bold text-[#20283a]">Measurement inputs</dt><dd className="mt-1">{model.provenance.runIds.length} source runs · {model.provenance.evidenceIds.length} evidence references</dd></div><div><dt className="font-bold text-[#20283a]">Generated</dt><dd className="mt-1">{model.provenance.generatedAt} · {model.provenance.generatorVersion}</dd></div></dl>
        </Section>
      ) : null}

      {viewHas(model, 'limitations') ? (
        <Section eyebrow="Limitations" title="What this report does not claim">
          {model.limitations.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#596174]">{model.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-[#596174]">Results describe the recorded measurement period and do not guarantee future AI placement.</p>}
        </Section>
      ) : null}

      {viewHas(model, 'cta') && model.cta ? <div className="border-t border-[#172033]/10 px-6 py-8 md:px-12"><a href={model.cta.href} className="inline-flex rounded-xl px-5 py-3 text-sm font-bold text-white" style={{ backgroundColor: branding.accentColor }}>{model.cta.label}</a></div> : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#172033]/10 px-6 py-6 text-[11px] text-[#7a8293] md:px-12">
        <span>{branding.footerNote ?? `Prepared for ${model.identity.displayName} by ${branding.preparedBy}.`}</span>
        <span>{model.contractVersion}</span>
      </footer>
    </article>
  );
}

export function BuyerIntelligenceAgencyReportView({
  model,
  branding = DEFAULT_BUYER_INTELLIGENCE_BRANDING,
}: {
  readonly model: BuyerIntelligenceViewModel;
  readonly branding?: BuyerIntelligenceArtifactBranding;
}) {
  if (model.kind !== 'agency_portfolio') return <BuyerIntelligenceReport model={model} branding={branding} />;
  return (
    <section data-view-kind={model.kind} className="rounded-[28px] border border-[#172033]/10 bg-white p-6 text-[#111827] shadow-[0_24px_70px_rgba(15,23,42,0.12)] md:p-10" style={{ borderTopColor: branding.accentColor, borderTopWidth: 6 }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#687083]">{branding.publisherName} · agency portfolio</p>
      <h1 className="mt-3 font-headline text-4xl font-semibold tracking-[-0.035em]">{model.headline}</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {model.rows.map((row) => (
          <article key={row.ownerId} data-snapshot-id={row.snapshotId} className="rounded-2xl border border-[#172033]/10 p-5">
            <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-[#20283a]">{row.displayName}</h2><p className="mt-1 text-xs text-[#687083]">{row.canonicalDomain}</p></div><StateBadge state={row.status} /></div>
            {row.status === 'ready' ? <><p className="mt-5 text-sm text-[#596174]">{row.supportedQuestions} of {row.measuredQuestions} measured buyer questions supported.</p><p className="mt-3 text-xs font-semibold text-[#3155d9]">{row.improvedSignals === null ? 'Baseline established' : `${row.improvedSignals} improved · ${row.regressedSignals} regressed`}</p><p className="mt-4 text-sm font-medium text-[#20283a]">{row.nextAction ?? 'Review the latest measurement.'}</p></> : <p className="mt-5 text-sm text-[#596174]">Held from client reporting until the evidence gate passes.</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
