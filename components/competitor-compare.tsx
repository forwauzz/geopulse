'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useState } from 'react';
import { PeerStrip, type ReportCategoryScore, type ScoreBenchmark } from '@/components/score-report';
import { CompetitorDiscovery } from '@/components/competitor-discovery';

type Summary = {
  domain: string;
  score: number;
  letterGrade: string;
  categoryScores: ReportCategoryScore[];
  /** Optional display name (from auto-discovery); falls back to the domain. */
  name?: string;
  /** True for clearly-labelled mock sample rows (auto-discovery, no live scan). */
  sample?: boolean;
};

const MAX_COMPETITORS = 3;

// Mirrors scan-form.tsx: lets E2E/dev skip the Turnstile widget. Never active in production.
const E2E_BYPASS_TURNSTILE =
  process.env['NEXT_PUBLIC_E2E_BYPASS_TURNSTILE'] === '1' && process.env.NODE_ENV !== 'production';

// Only the three pillars the free scan measures.
const PILLARS: { key: string; label: string }[] = [
  { key: 'ai_readiness', label: 'Getting found' },
  { key: 'extractability', label: 'Being understood' },
  { key: 'trust', label: 'Being trusted' },
];

function pillarScore(cs: ReportCategoryScore[], key: string): number | null {
  const c = cs.find((x) => x.category === key);
  return c && c.score >= 0 ? c.score : null;
}

function errText(data: unknown): string {
  const err = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
  if (err && typeof err === 'object') {
    const raw = (err as { message?: unknown }).message;
    if (typeof raw === 'string') return raw;
  }
  return 'That scan failed. Check the URL and try again.';
}

