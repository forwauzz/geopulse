'use client';

/**
 * Presentation-grade history charts (issue #133). These mirror the report engine's visual idioms —
 * grade bands, the score gauge tone language, honest not-tested gaps — so the dashboard and the PDF
 * read as one system. Every chart renders a null score as a GAP (a hollow "not tested" marker on the
 * axis), never a zero, because a 0 reads as "terrible" when the truth is "we could not measure."
 */

import { useState } from 'react';
import type {
  CategoryTrend,
  RunDelta,
  ScoreTimePoint,
} from '@/lib/server/dashboard-history-charts';

// ── Shared scales / tone language (kept in step with the report + overview cards) ──────────────

/** Grade bands drawn behind the score line. Subtle tints — the line itself carries the accent. */
const GRADE_BANDS: ReadonlyArray<{ min: number; max: number; grade: string; fill: string }> = [
  { min: 90, max: 100, grade: 'A', fill: 'fill-green-500/10 dark:fill-green-400/10' },
  { min: 80, max: 90, grade: 'B', fill: 'fill-tertiary/10' },
  { min: 70, max: 80, grade: 'C', fill: 'fill-warning/10' },
  { min: 60, max: 70, grade: 'D', fill: 'fill-warning/15' },
  { min: 0, max: 60, grade: 'F', fill: 'fill-error/10' },
];

/** Distinct-but-restrained strokes for category trend lines. */
const TREND_STROKES: readonly string[] = [
  'stroke-primary',
  'stroke-tertiary',
  'stroke-green-600 dark:stroke-green-400',
  'stroke-warning',
  'stroke-error',
];
const TREND_DOTS: readonly string[] = [
  'fill-primary',
  'fill-tertiary',
  'fill-green-600 dark:fill-green-400',
  'fill-warning',
  'fill-error',
];
// Legend swatches — literal bg-* classes (Tailwind's scanner can't see runtime-built class names).
const TREND_LEGEND: readonly string[] = [
  'bg-primary',
  'bg-tertiary',
  'bg-green-600 dark:bg-green-400',
  'bg-warning',
  'bg-error',
];

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Split an indexed series into contiguous runs of non-null values (for gap-aware line drawing). */
function segmentsOf<T>(values: ReadonlyArray<T | null>): Array<Array<{ i: number; v: T }>> {
  const segments: Array<Array<{ i: number; v: T }>> = [];
  let current: Array<{ i: number; v: T }> = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, v });
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

// ── Score over time — area chart with grade bands ──────────────────────────────────────────────

