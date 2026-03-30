'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import {
  ReportSections,
  ReportSummary,
  SectionChips,
  TocSidebar,
} from '@/components/report-viewer-sections';
import {
  extractToc,
  splitMarkdownSections,
  type ScanResponse,
  type ViewState,
} from '@/lib/client/report-viewer';
import { reportLoadingJourney } from '@/lib/client/loading-journeys';

export function ReportViewer({ scanId }: { scanId: string }) {
  const [state, setState] = useState<ViewState>({ phase: 'loading' });
  const [activeId, setActiveId] = useState('');
  useLongWaitEffect(state.phase === 'loading', reportLoadingJourney);

  useEffect(() => {
    let cancelled = false;

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

        const mdRes = await fetch(scan.markdownUrl);
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
    };
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

  const tocEntries = useMemo(
    () => (state.phase === 'ready' ? extractToc(state.markdown) : []),
    [state]
  );
  const sections = useMemo(
    () => (state.phase === 'ready' ? splitMarkdownSections(state.markdown) : []),
    [state]
  );

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
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link
          href={`/results/${state.scan.scanId}`}
          className="inline-flex items-center gap-1 font-body text-sm text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to results
        </Link>
        <div className="flex flex-wrap gap-3">
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
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_220px]">
        <main className="space-y-6">
          <ReportSummary scan={state.scan} />
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
