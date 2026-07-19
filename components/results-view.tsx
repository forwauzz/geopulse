'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DeepAuditCheckout } from '@/components/deep-audit-checkout';
import { EmailGate } from '@/components/email-gate';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { ScoreReport, type ReportIssue, type ScoreReportData, type ScoreBenchmark } from '@/components/score-report';
import { CompetitorCompare } from '@/components/competitor-compare';
import { reportLoadingJourney, resultsLoadingJourney } from '@/lib/client/loading-journeys';
import {
  normalizeDeepAuditCheckoutMode,
  type DeepAuditCheckoutMode,
} from '@/lib/shared/deep-audit-checkout-mode';
import { buildReportPath } from '@/lib/shared/report-route';

type Issue = { check?: string; checkId?: string; finding?: string; fix?: string; weight?: number; passed?: boolean; status?: string; category?: string; confidence?: string };
type ReportStatus = 'none' | 'generating' | 'delivered';
type CategoryScoreData = { category: string; score: number; letterGrade: string; checkCount: number };

type ScanData = {
  scanId: string;
  url: string;
  score: number;
  letterGrade: string;
  topIssues: Issue[];
  issues: ReportIssue[];
  benchmark: ScoreBenchmark | null;
  categoryScores: CategoryScoreData[];
  hasPaidReport: boolean;
  reportStatus: ReportStatus;
  pdfUrl: string | null;
  markdownUrl: string | null;
  checkoutMode: DeepAuditCheckoutMode;
  deepAuditAvailable: boolean;
};

type Props = { scanId: string; turnstileSiteKey: string; checkoutState?: string | null };
type LoadError = 'not_found' | 'expired' | 'forbidden' | 'load_failed' | 'network' | null;

