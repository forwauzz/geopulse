'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Issue = {
  check?: string;
  checkId?: string;
  finding?: string;
  fix?: string;
  weight?: number;
  passed?: boolean;
  status?: string;
  category?: string;
  confidence?: string;
};

type CategoryScore = {
  category: string;
  score: number;
  letterGrade: string;
  checkCount: number;
};

type ScanResponse = {
  scanId: string;
  url: string;
  domain?: string | null;
  score: number | null;
  letterGrade: string | null;
  topIssues: Issue[];
  categoryScores: CategoryScore[];
  pdfUrl?: string | null;
  markdownUrl?: string | null;
};

type ViewState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      markdown: string;
      scan: ScanResponse;
      pdfUrl: string | null;
    };

type TocEntry = { id: string; text: string; level: number };

type MarkdownSection = {
  id: string;
  title: string;
  content: string;
  defaultOpen: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI Readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand Coverage',
  conversion_readiness: 'Conversion',
};

const CATEGORY_ICONS: Record<string, string> = {
  ai_readiness: 'smart_toy',
  extractability: 'edit_note',
  trust: 'verified_user',
  demand_coverage: 'query_stats',
  conversion_readiness: 'conversion_path',
};

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

function extractToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = m[2]?.trim() ?? '';
    const id = slugify(text);
    entries.push({ id, text, level: m[1]!.length });
  }
  return entries;
}

function splitMarkdownSections(md: string): MarkdownSection[] {
  const lines = md.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentTitle = 'Overview';
  let currentLines: string[] = [];
  let initialized = false;

  const pushSection = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;
    const title = currentTitle.trim() || 'Section';
    const titleLower = title.toLowerCase();
    sections.push({
      id: slugify(title),
      title,
      content,
      defaultOpen: titleLower.includes('executive summary') || titleLower.includes('priority action plan'),
    });
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (initialized) pushSection();
      currentTitle = heading[1]?.trim() ?? 'Section';
      currentLines = [line];
      initialized = true;
      continue;
    }

    currentLines.push(line);
    initialized = true;
  }

  pushSection();
  return sections;
}

