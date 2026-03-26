'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

type ViewState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; markdown: string; scanId: string; pdfUrl: string | null };

type TocEntry = { id: string; text: string; level: number };

function extractToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = m[2]?.trim() ?? '';
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    entries.push({ id, text, level: m[1]!.length });
  }
  return entries;
}

function slugify(text: string): string {
  const plain = typeof text === 'string' ? text : String(text);
  return plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

const mdComponents: Components = {
  h1: ({ children }) => {
    const text = extractText(children);
    return <h1 id={slugify(text)}>{children}</h1>;
  },
  h2: ({ children }) => {
    const text = extractText(children);
    return <h2 id={slugify(text)}>{children}</h2>;
  },
  h3: ({ children }) => {
    const text = extractText(children);
    return <h3 id={slugify(text)}>{children}</h3>;
  },
  td: ({ children }) => {
    const text = extractText(children);
    if (text === 'PASS') return <td className="font-semibold text-green-700">{children}</td>;
    if (text === 'FAIL') return <td className="font-semibold text-red-700">{children}</td>;
    if (text === 'N/A' || text === '—') return <td className="text-slate-400">{children}</td>;
    return <td>{children}</td>;
  },
};

function TocSidebar({ entries, activeId }: { entries: TocEntry[]; activeId: string }) {
  if (entries.length === 0) return null;
  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
      <p className="mb-3 font-label text-xs font-semibold uppercase tracking-widest text-on-surface-variant">On this page</p>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li key={e.id} style={{ paddingLeft: `${(e.level - 1) * 12}px` }}>
            <a
              href={`#${e.id}`}
              className={`block truncate rounded px-2 py-1 font-body text-xs transition ${
                activeId === e.id
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-background'
              }`}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ReportViewer({ scanId }: { scanId: string }) {
  const [state, setState] = useState<ViewState>({ phase: 'loading' });
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/scans/${scanId}`);
        if (!res.ok) {
          setState({ phase: 'error', message: 'Could not load scan data.' });
          return;
        }
        const data = (await res.json()) as {
          markdownUrl?: string | null;
          pdfUrl?: string | null;
          reportStatus?: string;
        };

        if (!data.markdownUrl) {
          setState({ phase: 'error', message: 'No report available yet. The report may still be generating.' });
          return;
        }

        const mdRes = await fetch(data.markdownUrl);
        if (!mdRes.ok) {
          setState({ phase: 'error', message: 'Could not fetch report content.' });
          return;
        }
        const markdown = await mdRes.text();
        if (!cancelled) {
          setState({ phase: 'ready', markdown, scanId, pdfUrl: data.pdfUrl ?? null });
        }
      } catch {
        if (!cancelled) {
          setState({ phase: 'error', message: 'Network error loading report.' });
        }
      }
    }

    void load();
    return () => { cancelled = true; };
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
    const headings = document.querySelectorAll('article h1[id], article h2[id], article h3[id]');
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [state]);

  const tocEntries = useMemo(
    () => (state.phase === 'ready' ? extractToc(state.markdown) : []),
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
        <span className="material-symbols-outlined mb-4 text-5xl text-outline-variant">description_off</span>
        <p className="font-body text-on-surface-variant">{state.message}</p>
        <Link href={`/results/${scanId}`} className="mt-6 inline-block font-body text-sm text-primary underline">
          Back to results
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <nav className="mb-8 flex items-center justify-between">
        <Link href={`/results/${state.scanId}`} className="inline-flex items-center gap-1 font-body text-sm text-primary hover:underline">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to results
        </Link>
        <div className="flex gap-3">
          {state.pdfUrl && (
            <a
              href={state.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 font-body text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              PDF
            </a>
          )}
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_220px]">
        <article className="prose prose-slate max-w-none rounded-xl bg-surface-container-lowest p-8 shadow-float md:p-12 dark:prose-invert prose-headings:font-headline prose-headings:text-on-background prose-p:text-on-surface-variant prose-a:text-primary prose-strong:text-on-background prose-th:text-on-background prose-td:text-on-surface-variant">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {state.markdown}
          </ReactMarkdown>
        </article>

        <TocSidebar entries={tocEntries} activeId={activeId} />
      </div>
    </div>
  );
}
