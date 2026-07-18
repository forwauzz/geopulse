/**
 * ScoreReport — redesigned free-scan scorecard (loop-1).
 *
 * MARKETING tone (OSS-REFACTOR-PLAN.md principle 1): plain-language, benefit-led. The
 * technical detail (header names, schema types, exact fixes) lives on each issue and is
 * surfaced in the separate, technical full-audit report — not here.
 *
 * Presentational only: fields map 1:1 to `runFreeScan()` output. The marketing copy layer
 * is `score-report.copy.ts`.
 */
import { MARKETING_CHECKS, MARKETING_PILLARS, marketingVerdict } from './score-report.copy';

export type ReportIssue = {
  check: string;
  checkId: string;
  passed: boolean;
  status: string;
  weight: number;
  category: string;
  finding: string;
  fix?: string;
  confidence?: 'high' | 'medium' | 'low';
};

export type ReportCategoryScore = {
  category: string;
  score: number; // -1 = not measured in the free scan
  letterGrade: string;
  checkCount: number;
};

export type ScoreReportData = {
  domain: string;
  url: string;
  score: number;
  letterGrade: string;
  checkedAt?: string;
  categoryScores: ReportCategoryScore[];
  issues: ReportIssue[];
};

export type ScoreBenchmark = {
  /** % of scanned sites this score is at or above (0-100). */
  percentile: number;
  /** Typical (median) score across scanned sites. */
  median: number;
  /** Top-10% threshold (p90). */
  top10: number;
  /** How many sites the comparison is drawn from. */
  sampleSize: number;
};

const STEPS = [
  { id: 's1', label: 'Your score' },
  { id: 's2', label: 'Where you stand' },
  { id: 's3', label: "What's working" },
  { id: 's4', label: "What's holding you back" },
  { id: 's5', label: 'Your growth plan' },
  { id: 's6', label: 'Go deeper' },
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  ai_readiness: 'travel_explore',
  extractability: 'auto_awesome',
  trust: 'verified',
  demand_coverage: 'campaign',
  conversion_readiness: 'trending_up',
};

// ---- scoring helpers (mirror workers/scan-engine/scoring.ts) ----
function possibleWeight(i: ReportIssue): number {
  if (i.status === 'BLOCKED' || i.status === 'NOT_EVALUATED') return 0;
  if (i.status === 'LOW_CONFIDENCE') return i.weight * 0.5;
  return i.weight;
}
function earnedWeight(i: ReportIssue): number {
  if (i.status === 'BLOCKED' || i.status === 'NOT_EVALUATED') return 0;
  if (i.status === 'LOW_CONFIDENCE') return i.passed ? i.weight * 0.5 : 0;
  if (i.status === 'WARNING' || i.status === 'PASS') return i.weight;
  return 0;
}

function toneText(tone: 'good' | 'warn' | 'crit'): string {
  if (tone === 'good') return 'text-green-700 dark:text-green-300';
  if (tone === 'warn') return 'text-amber-700 dark:text-amber-300';
  return 'text-red-700 dark:text-red-300';
}
function toneRing(tone: 'good' | 'warn' | 'crit'): string {
  if (tone === 'good') return 'stroke-green-600 dark:stroke-green-400';
  if (tone === 'warn') return 'stroke-amber-500 dark:stroke-amber-400';
  return 'stroke-red-600 dark:stroke-red-400';
}
function tonePill(tone: 'good' | 'warn' | 'crit'): string {
  if (tone === 'good') return 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200';
  if (tone === 'warn') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
  return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200';
}
function scoreTone(score: number): 'good' | 'warn' | 'crit' {
  if (score >= 75) return 'good';
  if (score >= 45) return 'warn';
  return 'crit';
}
function barFill(tone: 'good' | 'warn' | 'crit'): string {
  if (tone === 'good') return 'bg-green-600 dark:bg-green-400';
  if (tone === 'warn') return 'bg-amber-500 dark:bg-amber-400';
  return 'bg-red-600 dark:bg-red-400';
}

