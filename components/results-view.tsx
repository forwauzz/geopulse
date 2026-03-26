'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeepAuditCheckout } from '@/components/deep-audit-checkout';
import { EmailGate } from '@/components/email-gate';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { ScoreDisplay } from '@/components/score-display';
import { reportLoadingJourney, resultsLoadingJourney } from '@/lib/client/loading-journeys';
import { buildResultsJourneyModel } from '@/lib/client/results-journey';

type Issue = { check?: string; checkId?: string; finding?: string; fix?: string; weight?: number; passed?: boolean; status?: string; category?: string; confidence?: string };
type ReportStatus = 'none' | 'generating' | 'delivered';
type CategoryScoreData = { category: string; score: number; letterGrade: string; checkCount: number };

type ScanData = {
  scanId: string;
  url: string;
  score: number;
  letterGrade: string;
  topIssues: Issue[];
  categoryScores: CategoryScoreData[];
  hasPaidReport: boolean;
  reportStatus: ReportStatus;
  pdfUrl: string | null;
  markdownUrl: string | null;
};

type Props = { scanId: string; turnstileSiteKey: string; checkoutState?: string | null };

function domainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_MS = 120_000;

export function ResultsView({ scanId, turnstileSiteKey, checkoutState }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScanData | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStart = useRef<number>(0);
  useLongWaitEffect(loading, resultsLoadingJourney);
  useLongWaitEffect(data?.reportStatus === 'generating', reportLoadingJourney);

  const fetchScan = useCallback(async (): Promise<ScanData | null> => {
    const res = await fetch(`/api/scans/${scanId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      scanId: string;
      url: string;
      score: number | null;
      letterGrade: string | null;
      topIssues: Issue[];
      categoryScores?: CategoryScoreData[];
      hasPaidReport?: boolean;
      reportStatus?: ReportStatus;
      pdfUrl?: string | null;
      markdownUrl?: string | null;
    };
    return {
      scanId: j.scanId,
      url: j.url,
      score: j.score ?? 0,
      letterGrade: j.letterGrade ?? '\u2014',
      topIssues: Array.isArray(j.topIssues) ? j.topIssues : [],
      categoryScores: Array.isArray(j.categoryScores) ? j.categoryScores : [],
      hasPaidReport: j.hasPaidReport ?? false,
      reportStatus: j.reportStatus ?? 'none',
      pdfUrl: j.pdfUrl ?? null,
      markdownUrl: j.markdownUrl ?? null,
    };
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchScan();
        if (cancelled) return;
        if (!result) {
          setError('load_failed');
          return;
        }
        setData(result);
      } catch {
        if (!cancelled) setError('network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchScan]);

  useEffect(() => {
    if (!data || data.reportStatus !== 'generating') return;
    if (!pollStart.current) pollStart.current = Date.now();

    const poll = async () => {
      if (Date.now() - pollStart.current > POLL_MAX_MS) return;
      const fresh = await fetchScan();
      if (fresh) setData(fresh);
      if (fresh?.reportStatus === 'generating') {
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [data?.reportStatus, fetchScan]);

  if (loading) {
    return (
      <div className="rounded-xl bg-surface-container-low px-6 py-16 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="font-body text-on-surface-variant">Loading report&hellip;</p>
      </div>
    );
  }
  if (error === 'not_found') {
    return (
      <div className="rounded-xl bg-surface-container-low px-6 py-16">
        <h1 className="font-headline text-2xl font-bold text-on-background">Scan not found</h1>
        <p className="mt-2 font-body text-on-surface-variant">This scan may have expired or the URL is incorrect.</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl bg-surface-container-low px-6 py-16">
        <h1 className="font-headline text-2xl font-bold text-on-background">Could not load results</h1>
        <p className="mt-2 font-body text-on-surface-variant">Please try refreshing the page.</p>
      </div>
    );
  }

  const host = domainFromUrl(data.url);
  const showCheckout = !data.hasPaidReport && turnstileSiteKey;
  const showEmailGate = !data.hasPaidReport && turnstileSiteKey;
  const journey = buildResultsJourneyModel({
    host,
    hasPaidReport: data.hasPaidReport,
    reportStatus: data.reportStatus,
    checkoutState,
  });

  const statusClasses =
    journey.statusTone === 'success'
      ? 'border-emerald-500/20 bg-emerald-50'
      : journey.statusTone === 'warning'
        ? 'border-amber-500/20 bg-amber-50'
        : 'border-primary/20 bg-surface-container-low';

  return (
    <>
      <section className="mb-12 md:mb-16">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="font-label text-sm uppercase tracking-widest text-on-surface-variant">
            AI search readiness diagnostic
          </span>
          <div className="h-px min-w-[2rem] flex-grow bg-surface-container-low" />
        </div>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-on-background md:text-5xl">
          Diagnostic for <span className="italic text-primary">{host}</span>
        </h1>
        <p className="mt-4 max-w-2xl font-body text-on-surface-variant">
          Score, progress, and the next best step to move from preview to full audit delivery.
        </p>
      </section>

      <section className="mb-8 rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-float md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
              Audit Journey
            </p>
            <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
              One path, with a preview first and the full audit second
            </h2>
            <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">
              Start with the preview below. If you want the full audit, continue to checkout. If not, you can save this preview quietly for later.
            </p>
          </div>
          <div className={`w-full max-w-xl rounded-2xl border px-5 py-4 ${statusClasses}`}>
            <p className="font-headline text-lg font-semibold text-on-background">{journey.statusTitle}</p>
            <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">{journey.statusBody}</p>
          </div>
        </div>

        <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {journey.steps.map((step, index) => {
            const badgeClasses =
              step.state === 'complete'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : step.state === 'current'
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/35 bg-surface-container-low text-on-surface-variant';
            const cardClasses =
              step.state === 'current'
                ? 'border-primary/30 bg-primary/[0.07]'
                : 'border-outline-variant/20 bg-surface-container-low';
            return (
              <li key={step.label} className={`rounded-2xl border p-4 ${cardClasses}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${badgeClasses}`}>
                    {step.state === 'complete' ? '✓' : index + 1}
                  </span>
                  <p className="font-headline text-base font-semibold text-on-background">{step.label}</p>
                </div>
                <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">{step.detail}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <ScoreDisplay score={data.score} letterGrade={data.letterGrade} issues={data.topIssues} categoryScores={data.categoryScores} />

      <div className="mt-10 space-y-8">
        {data.reportStatus === 'delivered' && (
          <div className="rounded-xl border border-primary/20 bg-surface-container-lowest px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-primary">task_alt</span>
              <div>
                <p className="font-headline font-semibold text-on-background">
                  Your full report has been delivered
                </p>
                <p className="mt-1 font-body text-sm text-on-surface-variant">
                  Check your Stripe checkout email for the detailed PDF and prioritized action plan.
                </p>
              </div>
            </div>
            {(data.pdfUrl || data.markdownUrl) && (
              <div className="mt-4 flex flex-wrap gap-3">
                {data.markdownUrl && (
                  <a
                    href={`/results/${data.scanId}/report`}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
                  >
                    <span className="material-symbols-outlined text-base">article</span>
                    View report
                  </a>
                )}
                {data.pdfUrl && (
                  <a
                    href={data.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    Download PDF
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {showCheckout ? (
          <section className="rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-6 md:p-8">
            <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
              Step 2
            </p>
            <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
              Continue from preview to the full audit
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-on-surface-variant">
              The preview shows the score and top issues. The paid audit keeps going: more coverage, more detail, and delivery to the email you enter in Stripe checkout.
            </p>
            <div className="mt-5">
              <DeepAuditCheckout siteKey={turnstileSiteKey} scanId={data.scanId} />
            </div>
          </section>
        ) : null}

        {showEmailGate ? (
          <section className="mx-auto max-w-3xl">
            <EmailGate
              siteKey={turnstileSiteKey}
              scanId={data.scanId}
              url={data.url}
              score={data.score}
            />
          </section>
        ) : null}

        <div className="text-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 font-body text-sm text-on-surface-variant transition hover:text-primary"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Scan another URL
          </a>
        </div>
      </div>
    </>
  );
}