function getCheckoutModeCopy(mode: DeepAuditCheckoutMode): string {
  if (mode === 'startup_bypass') {
    return 'This startup workspace is eligible for deep-audit bypass. GEO-Pulse will queue the full audit directly under the current workspace entitlement.';
  }
  if (mode === 'agency_bypass') {
    return 'This agency client is eligible for deep-audit bypass. GEO-Pulse will queue the full audit directly under the current agency entitlement.';
  }
  return 'The preview shows the score and top issues. The paid audit keeps going: more coverage, more detail, and delivery to the email you enter in Stripe checkout.';
}

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
  const [error, setError] = useState<LoadError>(null);
  const [data, setData] = useState<ScanData | null>(null);
  const [shareState, setShareState] = useState<{ label: string; helper: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStart = useRef<number>(0);
  useLongWaitEffect(loading, resultsLoadingJourney);
  useLongWaitEffect(data?.reportStatus === 'generating', reportLoadingJourney);

  const fetchScan = useCallback(async (): Promise<{ data: ScanData | null; error: LoadError }> => {
    const res = await fetch(`/api/scans/${scanId}`, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) return { data: null, error: 'not_found' };
      if (res.status === 403) return { data: null, error: 'forbidden' };
      if (res.status === 410) return { data: null, error: 'expired' };
      return { data: null, error: 'load_failed' };
    }
    const j = (await res.json()) as {
      scanId: string;
      url: string;
      score: number | null;
      letterGrade: string | null;
      topIssues: Issue[];
      issues?: unknown[];
      benchmark?: ScoreBenchmark | null;
      categoryScores?: CategoryScoreData[];
      hasPaidReport?: boolean;
      reportStatus?: ReportStatus;
      pdfUrl?: string | null;
      markdownUrl?: string | null;
      checkoutMode?: DeepAuditCheckoutMode;
      deepAuditAvailable?: boolean;
    };
    return {
      data: {
        scanId: j.scanId,
        url: j.url,
        score: j.score ?? 0,
        letterGrade: j.letterGrade ?? '\u2014',
        topIssues: Array.isArray(j.topIssues) ? j.topIssues : [],
        issues: Array.isArray(j.issues) ? (j.issues as ReportIssue[]) : [],
        benchmark: j.benchmark ?? null,
        categoryScores: Array.isArray(j.categoryScores) ? j.categoryScores : [],
        hasPaidReport: j.hasPaidReport ?? false,
        reportStatus: j.reportStatus ?? 'none',
        pdfUrl: j.pdfUrl ?? null,
        markdownUrl: j.markdownUrl ?? null,
        checkoutMode: normalizeDeepAuditCheckoutMode(j.checkoutMode),
        deepAuditAvailable: j.deepAuditAvailable !== false,
      },
      error: null,
    };
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchScan();
        if (cancelled) return;
        if (!result.data) {
          setError(result.error ?? 'load_failed');
          return;
        }
        setError(null);
        setData(result.data);
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
      if (fresh.data) {
        setError(null);
        setData(fresh.data);
      } else if (fresh.error) {
        setError(fresh.error);
      }
      if (fresh.data?.reportStatus === 'generating') {
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
  if (error === 'expired') {
    return (
      <div className="rounded-xl bg-surface-container-low px-6 py-16">
        <h1 className="font-headline text-2xl font-bold text-on-background">This shared scan has expired</h1>
        <p className="mt-2 font-body text-on-surface-variant">
          Public scan links stay open for a limited window. Run a new scan to generate a fresh results page.
        </p>
      </div>
    );
  }
  if (error === 'forbidden') {
    return (
      <div className="rounded-xl bg-surface-container-low px-6 py-16">
        <h1 className="font-headline text-2xl font-bold text-on-background">This scan is private</h1>
        <p className="mt-2 font-body text-on-surface-variant">
          Sign in with the purchase email to access private scans and reports from your dashboard.
        </p>
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
  const hasDirectReportAccess = !!(data.pdfUrl || data.markdownUrl);
  const showCheckout = !data.hasPaidReport && turnstileSiteKey && data.deepAuditAvailable;
  const showEmailGate = !data.hasPaidReport && turnstileSiteKey;
  async function handleShareSnapshot(): Promise<void> {
    const shareUrl = window.location.href;
    const shareData = {
      title: `GEO-Pulse results for ${host}`,
      text: `AI Search Readiness snapshot for ${host}`,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setShareState({
          label: 'Snapshot ready to share',
          helper: 'The results link carries your score in the page title for social and chat link previews.',
        });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareState({
          label: 'Link copied',
          helper: 'Paste it anywhere to share this score snapshot. Previews show your score in the link title.',
        });
        return;
      }
    } catch {
      // fall through to manual copy guidance
    }

    setShareState({
      label: 'Copy the page URL',
      helper: 'This browser blocked direct sharing. Copy the current page URL from the address bar to share the snapshot.',
    });
  }

  const reportData: ScoreReportData = {
    domain: host,
    url: data.url,
    score: data.score,
    letterGrade: data.letterGrade,
    categoryScores: data.categoryScores,
    issues: data.issues,
  };

  return (
    <ScoreReport
      data={reportData}
      benchmark={data.benchmark ?? undefined}
      competitorSlot={
        turnstileSiteKey ? (
          <CompetitorCompare
            you={{
              domain: host,
              score: data.score,
              letterGrade: data.letterGrade,
              categoryScores: data.categoryScores,
            }}
            youUrl={data.url}
            siteKey={turnstileSiteKey}
            benchmark={data.benchmark ?? undefined}
          />
        ) : undefined
      }
      deepAuditSlot={
        <div className="space-y-6">
          {/* Report being generated */}
          {data.reportStatus === 'generating' && (
            <div className="rounded-2xl border border-primary/20 bg-surface-container-lowest p-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined animate-spin text-2xl text-primary">progress_activity</span>
                <div>
                  <p className="font-headline font-semibold text-on-background">Your full report is being prepared</p>
                  <p className="mt-1 font-sans text-sm text-on-surface-variant">
                    This can take a few minutes. The page updates automatically, and the finished report is emailed to you.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Delivered report access */}
          {data.reportStatus === 'delivered' && (
            <div className="rounded-xl border border-primary/20 bg-surface-container-lowest px-6 py-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-primary">task_alt</span>
                <div>
                  <p className="font-headline font-semibold text-on-background">
                    Your full report has been delivered
                  </p>
                  <p className="mt-1 font-body text-sm text-on-surface-variant">
                    {hasDirectReportAccess
                      ? 'Your report is in your checkout email, and the same assets are unlocked below.'
                      : 'Check your Stripe checkout email for the detailed PDF and prioritized action plan.'}
                  </p>
                </div>
              </div>
              {(data.pdfUrl || data.markdownUrl) && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {data.markdownUrl && (
                    <a
                      href={buildReportPath(data.scanId)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
                    >
                      <span className="material-symbols-outlined text-base">article</span>
                      View report
                    </a>
                  )}
                  {data.markdownUrl && (
                    <a
                      href={`/api/scans/${data.scanId}/report-markdown?download=1`}
                      className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
                    >
                      <span className="material-symbols-outlined text-base">description</span>
                      Download markdown
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
              <div className="mt-4 rounded-xl bg-surface-container-low px-4 py-4">
                <p className="font-body text-sm font-semibold text-on-background">
                  Want this report in your dashboard too?
                </p>
                <p className="mt-1 font-body text-sm leading-6 text-on-surface-variant">
                  Sign in with the same email you used in Stripe checkout to recover it from your dashboard.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href="/login?next=/dashboard"
                    className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-base">login</span>
                    Sign in to dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Checkout form (anchored target from CTA button) */}
          {!data.deepAuditAvailable ? (
            <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
              <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">Full audit</p>
              <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
                Full audit is disabled for this agency client
              </h2>
              <p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">
                GEO-Pulse admin has turned off the deep-audit module for this agency context.
              </p>
            </section>
          ) : null}

          {showCheckout ? (
            <section id="full-audit-checkout" className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 md:p-8">
              {data.checkoutMode === 'free' ? (
                <span className="inline-block rounded-md bg-green-100 px-2.5 py-1 font-label text-[0.62rem] font-bold uppercase tracking-widest text-green-800 dark:bg-green-500/15 dark:text-green-200">
                  Free &amp; open source
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-container-high px-2.5 py-1 font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">history</span>Legacy — paid (Stripe)
                </span>
              )}
              <h2 className="mt-3 font-headline text-2xl font-medium text-on-background">
                Get the full report
              </h2>
              <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-on-surface-variant">
                {getCheckoutModeCopy(data.checkoutMode)}
              </p>
              <div className="mt-5">
                <DeepAuditCheckout
                  siteKey={turnstileSiteKey}
                  scanId={data.scanId}
                  mode={data.checkoutMode}
                />
              </div>
            </section>
          ) : null}

          {showEmailGate ? (
            <section id="preview-save" className="mx-auto max-w-3xl">
              <EmailGate
                siteKey={turnstileSiteKey}
                scanId={data.scanId}
                url={data.url}
                score={data.score}
              />
            </section>
          ) : null}

          {/* Share + scan another */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => void handleShareSnapshot()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-2.5 font-sans text-sm text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-background"
            >
              <span className="material-symbols-outlined text-base">share</span>
              {shareState?.label ?? 'Share this scorecard'}
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 font-sans text-sm text-on-surface-variant transition hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Scan another URL
            </a>
          </div>
          {shareState?.helper ? (
            <p className="text-center font-sans text-xs text-on-surface-variant">{shareState.helper}</p>
          ) : null}
        </div>
      }
    />
  );
}