function clampScore(score: number | null | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function categoryScoreTone(score: number): string {
  if (score >= 75) return 'bg-green-50 text-green-700';
  if (score >= 45) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function issueSeverity(weight: number | undefined): 'High' | 'Medium' | 'Low' {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

function issueSeverityClasses(severity: ReturnType<typeof issueSeverity>): string {
  if (severity === 'High') return 'bg-red-100 text-red-800';
  if (severity === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function scoreNarrative(score: number): string {
  if (score >= 90) return 'Excellent readiness. Minor refinements only.';
  if (score >= 75) return 'Strong readiness. Close a few gaps to improve clarity.';
  if (score >= 55) return 'Mixed readiness. Key signals are missing or inconsistent.';
  if (score >= 35) return 'Low readiness. Address the critical gaps first.';
  return 'Critical readiness gaps. Prioritize the fixes below.';
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
    if (text === 'LOW_CONFIDENCE') return <td className="font-semibold text-amber-700">{children}</td>;
    if (text === 'BLOCKED') return <td className="font-semibold text-slate-700">{children}</td>;
    if (text === 'WARNING') return <td className="font-semibold text-amber-700">{children}</td>;
    if (text === 'NOT_EVALUATED' || text === 'N/A' || text === '-') return <td className="text-slate-400">{children}</td>;
    return <td>{children}</td>;
  },
};

function TocSidebar({ entries, activeId }: { entries: TocEntry[]; activeId: string }) {
  if (entries.length === 0) return null;
  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
      <p className="mb-3 font-label text-xs font-semibold uppercase tracking-widest text-on-surface-variant">On this page</p>
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
            <a
              href={`#${entry.id}`}
              className={`block truncate rounded px-2 py-1 font-body text-xs transition ${
                activeId === entry.id
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-background'
              }`}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ReportSummary({ scan }: { scan: ScanResponse }) {
  const score = clampScore(scan.score);
  const issues = Array.isArray(scan.topIssues) ? scan.topIssues : [];
  const sortedIssues = [...issues].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const categoryScores = Array.isArray(scan.categoryScores) ? scan.categoryScores : [];

  return (
    <section className="space-y-6 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-float md:p-8">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl bg-surface-container-low p-6 text-center">
          <div className="font-headline text-5xl font-bold text-primary">{score}</div>
          <div className="mt-1 font-label text-xs uppercase tracking-widest text-on-surface-variant">Overall score</div>
          <div className="mt-5 inline-flex rounded-full bg-primary/10 px-3 py-1 font-label text-xs font-semibold uppercase tracking-wider text-primary">
            {scan.letterGrade ?? '-'}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Interactive summary</p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">{scan.domain ?? scan.url}</h1>
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
              {scoreNarrative(score)} Use this view to scan category health, review the highest-impact fixes, and then expand the full report sections below.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {categoryScores.map((category) => {
              const label = CATEGORY_LABELS[category.category] ?? category.category;
              const icon = CATEGORY_ICONS[category.category] ?? 'check_circle';
              return (
                <div key={category.category} className={`rounded-xl p-4 ${categoryScoreTone(category.score)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                    <span className="font-label text-[10px] font-semibold uppercase tracking-widest">{category.letterGrade}</span>
                  </div>
                  <div className="mt-3 font-headline text-2xl font-bold">{category.score}</div>
                  <div className="mt-1 font-body text-xs">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-headline text-xl font-semibold text-on-background">Top issues</h2>
          <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant">{sortedIssues.length} surfaced</span>
        </div>
        {sortedIssues.length === 0 ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-5 font-body text-sm text-on-surface-variant">
            No priority issues were surfaced in the current scan output.
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedIssues.map((issue, index) => {
              const severity = issueSeverity(issue.weight);
              return (
                <article key={`${issue.checkId ?? issue.check ?? 'issue'}-${index}`} className="rounded-xl bg-surface-container-low p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${issueSeverityClasses(severity)}`}>
                      {severity}
                    </span>
                    <span className="font-semibold text-on-background">{issue.check ?? issue.checkId ?? 'Check'}</span>
                    {issue.status ? (
                      <span className="rounded bg-surface-container-high px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {issue.status}
                      </span>
                    ) : null}
                  </div>
                  {issue.finding ? <p className="mt-2 font-body text-sm text-on-surface-variant">{issue.finding}</p> : null}
                  {issue.fix ? (
                    <p className="mt-3 rounded-lg bg-surface-container-high px-3 py-2 font-body text-sm text-on-background/90">
                      <span className="font-semibold">Fix:</span> {issue.fix}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionChips({ sections }: { sections: MarkdownSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="whitespace-nowrap rounded-full border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5 font-body text-xs font-semibold text-on-background"
        >
          {section.title}
        </a>
      ))}
    </div>
  );
}

function ReportSections({ sections }: { sections: MarkdownSection[] }) {
  const defaultOpen = useMemo(() => new Set(sections.filter((section) => section.defaultOpen).map((section) => section.id)), [sections]);
  const [openSections, setOpenSections] = useState<Set<string>>(defaultOpen);

  useEffect(() => {
    setOpenSections(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const isOpen = openSections.has(section.id);
        return (
          <section key={section.id} id={section.id} className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float">
            <button
              type="button"
              onClick={() => {
                setOpenSections((current) => {
                  const next = new Set(current);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                });
              }}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              aria-expanded={isOpen}
              aria-controls={`${section.id}-panel`}
            >
              <div>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Report section</p>
                <h2 className="mt-1 font-headline text-xl font-semibold text-on-background">{section.title}</h2>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">{isOpen ? 'remove' : 'add'}</span>
            </button>
            {isOpen ? (
              <div id={`${section.id}-panel`} className="border-t border-outline-variant/10 px-5 py-5 md:px-6">
                <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:font-headline prose-headings:text-on-background prose-p:text-on-surface-variant prose-a:text-primary prose-strong:text-on-background prose-th:text-on-background prose-td:text-on-surface-variant">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {section.content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
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
        const scan = (await res.json()) as ScanResponse;

        if (!scan.markdownUrl) {
          setState({ phase: 'error', message: 'No report available yet. The report may still be generating.' });
          return;
        }

        const mdRes = await fetch(scan.markdownUrl);
        if (!mdRes.ok) {
          setState({ phase: 'error', message: 'Could not fetch report content.' });
          return;
        }

        const markdown = await mdRes.text();
        if (!cancelled) {
          setState({ phase: 'ready', markdown, scan, pdfUrl: scan.pdfUrl ?? null });
        }
      } catch {
        if (!cancelled) {
          setState({ phase: 'error', message: 'Network error loading report.' });
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

    const headings = document.querySelectorAll('main article h1[id], main article h2[id], main article h3[id], main section[id]');
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [state]);

  const tocEntries = useMemo(() => (state.phase === 'ready' ? extractToc(state.markdown) : []), [state]);
  const sections = useMemo(() => (state.phase === 'ready' ? splitMarkdownSections(state.markdown) : []), [state]);

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
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link href={`/results/${state.scan.scanId}`} className="inline-flex items-center gap-1 font-body text-sm text-primary hover:underline">
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
