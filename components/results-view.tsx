'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DeepAuditCheckout } from '@/components/deep-audit-checkout';
import { EmailGate } from '@/components/email-gate';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { ScoreDisplay } from '@/components/score-display';
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
type ResultsActionCard = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref?: string;
  primaryTargetId?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  secondaryTargetId?: string;
  note?: string;
};

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

function buildActionCard(input: {
  host: string;
  reportStatus: ReportStatus;
  hasPaidReport: boolean;
  hasDirectReportAccess: boolean;
  scanId: string;
  pdfUrl: string | null;
  markdownUrl: string | null;
}): ResultsActionCard {
  if (input.reportStatus === 'delivered') {
    return {
      eyebrow: 'Step 4',
      title: 'Your report is ready',
      body: input.hasDirectReportAccess
        ? 'Open the interactive report, download the PDF, or sign in with the checkout email if you want it saved in your dashboard.'
        : 'Your report was delivered to the Stripe checkout email. Sign in with that same email if you want to recover it in your dashboard later.',
      primaryLabel: input.markdownUrl ? 'Open report now' : input.pdfUrl ? 'Download PDF' : 'Open dashboard',
      primaryHref: input.markdownUrl ? buildReportPath(input.scanId) : input.pdfUrl ?? '/dashboard',
      secondaryLabel: 'Sign in to dashboard',
      secondaryHref: '/login?next=/dashboard',
      note: 'Delivery email remains the source of truth for the paid report, but the same checkout email can also unlock dashboard recovery.',
    };
  }

  if (input.reportStatus === 'generating') {
    return {
      eyebrow: 'Step 3',
      title: 'Your full audit is being prepared',
      body: `We are building the longer report for ${input.host}. Stay on this page if you want to watch for delivery, or come back from your email and dashboard later.`,
      primaryLabel: 'Refresh status',
      primaryHref: `/results/${input.scanId}`,
      secondaryLabel: 'Open dashboard sign-in',
      secondaryHref: '/login?next=/dashboard',
      note: 'The finished report goes to the Stripe checkout email. This page also polls for delivery for a short window.',
    };
  }

  return {
    eyebrow: 'Step 2',
    title: input.hasPaidReport ? 'Report queued — check back soon' : 'Choose what to do next',
    body: input.hasPaidReport
      ? `Your payment was received for ${input.host}. The full audit will begin shortly — you'll get an email when it's ready.`
      : `You've seen your score for ${input.host}. Upgrade to a full audit to get prioritized recommendations, technical fixes, and a downloadable PDF report.`,
    primaryLabel: input.hasPaidReport ? 'Check dashboard' : 'Start full audit',
    primaryHref: input.hasPaidReport ? '/dashboard' : undefined,
    primaryTargetId: input.hasPaidReport ? undefined : 'full-audit-checkout',
    secondaryLabel: input.hasPaidReport ? undefined : 'Save preview',
    secondaryHref: undefined,
    secondaryTargetId: input.hasPaidReport ? undefined : 'preview-save',
  };
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
          Your AI search readiness score for <span className="font-medium text-on-background">{host}</span>.
        </p>
      </section>

      {(() => {
        const actionCard = buildActionCard({
          host,
          reportStatus: data.reportStatus,
          hasPaidReport: data.hasPaidReport,
          hasDirectReportAccess,
          scanId: data.scanId,
          pdfUrl: data.pdfUrl,
          markdownUrl: data.markdownUrl,
        });

        return (
          <section className="mb-8 rounded-[28px] border border-outline-variant/20 bg-on-background px-6 py-6 text-surface md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-label text-xs uppercase tracking-[0.22em] text-surface/70">
                  {actionCard.eyebrow}
                </p>
                <h2 className="mt-2 font-headline text-2xl font-bold text-surface-container-lowest">
                  {actionCard.title}
                </h2>
                <p className="mt-3 font-body text-sm leading-6 text-surface/75">{actionCard.body}</p>
                {actionCard.note ? (
                  <p className="mt-3 font-body text-xs leading-5 text-surface/60">{actionCard.note}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {actionCard.primaryHref ? (
                  <Link
                    href={actionCard.primaryHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-5 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface"
                  >
                    <span className="material-symbols-outlined text-base">
                      {data.reportStatus === 'delivered' ? 'description' : data.reportStatus === 'generating' ? 'refresh' : 'arrow_downward'}
                    </span>
                    {actionCard.primaryLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const target = actionCard.primaryTargetId
                        ? document.getElementById(actionCard.primaryTargetId)
                        : null;
                      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-5 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface"
                  >
                    <span className="material-symbols-outlined text-base">arrow_downward</span>
                    {actionCard.primaryLabel}
                  </button>
                )}
                {actionCard.secondaryLabel ? (
                  actionCard.secondaryHref ? (
                    <Link
                      href={actionCard.secondaryHref}
                      className="inline-flex items-center gap-2 rounded-xl border border-surface/20 px-5 py-3 font-body text-sm font-semibold text-surface-container-lowest transition hover:bg-surface/10"
                    >
                      <span className="material-symbols-outlined text-base">
                        {data.reportStatus === 'delivered' ? 'login' : data.reportStatus === 'generating' ? 'login' : 'bookmark'}
                      </span>
                      {actionCard.secondaryLabel}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const target = actionCard.secondaryTargetId
                          ? document.getElementById(actionCard.secondaryTargetId)
                          : null;
                        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-surface/20 px-5 py-3 font-body text-sm font-semibold text-surface-container-lowest transition hover:bg-surface/10"
                    >
                      <span className="material-symbols-outlined text-base">bookmark</span>
                      {actionCard.secondaryLabel}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </section>
        );
      })()}

      <ScoreDisplay
        score={data.score}
        letterGrade={data.letterGrade}
        issues={data.topIssues}
        categoryScores={data.categoryScores}
        snapshotAction={handleShareSnapshot}
        snapshotState={shareState}
      />

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
                Sign in with the same email you used in Stripe checkout. GEO-Pulse links paid reports to that email so you can recover them later from your dashboard.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/login?next=/dashboard`}
                  className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  Sign in to dashboard
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-3 font-body text-sm font-semibold text-primary transition hover:underline"
                >
                  <span className="material-symbols-outlined text-base">dashboard</span>
                  Open dashboard
                </Link>
              </div>
            </div>
          </div>
        )}

        {!data.deepAuditAvailable ? (
          <section className="rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-6 md:p-8">
            <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
              Full audit
            </p>
            <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
              Full audit is disabled for this agency client
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-on-surface-variant">
              GEO-Pulse admin has turned off the deep-audit module for this agency context. The preview remains
              available, but the full-audit path is currently locked.
            </p>
          </section>
        ) : null}

        {showCheckout ? (
          <section id="full-audit-checkout" className="rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-6 md:p-8">
            <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
              Step 2
            </p>
            <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
              Continue from preview to the full audit
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-on-surface-variant">
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
