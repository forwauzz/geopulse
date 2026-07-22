import Link from 'next/link';
import type {
  ActionSeverity,
  AuditDashboardView,
  DashboardDestinationStatus,
} from '@/lib/server/audit-dashboard-data';
import type { EngineCitationMetric, EngineKey } from '@/lib/server/dashboard-citation-metrics';
import type { MarketPosition } from '@/lib/server/market-position';
import { ScoreOverTimeChart } from '@/components/dashboard-charts';

/**
 * The signed-in overview under the scan hero: every tile is backed by measurements the user's own
 * audits produced. The one capability we do not measure for self-serve users (whether AI engines
 * actually cite the site) is shown as an explicit "coming soon" — never as a fake number.
 */

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Status tones. Green mirrors the results page's positive-chip treatment (light + dark variants);
 * the rest follow the grade→tone language the history page already uses.
 */
const GOOD_CHIP = 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200';

function scoreTone(score: number): { ring: string; chip: string } {
  if (score >= 80) return { ring: 'stroke-green-600 dark:stroke-green-400', chip: GOOD_CHIP };
  if (score >= 60) return { ring: 'stroke-tertiary', chip: 'bg-tertiary/15 text-tertiary' };
  if (score >= 40) return { ring: 'stroke-warning', chip: 'bg-warning/20 text-on-background' };
  return { ring: 'stroke-error', chip: 'bg-error/15 text-error' };
}

function severityChip(severity: ActionSeverity): { label: string; className: string } {
  if (severity === 'high') return { label: 'High', className: 'bg-error/15 text-error' };
  if (severity === 'medium') return { label: 'Medium', className: 'bg-warning/20 text-on-background' };
  return { label: 'Low', className: 'bg-surface-container-high text-on-surface-variant' };
}

/**
 * Access-matrix status language, shared with the report's Access Matrix (components/access-matrix.tsx):
 * eligible = green, blocked = red, not_tested = amber. Training access is never rendered here — it
 * lives in its own neutral chip row because blocking training crawlers is a choice, not a failure.
 */
const DESTINATION_STATUS: Record<
  DashboardDestinationStatus,
  { label: string; icon: string; chip: string; dot: string }
> = {
  eligible: {
    label: 'Eligible',
    icon: 'check_circle',
    chip: GOOD_CHIP,
    dot: 'bg-green-500 dark:bg-green-400',
  },
  blocked: {
    label: 'Blocked',
    icon: 'block',
    chip: 'bg-error/15 text-error',
    dot: 'bg-error',
  },
  not_tested: {
    label: 'Not tested',
    icon: 'help',
    chip: 'bg-warning/20 text-on-background',
    dot: 'bg-warning',
  },
};

/** Compact labels for the four-up card; the full label still lives on the report matrix. */
const DESTINATION_SHORT_LABEL: Record<string, string> = {
  'Google Search + AI Overviews': 'AI Overviews',
  'ChatGPT Search': 'ChatGPT',
  Claude: 'Claude',
  Perplexity: 'Perplexity',
  'Bing / Copilot': 'Copilot',
};

function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = scoreTone(clamped);
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90" aria-hidden>
        <circle cx="56" cy="56" r={radius} fill="none" strokeWidth="8" className="stroke-surface-container-high" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className={tone.ring}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans text-3xl font-black tabular-nums text-on-background">{clamped}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">/100</span>
      </div>
    </div>
  );
}

