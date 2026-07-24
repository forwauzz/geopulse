'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import {
  ReportSections,
  SectionChips,
  TocSidebar,
} from '@/components/report-viewer-sections';
import { ReportStory } from '@/components/report-story';
import {
  splitMarkdownSections,
  type ScanResponse,
  type ViewState,
} from '@/lib/client/report-viewer';
import { reportLoadingJourneyFor } from '@/lib/client/loading-journeys';

const REPORT_POLL_INTERVAL_MS = 4000;
// Crawl (up to DEEP_AUDIT_DEFAULT_PAGE_LIMIT pages) + LLM report assembly can run past 2 min on
// slower sites; give the page enough headroom to resolve to the report instead of falsely
// reporting "no report available" while it's still being built.
const REPORT_POLL_MAX_MS = 240000;

export function ReportViewer({ scanId }: { scanId: string }) {
  const [state, setState] = useState<ViewState>({ phase: 'loading' });
  const [deliveryState, setDeliveryState] = useState<
    { status: 'idle' | 'sending' | 'sent' | 'error'; message: string | null }
  >({ status: 'idle', message: null });
  const [activeId, setActiveId] = useState('');
  const loadingJourney = useMemo(() => reportLoadingJourneyFor(scanId), [scanId]);
  useLongWaitEffect(state.phase === 'loading', loadingJourney);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    async function load() {
      try {
        const res = await fetch(`/api/scans/${scanId}`);
        if (!res.ok) {
          if (!cancelled) {
            setState({ phase: 'error', message: 'Could not load scan data.', pdfUrl: null });
          }
          return;
        }
        const scan = (await res.json()) as ScanResponse;

        if (!scan.markdownUrl) {
          const shouldKeepPolling =
            scan.reportStatus === 'generating' ||
            scan.hasPaidReport === true ||
            (scan.pdfUrl != null && scan.reportStatus !== 'none');

          if (shouldKeepPolling && Date.now() - startedAt < REPORT_POLL_MAX_MS) {
            if (!cancelled) {
              setState({ phase: 'loading' });
              pollTimer = setTimeout(() => {
                void load();
              }, REPORT_POLL_INTERVAL_MS);
            }
            return;
          }

          if (!cancelled) {
            setState({
              phase: 'error',
              message: scan.pdfUrl
                ? 'This report is available as a PDF download only.'
                : 'No web report is available yet. The report may still be generating.',
              pdfUrl: scan.pdfUrl ?? null,
            });
          }
          return;
        }

        const mdRes = await fetch(`/api/scans/${scanId}/report-markdown`, { cache: 'no-store' });
        if (!mdRes.ok) {
          if (!cancelled) {
            setState({ phase: 'error', message: 'Could not fetch report content.', pdfUrl: scan.pdfUrl ?? null });
          }
          return;
        }

        const markdown = await mdRes.text();
        if (!cancelled) {
          setState({ phase: 'ready', markdown, scan, pdfUrl: scan.pdfUrl ?? null });
        }
      } catch {
        if (!cancelled) {
          setState({ phase: 'error', message: 'Network error loading report.', pdfUrl: null });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [scanId]);

  useEffect(() => {
    setDeliveryState({ status: 'idle', message: null });
  }, [scanId]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );

    const headings = document.querySelectorAll(
      'main article h1[id], main article h2[id], main article h3[id], main section[id]'
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [state]);

  const sections = useMemo(
    () => (state.phase === 'ready' ? splitMarkdownSections(state.markdown) : []),
    [state]
  );
  const tocEntries = useMemo(
    () => sections.map((section) => ({ id: section.id, text: section.title, level: 2 })),
    [sections]
  );

  async function resendReportEmail() {
    if (state.phase !== 'ready') return;
    if (!state.scan.viewerEmail) {
      setDeliveryState({
        status: 'error',
        message: 'No profile email is available for this report.',
      });
      return;
    }

    setDeliveryState({ status: 'sending', message: 'Sending report email...' });
    try {
      const res = await fetch(`/api/reports/${state.scan.scanId}/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setDeliveryState({
          status: 'error',
          message: payload.error?.message ?? 'Could not resend the report email.',
        });
        return;
      }

      setDeliveryState({
        status: 'sent',
        message: `Sent to ${state.scan.viewerEmail}.`,
      });
    } catch {
      setDeliveryState({
        status: 'error',
        message: 'Network error while sending the report email.',
      });
    }
  }

  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-body text-sm text-on-surface-variant">Loading report...</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="material-symbols-outlined mb-4 text-5xl text-outline-variant">
          description_off
        </span>
        <p className="font-body text-on-surface-variant">{state.message}</p>
        {state.pdfUrl ? (
          <a
            href={state.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Download PDF
          </a>
        ) : null}
        <Link
          href={`/results/${scanId}`}
          className="mt-6 inline-block font-body text-sm text-primary underline"
        >
          Back to results
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <nav className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/results/${state.scan.scanId}`}
          className="inline-flex items-center gap-1 font-body text-sm text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to results
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {state.scan.viewerEmail ? (
            <button
              type="button"
              onClick={() => {
                void resendReportEmail();
              }}
              disabled={deliveryState.status === 'sending'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              {deliveryState.status === 'sending' ? 'Sending...' : 'Resend email'}
            </button>
          ) : null}
          {state.scan.startupWorkspaceId ? (
            <Link
              href={`/dashboard/startup?startupWorkspace=${state.scan.startupWorkspaceId}&tab=delivery`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-sm">chat</span>
              Slack delivery
            </Link>
          ) : null}
          {state.scan.startupWorkspaceId ? (
            <Link
              href={`/dashboard/connectors?startupWorkspace=${state.scan.startupWorkspaceId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-sm">integration_instructions</span>
              GitHub connectors
            </Link>
          ) : null}
          {state.pdfUrl ? (
            <a
              href={state.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              PDF
            </a>
          ) : null}
          <a
            href={`/api/scans/${state.scan.scanId}/report-markdown?download=1`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-sm">description</span>
            Markdown
          </a>
        </div>
      </nav>

      {deliveryState.message ? (
        <p
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            deliveryState.status === 'error'
              ? 'bg-error/10 text-error'
              : deliveryState.status === 'sent'
                ? 'bg-primary/10 text-primary'
                : 'bg-surface-container-low text-on-surface-variant'
          }`}
        >
          {deliveryState.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_220px]">
        <main className="space-y-6">
          {state.phase === 'ready' ? (
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Your report
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">
                {state.scan.reportStatus === 'delivered'
                  ? 'The full report is ready below — the PDF was also emailed to the address you provided.'
                  : state.scan.reportStatus === 'generating'
                    ? 'We are assembling your PDF — it will land in your inbox shortly. Everything is already readable below.'
                    : 'The full report is ready below.'}
                {state.scan.viewerEmail ? (
                  <>
                    {' '}
                    Sent to <strong className="text-on-background">{state.scan.viewerEmail}</strong>.
                  </>
                ) : null}
              </p>
              {/* Full-audit scores span every crawled page, so they can differ from the
                  single-page scorecard — say so before the user wonders (issue #129). */}
              <p className="mt-1 text-xs text-on-surface-variant">
                This score reflects your whole site across every page we crawled, so it can differ
                from the single-page scorecard you saw first.
              </p>
            </div>
          ) : null}
          <ReportStory scan={state.scan} />
          <div className="pt-4">
            <h2 className="font-sans text-2xl font-bold tracking-tight text-on-background">Full evidence</h2>
            <p className="mt-1 font-body text-sm text-on-surface-variant">
              Open a section when you need the supporting detail, implementation notes, or technical appendix.
            </p>
          </div>
          <SectionChips sections={sections} />
          <article>
            <ReportSections sections={sections} />
          </article>
        </main>

        <TocSidebar entries={tocEntries} activeId={activeId} />
      </div>
    </div>
  );
}