// LLM checks that failed to fetch the page surface finding === "http_403" etc.
function unevaluated(i: ReportIssue): boolean {
  return i.status === 'LOW_CONFIDENCE' && /^http_\d+$/.test(i.finding.trim());
}
function copyFor(i: ReportIssue) {
  return (
    MARKETING_CHECKS[i.checkId] ?? {
      title: i.check.replace(/\s*\(.*?\)\s*$/, ''),
      problem: i.check.replace(/\s*\(.*?\)\s*$/, ''),
      win: i.finding,
      gap: i.finding,
      action: i.fix ?? 'Review this on your site.',
    }
  );
}

const CIRC = 2 * Math.PI * 86;

export function ScoreReport({
  data,
  legacyPaidEnabled = false,
  deepAuditSlot,
  benchmark,
  competitorSlot,
}: {
  data: ScoreReportData;
  /** OSS default false = full audit is free for everyone. true = steer to Stripe (legacy paid). */
  legacyPaidEnabled?: boolean;
  /** When provided, replaces the default Step-6 CTA card with this node (e.g. the live
   *  checkout flow in results-view). Lets the real paid flow be reused verbatim. */
  deepAuditSlot?: React.ReactNode;
  /** Optional peer comparison ("how you stack up vs sites we've scanned"). */
  benchmark?: ScoreBenchmark;
  /** Optional interactive competitor comparison; replaces the generic peer strip when given. */
  competitorSlot?: React.ReactNode;
}) {
  const { score, letterGrade, domain, url, categoryScores, issues } = data;
  const v = marketingVerdict(score);

  const passed = issues.filter((i) => i.passed);
  const failed = issues.filter((i) => !i.passed && !unevaluated(i));
  const unconfirmed = issues.filter(unevaluated);
  // Confirmed gaps first (ranked by impact), then anything we couldn't check.
  const gaps = [...failed.sort((a, b) => b.weight - a.weight), ...unconfirmed];

  const totalPossible = issues.reduce((s, i) => s + possibleWeight(i), 0) || 1;
  const potentialPts = (i: ReportIssue): number =>
    Math.round(((possibleWeight(i) - earnedWeight(i)) / totalPossible) * 100);

  const measured = categoryScores.filter((c) => c.score >= 0 && c.checkCount > 0);
  const notMeasured = categoryScores.filter((c) => c.score < 0 || c.checkCount === 0);
  const planItems = failed.slice(0, 5);
  const planPotential = planItems.reduce((s, i) => s + potentialPts(i), 0);
  const potential = Math.min(100, score + planPotential);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      {/* Report head */}
      <header className="border-b border-gold/40 pb-6">
        <p className="font-label text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
          AI Visibility Scorecard
        </p>
        <h1 className="mt-2 font-headline text-4xl font-medium tracking-tight text-on-background md:text-5xl">
          {domain}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base text-green-600 dark:text-green-400">lock</span>
          <span className="break-all">{url}</span>
          <span className="text-outline-variant">·</span>
          <span>How AI search sees you today</span>
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[210px_1fr] md:gap-12">
        {/* Sticky step rail */}
        <nav className="hidden md:block" aria-label="Scorecard sections">
          <ol className="sticky top-7 space-y-0.5">
            {STEPS.map((s, idx) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 font-sans text-sm font-medium text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-background"
                >
                  <span className="w-5 text-center font-headline text-gold tabular-nums">{idx + 1}</span>
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          {/* STEP 1 — SCORE */}
          <Step n={1} id="s1" title="Your AI visibility score" blurb="How ready your site is to be found and recommended by AI answer engines.">
            <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr]">
                <div className="flex items-center justify-center border-b border-outline-variant/25 p-8 sm:border-b-0 sm:border-r">
                  <div className="relative h-44 w-44">
                    <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
                      <circle cx="100" cy="100" r="86" fill="none" strokeWidth="14" className="stroke-surface-container" />
                      <circle
                        cx="100" cy="100" r="86" fill="none" strokeWidth="14" strokeLinecap="round"
                        strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - score / 100)}
                        className={toneRing(v.tone)}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-headline text-6xl leading-none tracking-tight text-on-background tabular-nums">{score}</span>
                      <span className="mt-1 font-label text-[0.62rem] uppercase tracking-[0.16em] text-on-surface-variant">out of 100</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-3 p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-md px-2.5 py-1 font-label text-xs font-bold uppercase tracking-wider ${tonePill(v.tone)}`}>
                      Grade {letterGrade}
                    </span>
                  </div>
                  <h3 className={`font-headline text-2xl font-medium leading-tight ${toneText(v.tone)}`}>{v.headline}</h3>
                  <p className="font-headline text-lg leading-relaxed text-on-background">{v.lede}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 border-t border-outline-variant/25">
                <Stat k="Working for you" v={`${passed.length}`} tone="good" />
                <Stat k="To improve" v={`${failed.length}`} tone="warn" border />
                <Stat k="Couldn't check" v={`${unconfirmed.length}`} tone="muted" />
              </div>
            </div>
            {competitorSlot ?? (benchmark && benchmark.sampleSize >= 20 ? (
              <PeerStrip score={score} benchmark={benchmark} />
            ) : null)}
          </Step>

          {/* STEP 2 — PILLARS */}
          <Step n={2} id="s2" title="Where you stand" blurb="Your score comes from five things AI cares about. The free scan covers three; the full report adds the last two.">
            <div className="space-y-3">
              {measured.map((c) => {
                const tone = scoreTone(c.score);
                const p = MARKETING_PILLARS[c.category] ?? { label: c.category, blurb: '' };
                return (
                  <div key={c.category} className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4 md:p-5">
                    <div className="flex items-center gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
                        <span className="material-symbols-outlined">{CATEGORY_ICONS[c.category]}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-sans font-semibold text-on-background">{p.label}</span>
                          <span className={`font-headline text-2xl tabular-nums ${toneText(tone)}`}>{c.score}</span>
                        </div>
                        <p className="mt-0.5 font-sans text-xs text-on-surface-variant">{p.blurb}</p>
                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
                          <span className={`block h-full rounded-full ${barFill(tone)}`} style={{ width: `${c.score}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {notMeasured.map((c) => {
                const p = MARKETING_PILLARS[c.category] ?? { label: c.category, blurb: '' };
                return (
                  <div key={c.category} className="flex items-center gap-4 rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 p-4 md:p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant">
                      <span className="material-symbols-outlined">{CATEGORY_ICONS[c.category]}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-sans font-semibold text-on-background">{p.label}</span>
                      <p className="mt-0.5 font-sans text-xs text-on-surface-variant">{p.blurb}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-gold/60 px-2 py-1 font-label text-[0.6rem] font-bold uppercase tracking-wider text-gold">
                      Full report
                    </span>
                  </div>
                );
              })}
            </div>
          </Step>

          {/* STEP 3 — STRENGTHS */}
          <Step n={3} id="s3" title="What's already working for you" blurb={`${passed.length} things are helping AI find and trust you. Keep them.`}>
            <div className="flex flex-wrap gap-2.5">
              {passed.map((i) => (
                <span key={i.checkId} className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 font-sans text-sm font-medium text-green-800 dark:bg-green-500/10 dark:text-green-200">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  {copyFor(i).title}
                </span>
              ))}
            </div>
          </Step>

          {/* STEP 4 — GAPS */}
          <Step n={4} id="s4" title="What's holding you back" blurb="The things most likely to keep you out of AI answers, biggest first.">
            <div className="space-y-3">
              {gaps.map((i, idx) => {
                const c = copyFor(i);
                const isUnconf = unevaluated(i);
                const impact = i.weight >= 6 ? 'Big impact' : 'Worth doing';
                return (
                  <div key={i.checkId} className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4 shadow-float md:p-5">
                    <div className="flex gap-4">
                      <span className="font-headline text-2xl leading-none text-outline-variant/50 tabular-nums">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-sans font-semibold text-on-background">{isUnconf ? c.title : c.problem}</span>
                          {isUnconf ? (
                            <span className="rounded px-1.5 py-0.5 font-label text-[0.6rem] font-bold uppercase tracking-wider text-on-surface-variant ring-1 ring-outline-variant/40">Couldn't check</span>
                          ) : (
                            <span className={`rounded px-1.5 py-0.5 font-label text-[0.6rem] font-bold uppercase tracking-wider ${i.weight >= 6 ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}>{impact}</span>
                          )}
                        </div>
                        <p className="mt-1.5 font-sans text-sm text-on-surface-variant">
                          {isUnconf ? 'Your site blocked our scanner, so we couldn’t confirm this one — worth a manual look.' : c.gap}
                        </p>
                        {!isUnconf ? (
                          <p className="mt-2.5 flex items-start gap-2 rounded-r-lg border-l-2 border-gold bg-surface-container-low px-3 py-2 font-sans text-sm text-on-background/90">
                            <span className="material-symbols-outlined text-base text-gold">arrow_forward</span>
                            <span>{c.action}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Step>

          {/* STEP 5 — GROWTH PLAN */}
          <Step n={5} id="s5" title="Your growth plan" blurb="Do these in order. Each one lifts your score — the numbers show how much.">
            {planPotential > 0 ? (
              <div className="mb-5 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-float md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-headline text-lg text-on-background">
                    Finish your plan and you could reach{' '}
                    <span className="font-medium text-green-700 dark:text-green-300">{potential}</span> out of 100
                  </p>
                  <span className="font-label text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-300">
                    +{planPotential} points within reach
                  </span>
                </div>
                {/* current score → potential projection */}
                <div className="relative mt-4 h-4 overflow-hidden rounded-full bg-surface-container" role="img"
                  aria-label={`Current score ${score}, potential ${potential} out of 100 after completing the plan`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${score}%` }} />
                  <div
                    className="absolute inset-y-0 bg-green-500/35 dark:bg-green-400/30"
                    style={{
                      left: `${score}%`,
                      width: `${potential - score}%`,
                      backgroundImage:
                        'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,.35) 5px, rgba(255,255,255,.35) 10px)',
                    }}
                  />
                </div>
                <div className="relative mt-2 h-4 font-label text-[0.68rem] tabular-nums">
                  <span className="absolute -translate-x-1/2 text-on-surface-variant" style={{ left: `${score}%` }}>{score} now</span>
                  <span className="absolute -translate-x-1/2 font-semibold text-green-700 dark:text-green-300" style={{ left: `${potential}%` }}>{potential} target</span>
                </div>
              </div>
            ) : null}
            <ol className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
              {planItems.map((i, idx) => {
                const c = copyFor(i);
                const pts = potentialPts(i);
                return (
                  <li key={i.checkId} className="flex items-center gap-4 border-b border-outline-variant/20 px-5 py-4 last:border-b-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-headline text-sm text-on-primary">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-sm font-semibold text-on-background">{c.action}</p>
                    </div>
                    {pts > 0 ? (
                      <span className="shrink-0 font-label text-xs font-bold text-green-700 dark:text-green-300">+{pts} pts</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Step>

          {/* STEP 6 — FULL REPORT (free by default; steers to Stripe when legacy paid is on) */}
          <Step n={6} id="s6" title="Go deeper — the full report" blurb="A complete, page-by-page audit of your whole site with exact, technical fixes.">
            {deepAuditSlot ?? (
            <div className="rounded-2xl border border-outline-variant/25 bg-gradient-to-b from-surface-container to-surface-container-lowest p-7 shadow-float md:p-8">
              {legacyPaidEnabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-container-high px-2.5 py-1 font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">history</span>Legacy — paid
                </span>
              ) : (
                <span className="inline-block rounded-md bg-green-100 px-2.5 py-1 font-label text-[0.62rem] font-bold uppercase tracking-widest text-green-800 dark:bg-green-500/15 dark:text-green-200">
                  Free &amp; open source
                </span>
              )}
              <h3 className="mt-3 font-headline text-2xl font-medium text-on-background">Get the full site report</h3>
              <p className="mt-2 max-w-prose font-sans text-sm text-on-surface-variant">
                This scan looked at one page. The full report checks your whole site, scores all five
                areas — including <span className="font-semibold text-on-background">showing up in answers</span> and{' '}
                <span className="font-semibold text-on-background">turning visits into customers</span> — and hands you
                a clear, prioritized to-do list.
                {legacyPaidEnabled ? ' (Paid mode is on — checkout runs through Stripe.)' : ' Free for everyone, no account wall.'}
              </p>
              <ul className="mt-4 space-y-2 font-sans text-sm text-on-surface-variant">
                {['Every important page checked, not just this one',
                  'All five areas scored, including the two above',
                  'A prioritized action list you can hand off'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="font-bold text-gold">›</span>{t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim">
                  {legacyPaidEnabled ? 'Unlock full report' : 'Get my full report'}
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
                <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-5 py-3 font-sans text-sm font-semibold text-on-background transition hover:bg-surface-container-low">
                  Share this scorecard
                </button>
              </div>
            </div>
            )}
          </Step>
        </div>
      </div>
    </div>
  );
}

function Step({ n, id, title, blurb, children }: { n: number; id: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <div className="mb-5 flex items-baseline gap-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold font-headline text-sm text-gold tabular-nums">{n}</span>
        <div>
          <h2 className="font-headline text-2xl font-medium text-on-background">{title}</h2>
          <p className="mt-0.5 font-sans text-sm text-on-surface-variant">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function PeerStrip({ score, benchmark }: { score: number; benchmark: ScoreBenchmark }) {
  const tone = scoreTone(score);
  const { percentile, median, top10, sampleSize } = benchmark;
  const beat = Math.max(0, Math.min(100, Math.round(percentile)));
  const headline =
    beat >= 90
      ? "You're in the top 10% of sites we've scanned"
      : beat >= 50
        ? `You're ahead of ${beat}% of sites we've scanned`
        : `${100 - beat}% of sites we've scanned do better — room to climb`;
  const dot =
    tone === 'good' ? 'bg-green-600 dark:bg-green-400'
    : tone === 'warn' ? 'bg-amber-500 dark:bg-amber-400'
    : 'bg-red-600 dark:bg-red-400';
  const clamp = (n: number) => Math.max(4, Math.min(96, n));
  return (
    <div className="mt-4 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-float md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-headline text-lg text-on-background">{headline}</p>
        <span className="font-label text-[0.62rem] uppercase tracking-[0.13em] text-on-surface-variant">
          vs {sampleSize} sites scanned
        </span>
      </div>
      {/* You label */}
      <div className="relative mb-1 mt-4 h-4">
        <span className="absolute -translate-x-1/2 font-label text-[0.62rem] font-bold uppercase tracking-wide text-on-background tabular-nums" style={{ left: `${clamp(score)}%` }}>
          You · {score}
        </span>
      </div>
      {/* distribution bar with ticks + you-dot */}
      <div className="relative h-2 rounded-full bg-surface-container">
        <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-outline-variant" style={{ left: `${median}%` }} aria-hidden />
        <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-gold" style={{ left: `${top10}%` }} aria-hidden />
        <span className={`absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-container-lowest ${dot}`} style={{ left: `${score}%` }} aria-hidden />
      </div>
      <div className="relative mt-2 h-4 font-label text-[0.6rem] uppercase tracking-wide text-on-surface-variant tabular-nums">
        <span className="absolute -translate-x-1/2" style={{ left: `${clamp(median)}%` }}>Typical · {median}</span>
        <span className="absolute -translate-x-1/2 text-gold" style={{ left: `${clamp(top10)}%` }}>Top 10% · {top10}</span>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, border, tone = 'default' }: { k: string; v: string; sub?: string; border?: boolean; tone?: 'good' | 'warn' | 'muted' | 'default' }) {
  const vColor =
    tone === 'good' ? 'text-green-700 dark:text-green-300'
    : tone === 'warn' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'muted' ? 'text-on-surface-variant'
    : 'text-on-background';
  return (
    <div className={`px-5 py-4 ${border ? 'border-x border-outline-variant/25' : ''}`}>
      <p className="font-label text-[0.62rem] uppercase tracking-[0.13em] text-on-surface-variant">{k}</p>
      <p className={`mt-1 font-headline text-2xl tabular-nums ${vColor}`}>
        {v}
        {sub ? <span className="ml-1 font-sans text-sm font-medium text-on-surface-variant">{sub}</span> : null}
      </p>
    </div>
  );
}
