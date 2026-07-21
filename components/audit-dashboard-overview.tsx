import Link from 'next/link';
import type { ActionSeverity, AuditDashboardView } from '@/lib/server/audit-dashboard-data';

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

function Sparkline({ points }: { points: ReadonlyArray<{ score: number }> }) {
  const width = 220;
  const height = 56;
  const pad = 4;
  const xs = points.map((_, i) => pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1));
  const min = Math.min(...points.map((p) => p.score));
  const max = Math.max(...points.map((p) => p.score));
  const span = Math.max(1, max - min);
  const ys = points.map((p) => height - pad - ((p.score - min) / span) * (height - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" role="img" aria-label={`Score trend, latest ${last?.score ?? ''}`}>
      <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3.5" className="fill-primary" />
    </svg>
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
    <article className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
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

export function AuditDashboardOverview({ view }: { view: AuditDashboardView }) {
  const { latest } = view;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="audit-dashboard-overview">
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

        <Card title="AI crawler access">
          {view.botAccess ? (
            <ul className="space-y-2">
              {view.botAccess.map((bot) => (
                <li key={bot.name} className="flex items-center justify-between gap-2 text-sm text-on-background">
                  <span>{bot.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      bot.blocked ? 'bg-error/15 text-error' : GOOD_CHIP
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]" aria-hidden>
                      {bot.blocked ? 'block' : 'check_circle'}
                    </span>
                    {bot.blocked ? 'Blocked' : 'Allowed'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <NoDataHint>Robots.txt access for GPTBot, ClaudeBot and PerplexityBot, measured by your audit.</NoDataHint>
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

        <Card title="Score trend">
          {view.trendPoints.length >= 2 ? (
            <div>
              <Sparkline points={view.trendPoints} />
              <p className="mt-2 text-xs text-on-surface-variant">
                {view.trendPoints.length} audits · latest {view.trendPoints[view.trendPoints.length - 1]?.score}/100
              </p>
            </div>
          ) : (
            <NoDataHint>Run at least two audits to see your score move over time.</NoDataHint>
          )}
        </Card>
      </div>

      {/* Not measured for self-serve yet — say so instead of faking it */}
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
            Coming soon
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { name: 'ChatGPT', logo: '/ai-engines/chatgpt.jpg' },
            { name: 'Perplexity', logo: '/ai-engines/perplexity.jpg' },
            { name: 'Claude', logo: '/ai-engines/claude.jpg' },
            { name: 'Gemini', logo: '/ai-engines/gemini.jpg' },
          ].map((engine) => (
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
              <span className="text-xs text-on-surface-variant">Not tracked yet</span>
            </div>
          ))}
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
