'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeepAuditCheckout } from '@/components/deep-audit-checkout';
import { EmailGate } from '@/components/email-gate';
import { ScoreDisplay } from '@/components/score-display';

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

type Props = { scanId: string; turnstileSiteKey: string };

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

export function ResultsView({ scanId, turnstileSiteKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScanData | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStart = useRef<number>(0);

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
  const checkCount = data.topIssues.length;
  const showCheckout = !data.hasPaidReport && turnstileSiteKey;
  const showEmailGate = !data.hasPaidReport && turnstileSiteKey;

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
          Score, status, and the most important fixes to improve machine readability.
        </p>
      </section>

      <ScoreDisplay score={data.score} letterGrade={data.letterGrade} issues={data.topIssues} categoryScores={data.categoryScores} />

      <div className="mt-10 space-y-8">
        {/* Report status: generating */}
        {data.reportStatus === 'generating' && (
          <div className="rounded-xl border border-primary/20 bg-surface-container-low px-6 py-6 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="font-headline text-lg font-semibold text-on-background">
              Your full report is being generated
            </p>
            <p className="mt-2 font-body text-sm text-on-surface-variant">
              This usually takes about 60 seconds. We&apos;ll also email it to you once it&apos;s ready.
            </p>
          </div>
        )}

        {/* Report status: delivered */}
        {data.reportStatus === 'delivered' && (
          <div className="rounded-xl border border-primary/20 bg-surface-container-lowest px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-primary">task_alt</span>
              <div>
                <p className="font-headline font-semibold text-on-background">
                  Your full report has been delivered
                </p>
                <p className="mt-1 font-body text-sm text-on-surface-variant">
                  Check your email for the detailed PDF with all checks and a prioritized action plan.
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

        {/* Upgrade strip — only when not paid */}
        {showCheckout ? (
          <DeepAuditCheckout siteKey={turnstileSiteKey} scanId={data.scanId} />
        ) : null}

        {/* Email gate — only when not paid */}
        {showEmailGate ? (
          <EmailGate
            siteKey={turnstileSiteKey}
            scanId={data.scanId}
            url={data.url}
            score={data.score}
          />
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
