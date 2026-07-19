'use client';

import { useState } from 'react';
import type { ReportCategoryScore } from '@/components/score-report';

/** Matches the /api/competitors/* response contract. */
type DiscoveryMode = 'mock' | 'gemini';
type SampleSummary = {
  score: number;
  letterGrade: string;
  categoryScores: ReportCategoryScore[];
};
type Candidate = {
  name: string;
  url: string;
  domain: string;
  reason?: string;
  sample?: SampleSummary;
};

type Stage = 'idle' | 'detecting' | 'confirm' | 'discovering' | 'results';

function errText(data: unknown, fallback: string): string {
  const err = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
  if (err && typeof err === 'object') {
    const raw = (err as { message?: unknown }).message;
    if (typeof raw === 'string') return raw;
  }
  return fallback;
}

/**
 * Detect → confirm → discover pipeline (OSS-REFACTOR-PLAN.md Loop 4). Runs as a separate async
 * action (not inline). Detection + confirm work today with no LLM cost; discovery is mock by
 * default and flips to live Google-Search grounding once Gemini billing is enabled.
 */
export function CompetitorDiscovery({
  domain,
  youUrl,
  atCap,
  hasToken,
  onScanUrl,
  onAddSample,
}: {
  domain: string;
  /** Full URL of the scanned site; detection re-fetches it. Falls back to https://domain/. */
  youUrl?: string;
  atCap: boolean;
  /** Whether a Turnstile token is available (needed only to scan live candidates). */
  hasToken: boolean;
  /** Scan a real competitor URL into the comparison table. Resolves to an error string or null. */
  onScanUrl: (url: string) => Promise<string | null>;
  /** Inject a clearly-labelled mock sample row into the comparison table. */
  onAddSample: (c: { name: string; domain: string } & SampleSummary) => void;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [confidence, setConfidence] = useState<string | null>(null);
  const [mode, setMode] = useState<DiscoveryMode>('mock');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // domain currently scanning/adding
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function detect() {
    setError(null);
    setStage('detecting');
    try {
      const res = await fetch('/api/competitors/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youUrl || `https://${domain}/` }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(errText(data, 'We couldn’t read that site. Enter your industry and city below.'));
        setStage('confirm');
        return;
      }
      const d = data as {
        profile?: { businessType?: string; city?: string | null; region?: string | null; confidence?: string };
        mode?: DiscoveryMode;
      };
      setBusinessType(d.profile?.businessType ?? '');
      setCity(d.profile?.city ?? '');
      setRegion(d.profile?.region ?? '');
      setConfidence(d.profile?.confidence ?? null);
      if (d.mode === 'gemini') setMode('gemini');
      setStage('confirm');
    } catch {
      setError('We couldn’t reach that site. Enter your industry and city below.');
      setStage('confirm');
    }
  }

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage('discovering');
    try {
      const res = await fetch('/api/competitors/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, businessType, city: city || null, region: region || null }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(errText(data, 'Competitor discovery failed. Try again.'));
        setStage('confirm');
        return;
      }
      const d = data as { mode?: DiscoveryMode; competitors?: Candidate[]; note?: string | null };
      setCandidates(Array.isArray(d.competitors) ? d.competitors : []);
      setMode(d.mode ?? 'mock');
      setNote(d.note ?? null);
      setStage('results');
    } catch {
      setError('Competitor discovery failed. Try again.');
      setStage('confirm');
    }
  }

  async function handleScan(c: Candidate) {
    setError(null);
    setPending(c.domain);
    const err = await onScanUrl(c.url);
    if (err) setError(err);
    else setAdded((s) => new Set(s).add(c.domain));
    setPending(null);
  }

  function handleAddSample(c: Candidate) {
    if (!c.sample) return;
    onAddSample({ name: c.name, domain: c.domain, ...c.sample });
    setAdded((s) => new Set(s).add(c.domain));
  }

  function reset() {
    setStage('idle');
    setCandidates([]);
    setNote(null);
    setError(null);
    setAdded(new Set());
  }

  const btn =
    'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 font-sans text-sm font-semibold transition disabled:opacity-50';
  const spinner = (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  return (
    <div className="mb-4 rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low p-4 md:p-5">
      {stage === 'idle' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-sans text-sm font-semibold text-on-background">Not sure who to compare against?</p>
            <p className="mt-0.5 font-sans text-xs text-on-surface-variant">
              We’ll detect your industry and city, then find local competitors automatically.
            </p>
          </div>
          <button type="button" onClick={detect} disabled={atCap} className={`${btn} bg-primary text-on-primary hover:bg-primary-dim`}>
            Find my local competitors
          </button>
        </div>
      ) : null}

      {stage === 'detecting' ? (
        <p className="flex items-center gap-2 font-sans text-sm text-on-surface-variant">
          {spinner} Detecting your industry and location…
        </p>
      ) : null}

      {stage === 'confirm' ? (
        <form onSubmit={discover} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-sans text-sm font-semibold text-on-background">Confirm your details</p>
            {confidence ? (
              <span className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                detected · {confidence} confidence
              </span>
            ) : null}
          </div>
          <p className="font-sans text-xs text-on-surface-variant">
            Edit anything we got wrong before we search — better details mean better competitor matches.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Industry</span>
              <input
                type="text"
                required
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="e.g. dental practice"
                className="min-h-[42px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">City</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Austin"
                className="min-h-[42px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${btn} bg-primary text-on-primary hover:bg-primary-dim`}>Find competitors</button>
            <button type="button" onClick={reset} className={`${btn} bg-surface-container text-on-surface-variant hover:text-on-background`}>Cancel</button>
          </div>
        </form>
      ) : null}

      {stage === 'discovering' ? (
        <p className="flex items-center gap-2 font-sans text-sm text-on-surface-variant">
          {spinner} Finding local competitors…
        </p>
      ) : null}

      {stage === 'results' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-sans text-sm font-semibold text-on-background">
              {mode === 'gemini' ? 'Local competitors we found' : 'Sample local competitors'}
            </p>
            <button type="button" onClick={reset} className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant hover:text-on-background">start over</button>
          </div>
          {note ? (
            <p className="rounded-lg bg-surface-container px-3 py-2 font-sans text-xs text-on-surface-variant">{note}</p>
          ) : null}
          <ul className="space-y-2">
            {candidates.map((c) => {
              const isAdded = added.has(c.domain);
              const isPending = pending === c.domain;
              return (
                <li key={c.domain} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-semibold text-on-background">
                      {c.name}
                      {c.sample ? (
                        <span className="ml-2 rounded bg-surface-container px-1.5 py-0.5 font-label text-[0.55rem] uppercase tracking-[0.12em] text-on-surface-variant">sample</span>
                      ) : null}
                    </p>
                    <p className="truncate font-sans text-xs text-on-surface-variant">
                      {c.domain}
                      {c.sample ? ` · sample score ${c.sample.score}` : ''}
                      {c.reason ? ` · ${c.reason}` : ''}
                    </p>
                  </div>
                  {isAdded ? (
                    <span className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-green-700 dark:text-green-300">added ✓</span>
                  ) : c.sample ? (
                    <button type="button" onClick={() => handleAddSample(c)} disabled={atCap} className={`${btn} shrink-0 bg-surface-container text-on-background hover:bg-surface-container-high`}>
                      Add to comparison
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleScan(c)} disabled={atCap || isPending || !hasToken} className={`${btn} shrink-0 bg-primary text-on-primary hover:bg-primary-dim`}>
                      {isPending ? <>{spinner} Scanning…</> : hasToken ? 'Scan & compare' : 'Verify below to scan'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {atCap ? (
            <p className="font-sans text-xs text-on-surface-variant">You’ve reached the maximum comparison set.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 font-sans text-sm text-error" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
