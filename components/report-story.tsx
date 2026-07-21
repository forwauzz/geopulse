'use client';

import { buildReportStoryData, type CheckOutcome, type ReportStoryData } from '@/lib/client/report-story-data';
import type { ScanResponse } from '@/lib/client/report-viewer';

/**
 * The report's opening act: a marketing-grade data story built from real audit numbers. Charts
 * follow the house dataviz rules — status colors always ship with an icon or label (never color
 * alone), values render in text ink, and every number on screen is derived in
 * `report-story-data.ts` where it is unit-tested.
 */

const OUTCOME_TONE: Record<CheckOutcome, { swatch: string; chip: string; icon: string }> = {
  passed: {
    swatch: 'fill-green-600 dark:fill-green-400',
    chip: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200',
    icon: 'check_circle',
  },
  warning: { swatch: 'fill-warning', chip: 'bg-warning/20 text-on-background', icon: 'error' },
  failed: { swatch: 'fill-error', chip: 'bg-error/15 text-error', icon: 'cancel' },
};

function toneBar(tone: 'good' | 'ok' | 'warn' | 'bad'): string {
  if (tone === 'good') return 'bg-green-600 dark:bg-green-400';
  if (tone === 'ok') return 'bg-tertiary';
  if (tone === 'warn') return 'bg-warning';
  return 'bg-error';
}

function scoreRingTone(score: number): string {
  if (score >= 80) return 'stroke-green-600 dark:stroke-green-400';
  if (score >= 60) return 'stroke-tertiary';
  if (score >= 40) return 'stroke-warning';
  return 'stroke-error';
}

function ScoreDial({ score, grade }: { score: number; grade: string }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 144 144" className="h-36 w-36 -rotate-90" aria-hidden>
        <circle cx="72" cy="72" r={radius} fill="none" strokeWidth="10" className="stroke-surface-container-high" />
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={scoreRingTone(score)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans text-4xl font-black tabular-nums text-on-background">{score}</span>
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">/100 · {grade}</span>
      </div>
    </div>
  );
}

/** Donut of check outcomes, with a 2px surface gap between slices and a center count. */
function OutcomeDonut({ story }: { story: ReportStoryData }) {
  const size = 132;
  const radius = 48;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
          {story.outcomes
            .filter((slice) => slice.count > 0)
            .map((slice) => {
              const length = Math.max(0, slice.share * circumference - gap);
              const dashArray = `${length} ${circumference - length}`;
              const dashOffset = -offset;
              offset += slice.share * circumference;
              return (
                <circle
                  key={slice.outcome}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={stroke}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className={OUTCOME_TONE[slice.outcome].swatch.replace('fill-', 'stroke-')}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-sans text-2xl font-black tabular-nums text-on-background">
            {story.passedChecks}/{story.totalChecks}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">passing</span>
        </div>
      </div>
      <ul className="space-y-2">
        {story.outcomes.map((slice) => (
          <li key={slice.outcome} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${OUTCOME_TONE[slice.outcome].chip}`}
            >
              <span className="material-symbols-outlined text-[13px]" aria-hidden>
                {OUTCOME_TONE[slice.outcome].icon}
              </span>
              {slice.label}
            </span>
            <span className="font-sans font-bold tabular-nums text-on-background">{slice.count}</span>
            <span className="text-xs text-on-surface-variant">({Math.round(slice.share * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportStory({ scan }: { scan: ScanResponse }) {
  const story = buildReportStoryData(scan);
  if (!story) return null;

  return (
    <section data-testid="report-story" className="space-y-6">
      {/* Act 1 — where you stand */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-float md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <ScoreDial score={story.score} grade={story.grade} />
          <div className="min-w-0">
            <p className="font-label text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              AI search readiness · {scan.domain ?? scan.url}
            </p>
            <h1 className="mt-2 font-sans text-3xl font-black leading-tight tracking-tight text-on-background md:text-4xl">
              {story.headline}
            </h1>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">{story.subline}</p>
            {story.projectedScore !== null ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2 text-sm text-on-background">
                <span className="material-symbols-outlined text-base text-primary" aria-hidden>trending_up</span>
                Fix the plan below and this score can reach
                <span className="font-sans font-black tabular-nums">{story.projectedScore}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Act 2 — the shape of the problem */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
          <h2 className="font-headline text-sm font-semibold text-on-background">Checks at a glance</h2>
          <div className="mt-4">
            <OutcomeDonut story={story} />
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
          <h2 className="font-headline text-sm font-semibold text-on-background">Where the score comes from</h2>
          <ul className="mt-4 space-y-3">
            {story.categories.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-on-background">{row.label}</span>
                  <span className="font-sans font-bold tabular-nums text-on-background">
                    {row.score}
                    <span className="ml-1 text-xs font-semibold text-on-surface-variant">{row.letterGrade}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-container-high">
                  <div className={`h-full rounded-full ${toneBar(row.tone)}`} style={{ width: `${row.score}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-on-surface-variant">{row.checkCount} checks</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Act 3 — the plan, ordered by impact */}
      {story.actions.length > 0 ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-headline text-sm font-semibold text-on-background">Your action plan, biggest wins first</h2>
            <p className="text-xs text-on-surface-variant">Bar length = how much each fix moves your score</p>
          </div>
          <ol className="mt-4 space-y-4">
            {story.actions.map((action, index) => (
              <li key={action.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-background">{action.title}</p>
                  {action.fix ? (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">{action.fix}</p>
                  ) : null}
                  <div className="mt-1.5 h-1.5 max-w-md overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(8, Math.round(action.impact * 100))}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
