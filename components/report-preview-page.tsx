'use client';

import { sectionRenderState, type ReportSectionKey, type ReportSettings } from '@/lib/server/report-settings';
import type { ReportPreviewPayload } from '@/lib/server/report-preview-payload';

/**
 * A page-shaped rendering of the client-facing report, driven by the same settings the checklist
 * writes. This is a mirror of the PDF layout, not a summary of it: turning a section off removes
 * that part of a real-looking page, so the effect of a toggle is legible without generating
 * anything.
 *
 * Fidelity caveat: this is a second renderer over the same content model, so it can drift from the
 * PDF. The "exact PDF" action is the authority; this is the live view.
 */

function grade(score: number | null): string {
  if (score === null) return '—';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function Section({
  id,
  title,
  state,
  emptyNote,
  children,
}: {
  readonly id: ReportSectionKey;
  readonly title: string;
  readonly state: 'render' | 'empty' | 'hidden';
  readonly emptyNote?: string;
  readonly children?: React.ReactNode;
}) {
  if (state === 'hidden') return null;
  return (
    <div
      data-testid={`preview-${id}`}
      data-state={state}
      className="border-t border-outline-variant/25 pt-2.5 first:border-t-0 first:pt-0"
    >
      <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">{title}</p>
      {state === 'empty' ? (
        <div className="mt-1.5 rounded border border-dashed border-outline-variant/70 px-2 py-2 text-center text-[8px] leading-snug text-on-surface-variant">
          {emptyNote ?? 'On, but no data for this period yet'}
        </div>
      ) : (
        <div className="mt-1.5">{children}</div>
      )}
    </div>
  );
}

export function ReportPreviewPage({
  payload,
  settings,
  brandName,
  brandColor,
}: {
  readonly payload: ReportPreviewPayload | null;
  readonly settings: ReportSettings;
  readonly brandName: string;
  readonly brandColor: string;
}) {
  if (!payload) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest p-6 text-center">
        <p className="text-[11px] font-semibold text-on-background">Nothing measured yet</p>
        <p className="mt-1 text-[10px] leading-snug text-on-surface-variant">
          This client has no stored scan or measurement, so there is nothing to preview.
        </p>
      </div>
    );
  }

  const s = settings.sections;
  const st = (key: ReportSectionKey, hasData: boolean) => sectionRenderState(s[key], hasData);
  // Enabled is what the agency chose; measured is whether a run produced a figure. The scope line
  // lists everything enabled — an engine measured at 0% is still measured, and saying "no engines
  // selected" when five are ticked is simply wrong. Only the charts drop unmeasured engines.
  const enabledEngines = payload.engines.filter(
    (engine) => settings.engines[engine.key as keyof typeof settings.engines] !== false
  );
  const engines = enabledEngines.filter((engine) => engine.measured);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm" data-testid="preview-page">
      <div className="h-[5px]" style={{ background: brandColor }} />
      <div className="space-y-2.5 p-3.5">
        {/* masthead */}
        <div className="flex items-center justify-between">
          <span className="font-headline text-[9.5px] font-semibold tracking-[0.16em] text-black">
            {brandName.toUpperCase()}
          </span>
          <span className="text-[7.5px] text-on-surface-variant">{payload.period}</span>
        </div>
        <p className="font-headline text-[15px] font-semibold leading-tight text-black">{payload.domain}</p>
        {payload.topic ? (
          <p className="text-[8px] leading-snug text-on-surface-variant">
            {payload.topic}
            {payload.location ? ` · ${payload.location}` : ''}
          </p>
        ) : null}

        {/* scope — locked on */}
        <div
          data-testid="preview-scopeStatement"
          data-state="render"
          className="rounded border border-dashed border-outline-variant/60 bg-surface-container-low px-2 py-1.5 text-[7.5px] leading-relaxed text-on-surface-variant"
        >
          <b className="text-black">Scope</b> —{' '}
          {enabledEngines.length > 0
            ? enabledEngines.map((e) => e.label).join(', ')
            : 'no engines selected'}
          {payload.questionsTracked ? ` · ${payload.questionsTracked} questions` : ''}
          {payload.trackedSince ? ` · since ${payload.trackedSince}` : ''}
        </div>

        <Section id="executiveSummary" title="Executive summary" state={st('executiveSummary', true)}>
          <div className="space-y-1">
            <div className="h-1 w-full rounded bg-surface-container" />
            <div className="h-1 w-[88%] rounded bg-surface-container" />
          </div>
        </Section>

        <Section id="readinessScore" title="Readiness" state={st('readinessScore', payload.readinessScore !== null)}>
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-[17px] font-semibold text-black">{payload.readinessScore ?? '—'}</span>
            <span className="text-[8px] text-on-surface-variant">/100</span>
            <span className="rounded bg-surface-container px-1.5 py-0.5 text-[7.5px] font-bold text-on-surface-variant">
              {grade(payload.readinessScore)}
            </span>
          </div>
        </Section>

        <Section
          id="categoryBreakdown"
          title="Category breakdown"
          state={st('categoryBreakdown', payload.categories.length > 0)}
        >
          <div className="space-y-1.5">
            {payload.categories.map((cat) => (
              <div key={cat.key} className="flex items-center gap-2">
                <span className="w-[62px] shrink-0 text-[7.5px] font-semibold text-black">{cat.label}</span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-container">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(2, cat.score)}%`,
                      background: cat.score >= 70 ? '#1baf7a' : '#c2504d',
                    }}
                  />
                </span>
                <span className="w-[34px] text-right text-[8px] font-bold text-black">{cat.score}</span>
                {cat.earnedWeight !== null && cat.totalWeight !== null ? (
                  <span className="w-[46px] text-right text-[7px] text-on-surface-variant">
                    {cat.earnedWeight}/{cat.totalWeight}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="holdingScoreDown"
          title="What's holding the score down"
          state={st('holdingScoreDown', payload.issues.length > 0)}
        >
          <ul className="space-y-1">
            {payload.issues.map((issue) => (
              <li key={issue} className="text-[7.5px] leading-snug text-black">
                • {issue.length > 82 ? `${issue.slice(0, 82)}…` : issue}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="crawlDetail" title="Crawl and access detail" state={st('crawlDetail', true)}>
          <div className="h-1 w-[60%] rounded bg-surface-container" />
        </Section>

        <Section
          id="combinedVisibility"
          title="Combined visibility"
          state={st('combinedVisibility', engines.length > 0)}
        >
          <span
            className="font-headline text-[17px] font-semibold"
            style={{ color: payload.combinedVisibilityPct > 0 ? brandColor : '#c2504d' }}
          >
            {payload.combinedVisibilityPct}%
          </span>
        </Section>

        <Section id="perEngineBreakdown" title="By answer engine" state={st('perEngineBreakdown', engines.length > 0)}>
          <div className="space-y-1.5">
            {engines.map((engine) => (
              <div key={engine.key} className="flex items-center gap-2">
                <span className="w-[52px] shrink-0 text-[7.5px] font-semibold text-black">{engine.label}</span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-container">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${engine.visibilityPct}%`, background: brandColor }}
                  />
                </span>
                <span className="w-[30px] text-right text-[7.5px] font-semibold text-black">
                  {engine.visibilityPct}%
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="namedVsLinked" title="Named vs linked" state={st('namedVsLinked', true)}>
          <div className="flex gap-1.5">
            {[
              { label: 'mentions', value: payload.brandMentions },
              { label: 'citations', value: payload.siteCitations },
            ].map((tile) => (
              <div key={tile.label} className="flex-1 rounded border border-outline-variant/40 py-1.5 text-center">
                <div className="font-headline text-[12px] font-semibold text-black">{tile.value}</div>
                <div className="text-[6.5px] text-on-surface-variant">{tile.label}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="questionByQuestion"
          title="Question-by-question"
          state={st('questionByQuestion', payload.questionsTracked > 0)}
        >
          <div className="space-y-1">
            <div className="h-1 w-full rounded bg-surface-container" />
            <div className="h-1 w-[94%] rounded bg-surface-container" />
            <div className="h-1 w-[97%] rounded bg-surface-container" />
          </div>
        </Section>

        <Section
          id="averagePosition"
          title="Average position when cited"
          state={st('averagePosition', payload.hasAveragePosition)}
          emptyNote="On — recorded from the first site citation"
        >
          <span className="font-headline text-[13px] font-semibold text-black">—</span>
        </Section>

        <Section
          id="whoIsWinning"
          title="Who is winning"
          state={st('whoIsWinning', payload.competitors.length > 0)}
          emptyNote="On — competitor co-citations not stored for this period"
        >
          <div className="h-1 w-[64%] rounded" style={{ background: '#eb6834' }} />
        </Section>

        <Section
          id="shareOfAnswers"
          title="Share of answers"
          state={st('shareOfAnswers', payload.shareOfAnswersPct !== null)}
        >
          <span className="font-headline text-[13px] font-semibold text-black">{payload.shareOfAnswersPct}%</span>
        </Section>

        <Section
          id="trackedCompetitorSet"
          title="Tracked competitive set"
          state={st('trackedCompetitorSet', payload.competitorSet.length > 0)}
        >
          <div className="flex flex-wrap gap-1">
            {payload.competitorSet.slice(0, 4).map((domain) => (
              <span
                key={domain}
                className="rounded-full bg-surface-container px-1.5 py-0.5 text-[6.5px] text-on-surface-variant"
              >
                {domain}
              </span>
            ))}
          </div>
        </Section>

        <Section
          id="trendOverTime"
          title="Trend over time"
          state={st('trendOverTime', payload.hasTrend)}
          emptyNote="On — needs a second comparable period"
        >
          <div className="h-6 w-full rounded bg-surface-container" />
        </Section>

        <Section id="whatWeAreDoingNext" title="What we're doing next" state={st('whatWeAreDoingNext', true)}>
          <div className="space-y-1">
            <div className="h-1 w-[90%] rounded bg-surface-container" />
            <div className="h-1 w-[82%] rounded bg-surface-container" />
          </div>
        </Section>

        <div
          data-testid="preview-methodology"
          data-state="render"
          className="border-t border-outline-variant/25 pt-2.5"
        >
          <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
            Methodology and definitions
          </p>
          <div className="mt-1.5 h-1 w-full rounded bg-surface-container" />
        </div>

        <div className="flex justify-end border-t border-outline-variant/30 pt-1.5">
          <span className="text-[6.5px] text-on-surface-variant">Measurement by GEO-Pulse</span>
        </div>
      </div>
    </div>
  );
}