export function ScoreOverTimeChart({
  points,
  height = 220,
}: {
  points: readonly ScoreTimePoint[];
  height?: number;
}) {
  const W = 720;
  const H = height;
  const padL = 34;
  const padR = 14;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = points.length;
  const xFor = (i: number) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const yFor = (score: number) => padT + (1 - Math.max(0, Math.min(100, score)) / 100) * plotH;

  const scores = points.map((p) => p.score);
  const segments = segmentsOf(scores);
  const lastTested = [...points].reverse().find((p) => p.score !== null);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Score over ${n} audits${lastTested ? `, latest ${lastTested.score} out of 100` : ''}`}
        preserveAspectRatio="none"
      >
        {/* Grade bands */}
        {GRADE_BANDS.map((band) => {
          const yTop = yFor(band.max);
          const yBottom = yFor(band.min);
          return (
            <g key={band.grade}>
              <rect x={padL} y={yTop} width={plotW} height={Math.max(0, yBottom - yTop)} className={band.fill} />
              <text
                x={padL - 6}
                y={(yTop + yBottom) / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-on-surface-variant/60 font-sans text-[9px] font-semibold"
              >
                {band.grade}
              </text>
            </g>
          );
        })}

        {/* Area fills + line per contiguous segment (gaps left blank) */}
        {segments.map((seg) => {
          const line = seg
            .map((pt, k) => `${k === 0 ? 'M' : 'L'}${xFor(pt.i).toFixed(1)},${yFor(pt.v).toFixed(1)}`)
            .join(' ');
          const first = seg[0];
          const last = seg[seg.length - 1];
          if (!first || !last) return null;
          const area = `${line} L${xFor(last.i).toFixed(1)},${(padT + plotH).toFixed(1)} L${xFor(first.i).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
          const key = `${first.i}-${last.i}`;
          return (
            <g key={key}>
              <path d={area} className="fill-primary/10" />
              <path
                d={line}
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              />
              {seg.map((pt) => (
                <circle key={pt.i} cx={xFor(pt.i)} cy={yFor(pt.v)} r="3.5" className="fill-primary" />
              ))}
            </g>
          );
        })}

        {/* Not-tested markers: hollow amber rings on the baseline — an explicit gap, not a 0 */}
        {points.map((p, i) =>
          p.score === null ? (
            <g key={`nt-${p.scanId}`}>
              <circle
                cx={xFor(i)}
                cy={padT + plotH}
                r="4"
                className="fill-surface-container-lowest stroke-warning"
                strokeWidth="1.5"
              >
                <title>Not tested — {formatShortDate(p.date)}</title>
              </circle>
            </g>
          ) : null
        )}

        {/* X axis date labels — thinned to avoid crowding */}
        {points.map((p, i) => {
          const showEvery = Math.ceil(n / 8);
          if (i % showEvery !== 0 && i !== n - 1) return null;
          return (
            <text
              key={`x-${p.scanId}`}
              x={xFor(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-on-surface-variant/70 font-sans text-[9px]"
            >
              {formatShortDate(p.date)}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}

// ── Category trends — multi-line ────────────────────────────────────────────────────────────────

export function CategoryTrendChart({ trends, height = 200 }: { trends: readonly CategoryTrend[]; height?: number }) {
  const W = 720;
  const H = height;
  const padL = 30;
  const padR = 14;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = trends[0]?.points.length ?? 0;

  const xFor = (i: number) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const yFor = (score: number) => padT + (1 - Math.max(0, Math.min(100, score)) / 100) * plotH;

  if (n === 0) return null;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Category scores over time" preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} y1={yFor(g)} x2={W - padR} y2={yFor(g)} className="stroke-outline-variant/20" strokeWidth="1" />
            <text x={padL - 5} y={yFor(g)} textAnchor="end" dominantBaseline="middle" className="fill-on-surface-variant/50 font-sans text-[8px]">
              {g}
            </text>
          </g>
        ))}
        {trends.map((trend, idx) => {
          const stroke = TREND_STROKES[idx % TREND_STROKES.length];
          const dot = TREND_DOTS[idx % TREND_DOTS.length];
          const segments = segmentsOf(trend.points.map((p) => p.score));
          return (
            <g key={trend.category}>
              {segments.map((seg) => {
                const first = seg[0];
                const last = seg[seg.length - 1];
                if (!first || !last) return null;
                const line = seg
                  .map((pt, k) => `${k === 0 ? 'M' : 'L'}${xFor(pt.i).toFixed(1)},${yFor(pt.v).toFixed(1)}`)
                  .join(' ');
                return (
                  <path
                    key={`${trend.category}-${first.i}`}
                    d={line}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={stroke}
                  />
                );
              })}
              {trend.points.map((pt, i) =>
                pt.score !== null ? <circle key={i} cx={xFor(i)} cy={yFor(pt.score)} r="2.5" className={dot} /> : null
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {trends.map((trend, idx) => (
          <span key={trend.category} className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span
              className={`h-2 w-2 rounded-full ${TREND_LEGEND[idx % TREND_LEGEND.length] ?? 'bg-primary'}`}
              aria-hidden
            />
            {trend.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// ── Run deltas — before/after ───────────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warning/20 px-2 py-0.5 text-xs font-semibold text-on-background">
        <span className="material-symbols-outlined text-[13px]" aria-hidden>help</span>
        Not tested
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
        No change
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
        up ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200' : 'bg-error/15 text-error'
      }`}
    >
      <span className="material-symbols-outlined text-[13px]" aria-hidden>
        {up ? 'trending_up' : 'trending_down'}
      </span>
      {up ? '+' : ''}
      {delta}
    </span>
  );
}

export function RunDeltaList({ deltas }: { deltas: readonly RunDelta[] }) {
  if (deltas.length === 0) {
    return <p className="text-sm text-on-surface-variant">Run a second audit to see run-over-run movement.</p>;
  }
  return (
    <ul className="divide-y divide-outline-variant/15">
      {deltas.slice(0, 8).map((d) => (
        <li key={d.scanId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-background">{formatShortDate(d.date)}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant tabular-nums">
              {d.previousScore ?? '—'} → {d.score ?? '—'}
            </p>
          </div>
          <DeltaBadge delta={d.delta} />
        </li>
      ))}
    </ul>
  );
}

// ── Composed history section, with present mode ────────────────────────────────────────────────

export type DashboardHistoryChartsData = {
  readonly timeline: readonly ScoreTimePoint[];
  readonly deltas: readonly RunDelta[];
  readonly categoryTrends: readonly CategoryTrend[];
  readonly scoredRunCount: number;
};

export function DashboardHistoryChartsSection({
  domain,
  data,
}: {
  domain: string;
  data: DashboardHistoryChartsData;
}) {
  const [presenting, setPresenting] = useState(false);

  if (data.scoredRunCount < 2) {
    return (
      <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
        <h2 className="font-headline text-xl font-bold text-on-background">History charts</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Run at least two gradeable audits to unlock the score-over-time chart, category trends, and run-over-run
          deltas.
        </p>
      </section>
    );
  }

  const lastTested = [...data.timeline].reverse().find((p) => p.score !== null);

  return (
    <section
      className={
        presenting
          ? 'fixed inset-0 z-50 overflow-y-auto bg-surface p-6 sm:p-10'
          : 'rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6'
      }
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">AI visibility over time</p>
            <h2 className={`mt-1 font-headline font-bold text-on-background ${presenting ? 'text-3xl sm:text-5xl' : 'text-xl'}`}>
              {domain}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {data.scoredRunCount} gradeable audits{lastTested ? ` · latest ${lastTested.score}/100` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPresenting((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              {presenting ? 'close_fullscreen' : 'present_to_all'}
            </span>
            {presenting ? 'Exit present mode' : 'Present'}
          </button>
        </div>

        <div className={`mt-6 grid gap-6 ${presenting ? 'lg:grid-cols-1' : 'lg:grid-cols-3'}`}>
          <div className={presenting ? '' : 'lg:col-span-2'}>
            <h3 className="mb-2 font-headline text-sm font-semibold text-on-background">Score over time</h3>
            <ScoreOverTimeChart points={data.timeline} height={presenting ? 380 : 240} />
          </div>
          <div>
            <h3 className="mb-2 font-headline text-sm font-semibold text-on-background">Run-over-run</h3>
            <RunDeltaList deltas={data.deltas} />
          </div>
        </div>

        {data.categoryTrends.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-2 font-headline text-sm font-semibold text-on-background">Category trends</h3>
            <CategoryTrendChart trends={data.categoryTrends} height={presenting ? 320 : 220} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