export function CompetitorCompare({
  you,
  youUrl,
  siteKey,
  benchmark,
  initialCompetitors,
}: {
  you: Summary;
  /** Full URL of the scanned site — used by auto-discovery detection. */
  youUrl?: string;
  siteKey: string;
  benchmark?: ScoreBenchmark;
  /** Preview/testing only: seed the comparison table without a live scan. */
  initialCompetitors?: Summary[];
}) {
  const [competitors, setCompetitors] = useState<Summary[]>(initialCompetitors ?? []);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState<string | null>(E2E_BYPASS_TURNSTILE ? 'e2e-bypass-token' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tsRef = useRef<TurnstileInstance | null>(null);

  const atCap = competitors.length >= MAX_COMPETITORS;
  const cols: Summary[] = [you, ...competitors];
  const rows: { label: string; get: (s: Summary) => number | null }[] = [
    { label: 'Overall', get: (s) => s.score },
    ...PILLARS.map((p) => ({ label: p.label, get: (s: Summary) => pillarScore(s.categoryScores, p.key) })),
  ];

  // Shared scan → append. Returns an error string on failure, or null on success. Reused by the
  // manual form and by auto-discovery's live "Scan & compare" candidates.
  async function scanInto(rawUrl: string): Promise<string | null> {
    if (competitors.length >= MAX_COMPETITORS) return `Comparing the maximum of ${MAX_COMPETITORS} competitors.`;
    if (!token) return 'Please complete the verification below.';
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, turnstileToken: token }),
      });
      const data: unknown = await res.json();
      if (!res.ok) return errText(data);
      const d = data as Partial<Summary> & { domain?: string };
      setCompetitors((list) => [
        ...list,
        {
          domain: String(d.domain ?? rawUrl),
          score: Number(d.score ?? 0),
          letterGrade: String(d.letterGrade ?? '—'),
          categoryScores: Array.isArray(d.categoryScores) ? d.categoryScores : [],
        },
      ]);
      return null;
    } catch {
      return 'We couldn’t reach that site. Check the URL and try again.';
    } finally {
      // A token is single-use; reset the widget for the next scan.
      setToken(E2E_BYPASS_TURNSTILE ? 'e2e-bypass-token' : null);
      tsRef.current?.reset();
    }
  }

  function addSample(c: { name: string; domain: string; score: number; letterGrade: string; categoryScores: ReportCategoryScore[] }) {
    setCompetitors((list) =>
      list.length >= MAX_COMPETITORS
        ? list
        : [...list, { domain: c.domain, name: c.name, score: c.score, letterGrade: c.letterGrade, categoryScores: c.categoryScores, sample: true }]
    );
  }

  async function addCompetitor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (atCap) return;
    setBusy(true);
    const err = await scanInto(url);
    if (err) setError(err);
    else setUrl('');
    setBusy(false);
  }

  return (
    <div className="mt-4 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-float md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-lg font-black uppercase tracking-tight text-on-background">How you stack up against competitors</h3>
        <span className="font-label text-[0.62rem] uppercase tracking-[0.13em] text-on-surface-variant">
          {competitors.length > 0 ? 'head-to-head' : 'add a competitor'}
        </span>
      </div>

      {/* auto-discovery: detect → confirm → discover */}
      <div className="mt-3">
        <CompetitorDiscovery
          domain={you.domain}
          youUrl={youUrl}
          atCap={atCap}
          hasToken={Boolean(token)}
          onScanUrl={scanInto}
          onAddSample={addSample}
        />
      </div>

      {/* empty state → the generic peer strip as a fallback */}
      {competitors.length === 0 && benchmark && benchmark.sampleSize >= 20 ? (
        <div className="mt-1">
          <PeerStrip score={you.score} benchmark={benchmark} />
          <p className="mt-3 font-sans text-sm text-on-surface-variant">
            Know a competitor? Add their site below for a direct, side-by-side comparison.
          </p>
        </div>
      ) : null}

      {/* comparison table */}
      {competitors.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse">
            <thead>
              <tr>
                <th className="p-2" />
                {cols.map((c, i) => (
                  <th key={`${c.domain}-${i}`} className="p-2 align-bottom">
                    <span className={`block text-center font-sans text-sm font-semibold ${i === 0 ? 'text-primary' : 'text-on-background'}`}>
                      {i === 0 ? 'You' : c.name ?? c.domain}
                    </span>
                    {i === 0 ? (
                      <span className="block text-center font-label text-[0.6rem] text-on-surface-variant">{c.domain}</span>
                    ) : (
                      <span className="mt-0.5 flex items-center justify-center gap-1">
                        {c.sample ? (
                          <span className="rounded bg-surface-container px-1 font-label text-[0.5rem] uppercase tracking-[0.1em] text-on-surface-variant">sample</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setCompetitors((list) => list.filter((_, j) => j !== i - 1))}
                          className="font-label text-[0.6rem] text-on-surface-variant transition hover:text-error"
                        >
                          remove
                        </button>
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = cols.map(row.get);
                const nums = vals.filter((n): n is number => typeof n === 'number');
                const best = nums.length ? Math.max(...nums) : null;
                return (
                  <tr key={row.label} className="border-t border-outline-variant/20">
                    <td className="p-2 font-sans text-sm text-on-surface-variant">{row.label}</td>
                    {vals.map((val, i) => (
                      <td key={i} className="p-2 text-center tabular-nums">
                        {val == null ? (
                          <span className="text-outline-variant">—</span>
                        ) : (
                          <span className={`font-sans text-xl font-black tabular-nums ${best != null && val === best ? 'text-green-700 dark:text-green-300' : 'text-on-background'}`}>
                            {val}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* add-competitor form */}
      {atCap ? (
        <p className="mt-4 border-t border-outline-variant/20 pt-4 font-sans text-xs text-on-surface-variant">
          Comparing the maximum of {MAX_COMPETITORS} competitors.
        </p>
      ) : (
        <>
          <form onSubmit={addCompetitor} className="mt-4 flex flex-col gap-3 border-t border-outline-variant/20 pt-4 sm:flex-row">
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Competitor URL — https://…"
              aria-label="Competitor website URL"
              className="min-h-[44px] flex-1 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 font-body text-sm text-on-surface outline-none transition focus:ring-2 focus:ring-tertiary/30"
            />
            <button
              type="submit"
              disabled={busy || !token}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
            >
              {busy ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Scanning…
                </>
              ) : (
                'Compare'
              )}
            </button>
          </form>
          {E2E_BYPASS_TURNSTILE ? null : (
            <div className="mt-3 flex min-h-[65px] justify-start">
              <Turnstile
                ref={tsRef}
                siteKey={siteKey}
                onSuccess={(t) => {
                  setToken(t);
                  setError(null);
                }}
                onExpire={() => setToken(null)}
                onError={() => setToken(null)}
              />
            </div>
          )}
        </>
      )}
      {error ? (
        <p className="mt-2 font-sans text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
