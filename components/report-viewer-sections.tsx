'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  buildDisplayIssues,
  buildSummaryFacts,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  categoryScoreTone,
  clampScore,
  issueSeverity,
  issueSeverityClasses,
  scoreNarrative,
  slugify,
  type MarkdownSection,
  type ScanResponse,
  type TocEntry,
} from '@/lib/client/report-viewer';

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
    if (text === 'LOW_CONFIDENCE')
      return <td className="font-semibold text-amber-700">{children}</td>;
    if (text === 'BLOCKED') return <td className="font-semibold text-on-background">{children}</td>;
    if (text === 'WARNING') return <td className="font-semibold text-amber-700">{children}</td>;
    if (text === 'NOT_EVALUATED' || text === 'N/A' || text === '-')
      return <td className="text-on-surface-variant">{children}</td>;
    return <td>{children}</td>;
  },
};

export function TocSidebar({
  entries,
  activeId,
}: {
  entries: TocEntry[];
  activeId: string;
}) {
  if (entries.length === 0) return null;
  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
      <p className="mb-3 font-label text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
        On this page
      </p>
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

export function ReportSummary({ scan }: { scan: ScanResponse }) {
  const score = clampScore(scan.score);
  const displayIssues = buildDisplayIssues(scan);
  const categoryScores = Array.isArray(scan.categoryScores) ? scan.categoryScores : [];
  const summaryFacts = buildSummaryFacts(scan);

  function summaryFactClasses(tone: 'default' | 'danger' | 'warning' | 'success' = 'default'): string {
    if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900';
    if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
    if (tone === 'success') return 'border-green-200 bg-green-50 text-green-900';
    return 'border-outline-variant/20 bg-surface-container-low text-on-background';
  }

  return (
    <section className="space-y-6 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-float md:p-8">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl bg-surface-container-low p-6 text-center">
          <div className="font-headline text-5xl font-bold text-primary">{score}</div>
          <div className="mt-1 font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Overall score
          </div>
          <div className="mt-5 inline-flex rounded-full bg-primary/10 px-3 py-1 font-label text-xs font-semibold uppercase tracking-wider text-primary">
            {scan.letterGrade ?? '-'}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Interactive summary
            </p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
              {scan.domain ?? scan.url}
            </h1>
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
              {scoreNarrative(score)} Use this view to scan category health, review the
              highest-impact fixes, and then expand the full report sections below.
            </p>
          </div>

          {summaryFacts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {summaryFacts.map((fact) => (
                <div
                  key={`${fact.label}-${fact.value}`}
                  className={`rounded-xl border px-4 py-3 ${summaryFactClasses(fact.tone)}`}
                >
                  <div className="font-label text-[10px] font-semibold uppercase tracking-widest opacity-75">
                    {fact.label}
                  </div>
                  <div className="mt-2 font-body text-sm font-semibold leading-snug">
                    {fact.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {categoryScores.map((category) => {
              const label = CATEGORY_LABELS[category.category] ?? category.category;
              const icon = CATEGORY_ICONS[category.category] ?? 'check_circle';
              return (
                <div
                  key={category.category}
                  className={`rounded-xl p-4 ${categoryScoreTone(category.score)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                    <span className="font-label text-[10px] font-semibold uppercase tracking-widest">
                      {category.letterGrade}
                    </span>
                  </div>
                  <div className="mt-3 font-headline text-2xl font-bold">
                    {category.score}
                  </div>
                  <div className="mt-1 font-body text-xs">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-headline text-xl font-semibold text-on-background">
            Top issues
          </h2>
          <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            {displayIssues.length} shown
          </span>
        </div>
        {displayIssues.length === 0 ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-5 font-body text-sm text-on-surface-variant">
            No priority issues were surfaced in the current scan output.
          </div>
        ) : (
          <div className="grid gap-3">
            {displayIssues.map((issue, index) => {
              return (
                <article
                  key={`${issue.title}-${index}`}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${issueSeverityClasses(
                        issue.severity
                      )}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="font-semibold text-on-background">
                      {issue.title}
                    </span>
                    {issue.status ? (
                      <span className="rounded bg-surface-container-high px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {issue.status}
                      </span>
                    ) : null}
                    {issue.owner ? (
                      <span className="rounded border border-outline-variant/20 px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {issue.owner}
                      </span>
                    ) : null}
                  </div>
                  {issue.problem ? (
                    <div className="mt-3">
                      <div className="font-label text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                        Problem
                      </div>
                      <p className="mt-1 font-body text-sm text-on-surface-variant">
                        {issue.problem}
                      </p>
                    </div>
                  ) : null}
                  {issue.firstMove ? (
                    <div className="mt-3 rounded-lg bg-surface-container-high px-3 py-3">
                      <div className="font-label text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                        First move
                      </div>
                      <p className="mt-1 font-body text-sm text-on-background/90">
                        {issue.firstMove}
                      </p>
                    </div>
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

export function SectionChips({ sections }: { sections: MarkdownSection[] }) {
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

export function ReportSections({ sections }: { sections: MarkdownSection[] }) {
  const defaultOpen = useMemo(
    () =>
      new Set(
        sections.filter((section) => section.defaultOpen).map((section) => section.id)
      ),
    [sections]
  );
  const [openSections, setOpenSections] = useState<Set<string>>(defaultOpen);

  useEffect(() => {
    setOpenSections(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const isOpen = openSections.has(section.id);
        return (
          <section
            key={section.id}
            id={section.id}
            className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float"
          >
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
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Report section
                </p>
                <h2 className="mt-1 font-headline text-xl font-semibold text-on-background">
                  {section.title}
                </h2>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">
                {isOpen ? 'remove' : 'add'}
              </span>
            </button>
            {isOpen ? (
              <div
                id={`${section.id}-panel`}
                className="border-t border-outline-variant/10 px-5 py-5 md:px-6"
              >
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
