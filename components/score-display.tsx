'use client';

type Issue = {
  check?: string;
  checkId?: string;
  finding?: string;
  fix?: string;
  weight?: number;
  passed?: boolean;
  status?: string;
  category?: string;
  confidence?: string;
};

type CategoryScoreData = {
  category: string;
  score: number;
  letterGrade: string;
  checkCount: number;
};

type SnapshotActionState = {
  label: string;
  helper: string;
};

const R = 88;
const CX = 100;
const CY = 100;
const CIRC = 2 * Math.PI * R;

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function scoreNarrative(score: number): string {
  if (score >= 90) return 'Excellent readiness. Minor refinements only.';
  if (score >= 75) return 'Strong readiness. Close a few gaps to improve clarity.';
  if (score >= 55) return 'Mixed readiness. Key signals are missing or inconsistent.';
  if (score >= 35) return 'Low readiness. Address the critical gaps first.';
  return 'Critical readiness gaps. Prioritize the fixes below.';
}

function severityLabel(weight: number | undefined): 'High' | 'Medium' | 'Low' {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

function severityStyle(sev: 'High' | 'Medium' | 'Low'): string {
  if (sev === 'High') return 'bg-red-100 text-red-800';
  if (sev === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI Readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand Coverage',
  conversion_readiness: 'Conversion',
};

const CATEGORY_ICONS: Record<string, string> = {
  ai_readiness: 'smart_toy',
  extractability: 'edit_note',
  trust: 'verified_user',
  demand_coverage: 'query_stats',
  conversion_readiness: 'conversion_path',
};

function categoryScoreColor(score: number): string {
  if (score < 0) return 'text-outline-variant bg-surface-container-low';
  if (score >= 75) return 'text-green-700 bg-green-50';
  if (score >= 45) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

function readinessStatus(score: number): 'Good' | 'Needs improvement' | 'Critical' {
  if (score >= 75) return 'Good';
  if (score >= 45) return 'Needs improvement';
  return 'Critical';
}

function readinessBadgeClasses(status: ReturnType<typeof readinessStatus>): string {
  if (status === 'Good') return 'bg-primary/10 text-primary';
  if (status === 'Needs improvement') return 'bg-warning/15 text-on-background';
  return 'bg-error/10 text-error';
}

export function ScoreDisplay({
  score,
  letterGrade,
  issues,
  categoryScores = [],
  snapshotAction,
  snapshotHref,
  snapshotState,
}: {
  score: number;
  letterGrade: string;
  issues: Issue[];
  categoryScores?: CategoryScoreData[];
  snapshotAction?: (() => Promise<void>) | (() => void);
  snapshotHref?: string;
  snapshotState?: SnapshotActionState | null;
}) {
  const s = clampScore(score);
  const offset = CIRC * (1 - s / 100);
  const narrative = scoreNarrative(s);
  const failedIssues = issues.filter((i) => i.passed === false || i.passed === undefined);
  const sortedFailed = [...failedIssues].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const status = readinessStatus(s);

  const displayCategories = categoryScores.length > 0
    ? categoryScores
    : (['ai_readiness', 'extractability', 'trust', 'demand_coverage', 'conversion_readiness'] as const).map((cat) => ({
        category: cat,
        score: -1,
        letterGrade: 'N/A',
        checkCount: 0,
      }));

  return (
    <div className="space-y-10">
      {/* Score hero */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <section className="flex flex-col items-center gap-8 rounded-xl bg-surface-container-lowest p-8 shadow-float md:flex-row md:p-10 lg:col-span-8">
          <div className="relative flex h-48 w-48 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200" aria-hidden>
              <circle
                className="text-surface-container-low"
                cx={CX} cy={CY} r={R} fill="transparent" stroke="currentColor" strokeWidth={8}
              />
              <circle
                className="text-primary"
                cx={CX} cy={CY} r={R} fill="transparent" stroke="currentColor"
                strokeDasharray={CIRC} strokeDashoffset={offset} strokeLinecap="round" strokeWidth={12}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-headline text-5xl font-bold text-on-background md:text-6xl">{s}</span>
              <span className="font-label text-xs uppercase tracking-tighter text-outline-variant">out of 100</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center md:text-left">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <span className="font-headline text-4xl font-bold text-primary">{letterGrade}</span>
              <span className="rounded-md bg-secondary-container/80 px-3 py-1 font-label text-xs font-semibold uppercase tracking-widest text-on-background">
                AI Search Readiness
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className={`rounded-lg px-2.5 py-1 font-label text-xs font-semibold uppercase tracking-widest ${readinessBadgeClasses(status)}`}>
                {status}
              </span>
              <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                {sortedFailed.length} {sortedFailed.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>
            <p className="mt-4 font-body leading-relaxed text-on-surface-variant">
              {narrative}
            </p>
          </div>
        </section>

        <aside className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-8 text-on-background shadow-float lg:col-span-4">
          <div>
            <span className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant">Share</span>
            <h3 className="mt-4 font-headline text-2xl leading-snug">Your score snapshot</h3>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-headline text-4xl font-bold">{s} / 100</div>
                <p className="mt-1 font-body text-sm text-on-surface-variant">
                  Share this results page and the score preview will travel with it.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-container-low">
                <span className="material-symbols-outlined text-3xl text-primary">share</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void snapshotAction?.()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
              >
                <span className="material-symbols-outlined text-base">share</span>
                Share snapshot
              </button>
              {snapshotHref ? (
                <a
                  href={snapshotHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-4 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-base">image</span>
                  Preview image
                </a>
              ) : null}
            </div>
            {snapshotState ? (
              <div className="rounded-xl bg-surface-container-low px-4 py-3">
                <p className="font-body text-sm font-semibold text-on-background">{snapshotState.label}</p>
                <p className="mt-1 font-body text-xs leading-5 text-on-surface-variant">{snapshotState.helper}</p>
              </div>
            ) : null}
          </div>
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 rounded-full border border-outline-variant/10" aria-hidden />
          <div className="pointer-events-none absolute -bottom-4 -right-4 h-48 w-48 rounded-full border border-outline-variant/15" aria-hidden />
        </aside>
      </div>

      {/* Category scores — v2 five-pillar model */}
      <section>
        <h2 className="mb-4 font-headline text-lg font-bold text-on-background">Category breakdown</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {displayCategories.map((cat) => {
            const label = CATEGORY_LABELS[cat.category] ?? cat.category;
            const icon = CATEGORY_ICONS[cat.category] ?? 'check_circle';
            const hasScore = cat.score >= 0 && cat.checkCount > 0;
            return (
              <div key={cat.category} className={`flex flex-col items-center gap-1.5 rounded-xl p-5 ${categoryScoreColor(hasScore ? cat.score : -1)}`}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
                <span className="text-center font-label text-xs font-semibold">{label}</span>
                {hasScore ? (
                  <>
                    <span className="font-headline text-2xl font-bold">{cat.score}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">{cat.letterGrade}</span>
                  </>
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-wider">No data</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Issue list with severity chips + numbered priority */}
      <section>
        <h2 className="mb-6 font-headline text-2xl font-bold text-on-background">Top issues to fix</h2>
        <ul className="space-y-4">
          {sortedFailed.length === 0 ? (
            <li className="font-body text-on-surface-variant">
              No failing checks detected — great baseline.
            </li>
          ) : (
            sortedFailed.map((i, idx) => {
              const sev = severityLabel(i.weight);
              const sevClasses = severityStyle(sev);
              const num = String(idx + 1).padStart(2, '0');
              return (
                <li
                  key={`${String(i.check ?? i.checkId)}-${String(idx)}`}
                  className="flex gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-float"
                >
                  <span className="font-headline text-2xl font-bold text-outline-variant/40">{num}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sevClasses}`}>{sev}</span>
                      <span className="font-medium text-on-background">{i.check ?? i.checkId ?? 'Check'}</span>
                      {i.confidence ? (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${i.confidence === 'high' ? 'bg-green-50 text-green-700' : i.confidence === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {i.confidence} conf.
                        </span>
                      ) : null}
                    </div>
                    {i.finding ? <p className="font-body text-sm text-on-surface-variant">{i.finding}</p> : null}
                    {i.fix ? (
                      <p className="mt-2 rounded-lg bg-surface-container-low px-3 py-2 font-body text-sm text-on-background/90">
                        <span className="font-semibold">Fix: </span>{i.fix}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