function Card({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 transition duration-200 hover:border-outline-variant/40 hover:shadow-float">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-headline text-sm font-semibold text-on-background">{title}</h3>
        {badge ? (
          <span className="rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-center">{children}</div>
    </article>
  );
}

function NoDataHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-on-surface-variant">{children}</p>;
}

export function AuditDashboardOverview({
  view,
  engineCitations = {},
  marketPosition = null,
}: {
  view: AuditDashboardView;
  engineCitations?: Partial<Record<EngineKey, EngineCitationMetric>>;
  /** Anonymized cohort rank ("#7 of 29 …"), same computation as the PDF. Null when out of cohort. */
  marketPosition?: MarketPosition | null;
}) {
  const { latest } = view;
  const anyEngineTracked = Object.keys(engineCitations).length > 0;

  // Score momentum: latest gradeable score vs the previous gradeable one (honest — skips gaps).
  const tested = view.timeline.filter((p): p is typeof p & { score: number } => p.score !== null);
  const latestScored = tested[tested.length - 1] ?? null;
  const prevScored = tested[tested.length - 2] ?? null;
  const momentum = latestScored && prevScored ? latestScored.score - prevScored.score : null;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="audit-dashboard-overview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Your AI visibility</p>
          <h2 className="mt-1 font-headline text-lg font-semibold text-on-background">
            {latest ? (
              <>
                Latest audit: <span className="text-primary">{latest.domain}</span>
                <span className="ml-2 text-sm font-normal text-on-surface-variant">{formatDate(latest.createdAt)}</span>
              </>
            ) : (
              'Run your first audit to see how AI reads your site'
            )}
          </h2>
        </div>
        {marketPosition ? (
          <div className="rounded-xl border-l-2 border-gold/60 bg-surface-container-lowest px-4 py-2.5">
            <p className="font-sans text-2xl font-black tabular-nums leading-none text-primary">
              #{marketPosition.rank}
              <span className="text-sm font-semibold text-on-surface-variant"> of {marketPosition.of}</span>
            </p>
            <p className="mt-1 text-[11px] leading-tight text-on-surface-variant">
              {marketPosition.vertical} in {marketPosition.geoRegion} · median {marketPosition.medianScore}/100
            </p>
          </div>
        ) : null}
      </div>

      {/* KPI row — all real measurements from the latest audit */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="AI readiness score">
          {latest ? (
            <div className="flex items-center gap-4">
              <ScoreRing score={latest.score} />
              <div>
                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${scoreTone(latest.score).chip}`}>
                  Grade {latest.grade}
                </span>
                <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  How clearly machines can crawl, parse and reuse this page.
                </p>
              </div>
            </div>
          ) : (
            <NoDataHint>Your score appears here after the first audit.</NoDataHint>
          )}
        </Card>

        <Card title="AI answer eligibility">
          {view.accessMatrix ? (
            <div className="flex h-full flex-col">
              {view.accessMatrix.testedCount > 0 ? (
                <p className="font-sans text-3xl font-black tabular-nums leading-none text-on-background">
                  {view.accessMatrix.eligibleCount}
                  <span className="text-base font-semibold text-on-surface-variant">
                    /{view.accessMatrix.testedCount} eligible
                  </span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-on-background">
                  {view.accessMatrix.pageBlocked ? 'Access not testable' : 'Not yet tested'}
                </p>
              )}
              <ul className="mt-3 space-y-1.5">
                {view.accessMatrix.destinations.map((dest) => {
                  const tone = DESTINATION_STATUS[dest.status];
                  return (
                    <li
                      key={dest.label}
                      className="flex items-center justify-between gap-2 text-xs text-on-background"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                        <span className="truncate">
                          {DESTINATION_SHORT_LABEL[dest.label] ?? dest.label}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        {tone.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {view.accessMatrix.trainingChoices.length > 0 ? (
                <div className="mt-3 border-t border-outline-variant/15 pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Training choices <span className="font-normal normal-case">(not scored)</span>
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {view.accessMatrix.trainingChoices.map((choice) => (
                      <li
                        key={choice.token}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant"
                        title={
                          choice.allowed === null
                            ? `${choice.token}: robots.txt unavailable`
                            : `${choice.token}: training ${choice.allowed ? 'allowed' : 'opted out'}`
                        }
                      >
                        {choice.token}
                        <span className="text-on-surface-variant/70">
                          {choice.allowed === null ? '—' : choice.allowed ? 'on' : 'off'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <NoDataHint>
              Eligibility across AI Overviews, ChatGPT, Claude, Perplexity and Copilot appears here after your
              next audit.
            </NoDataHint>
          )}
        </Card>

        <Card title="Structured data health">
          {view.structuredData ? (
            <div>
              <p className="font-sans text-3xl font-black tabular-nums text-on-background">
                {view.structuredData.percent}
                <span className="text-base font-semibold text-on-surface-variant">%</span>
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {view.structuredData.parts.map((part) => (
                  <li
                    key={part.label}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      part.passed ? GOOD_CHIP : 'bg-error/15 text-error'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]" aria-hidden>
                      {part.passed ? 'check' : 'close'}
                    </span>
                    {part.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <NoDataHint>JSON-LD, schema types and Open Graph coverage from your audit.</NoDataHint>
          )}
        </Card>

        <Card title="Score momentum">
          {latestScored ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-sans text-4xl font-black tabular-nums leading-none text-on-background">
                  {latestScored.score}
                </span>
                {momentum !== null ? (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                      momentum > 0
                        ? GOOD_CHIP
                        : momentum < 0
                          ? 'bg-error/15 text-error'
                          : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden>
                      {momentum > 0 ? 'trending_up' : momentum < 0 ? 'trending_down' : 'trending_flat'}
                    </span>
                    {momentum > 0 ? '+' : ''}
                    {momentum}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">
                {momentum !== null
                  ? `${momentum >= 0 ? 'Up' : 'Down'} ${Math.abs(momentum)} points since your previous audit.`
                  : `${tested.length} gradeable audit${tested.length === 1 ? '' : 's'} so far.`}
              </p>
            </div>
          ) : (
            <NoDataHint>Your score momentum appears once an audit produces a gradeable score.</NoDataHint>
          )}
        </Card>
      </div>

      {/* Real trend module — replaces the tiny sparkline. Honest gaps for not-tested runs. */}
      {tested.length >= 2 ? (
        <article className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 transition duration-200 hover:border-outline-variant/40 hover:shadow-float md:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-headline text-sm font-semibold text-on-background">Score over time</h3>
            <Link href="/dashboard/history" className="text-xs font-semibold text-primary hover:underline">
              Full history →
            </Link>
          </div>
          <div className="mt-3">
            <ScoreOverTimeChart points={view.timeline} height={200} />
          </div>
        </article>
      ) : null}

      {/* Engines with benchmark data show the real citation rate; the rest say so honestly. */}
      <article className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-lowest p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-headline text-base font-semibold text-on-background">
              Know when the AI engines start citing you
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              Citation tracking measures whether ChatGPT, Perplexity, Claude and Gemini actually name your site
              when people ask. Your readiness score today is what moves those numbers tomorrow.
            </p>
          </div>
          <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            {anyEngineTracked ? 'Early data' : 'Coming soon'}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              { key: 'chatgpt', name: 'ChatGPT', logo: '/ai-engines/chatgpt.jpg' },
              { key: 'perplexity', name: 'Perplexity', logo: '/ai-engines/perplexity.jpg' },
              { key: 'claude', name: 'Claude', logo: '/ai-engines/claude.jpg' },
              { key: 'gemini', name: 'Gemini', logo: '/ai-engines/gemini.jpg' },
            ] as ReadonlyArray<{ key: EngineKey; name: string; logo: string }>
          ).map((engine) => {
            const metric = engineCitations[engine.key];
            return (
              <div
                key={engine.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-4"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small static brand lockups */}
                <img
                  src={engine.logo}
                  alt={`${engine.name} logo`}
                  className="h-9 w-auto rounded-md object-contain"
                />
                {metric ? (
                  <div className="text-center">
                    <p className="font-sans text-xl font-black tabular-nums text-on-background">
                      {Math.round(metric.citationRate * 100)}
                      <span className="text-xs font-semibold text-on-surface-variant">%</span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      {metric.runMode === 'blind_discovery'
                        ? 'cited when buyers ask'
                        : metric.runMode === 'grounded_site'
                          ? 'citation rate (site-assisted)'
                          : 'citation rate (brand-aware)'}
                    </p>
                    {metric.computedAt ? (
                      <p className="text-[10px] text-on-surface-variant/80">
                        measured{' '}
                        {new Date(metric.computedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    ) : null}
                    <a href="#citation-evidence" className="mt-1 inline-block text-[11px] font-semibold text-primary underline">
                      See the evidence
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-on-surface-variant">Not tracked yet</span>
                )}
              </div>
            );
          })}
        </div>
      </article>

      {/* Actions + recent audits */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Priority actions" badge={latest ? 'From your latest audit' : undefined}>
          {view.priorityActions.length > 0 ? (
            <ul className="divide-y divide-outline-variant/15">
              {view.priorityActions.map((action) => {
                const chip = severityChip(action.severity);
                return (
                  <li key={action.title} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-on-background">{action.title}</p>
                      {action.fix ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-on-surface-variant">{action.fix}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
                      <Link
                        href={`/results/${action.scanId}`}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition hover:opacity-90"
                      >
                        Fix
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : latest ? (
            <NoDataHint>Nothing failing in your latest audit — nice.</NoDataHint>
          ) : (
            <NoDataHint>Failed checks from your latest audit land here, worst first.</NoDataHint>
          )}
        </Card>

        <Card title="Recent audits">
          {view.recent.length > 0 ? (
            <ul className="divide-y divide-outline-variant/15">
              {view.recent.map((row) => (
                <li key={row.scanId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-on-background">{row.domain}</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{formatDate(row.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {typeof row.score === 'number' ? (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${scoreTone(row.score).chip}`}>
                        {row.score}
                      </span>
                    ) : null}
                    <Link
                      href={`/results/${row.scanId}`}
                      className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
                    >
                      View report
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <NoDataHint>Your audit history appears here. Full history lives on the History page.</NoDataHint>
          )}
        </Card>
      </div>
    </section>
  );
}
