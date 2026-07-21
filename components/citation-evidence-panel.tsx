import type { EngineEvidence } from '@/lib/server/citation-evidence';
import { runModeLabel } from '@/lib/server/citation-evidence';
import type { EngineKey } from '@/lib/server/dashboard-citation-metrics';

const ENGINE_LABEL: Record<EngineKey, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Bold every occurrence of the domain inside an excerpt, safely (plain string split, no HTML). */
function HighlightedExcerpt({ text, domain }: { text: string; domain: string }) {
  const parts = text.split(new RegExp(`(${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === domain.toLowerCase() ? (
          <strong key={i} className="font-bold text-on-background">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * The receipts behind every citation percentage: the exact questions asked, the answer sentence
 * that named the domain, and — for the losses — who got named instead. A number on this dashboard
 * should never be more than one click away from its evidence.
 */
export function CitationEvidencePanel({
  evidence,
  domain,
}: {
  evidence: readonly EngineEvidence[];
  domain: string;
}) {
  if (evidence.length === 0) return null;

  return (
    <article
      id="citation-evidence"
      data-testid="citation-evidence-panel"
      className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:p-6"
    >
      <h3 className="font-headline text-base font-semibold text-on-background">
        Where these numbers come from
      </h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
        Every percentage on this page is computed from real question-and-answer runs. Here is the latest
        run per engine — the questions we asked, the sentence that named {domain} when it was cited, and
        who the answer named instead when it wasn’t.
      </p>

      <div className="mt-4 space-y-3">
        {evidence.map((engine) => (
          <details
            key={engine.engine}
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low"
            open={evidence.length === 1}
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="font-sans text-sm font-bold text-on-background">{ENGINE_LABEL[engine.engine]}</span>
                <span className="font-sans text-sm font-black tabular-nums text-on-background">
                  {engine.citedCount}/{engine.totalCount}
                </span>
                <span className="text-xs text-on-surface-variant">answers named {domain}</span>
              </span>
              <span className="text-[11px] text-on-surface-variant">
                {runModeLabel(engine.runMode)} · measured {formatDate(engine.executedAt)}
              </span>
            </summary>
            <ul className="divide-y divide-outline-variant/15 border-t border-outline-variant/15 px-4">
              {engine.rows.map((row) => (
                <li key={row.queryText} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-on-background">“{row.queryText}”</p>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                        row.cited
                          ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200'
                          : 'bg-error/15 text-error'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]" aria-hidden>
                        {row.cited ? 'check_circle' : 'cancel'}
                      </span>
                      {row.cited ? 'You were named' : 'Not named'}
                    </span>
                  </div>
                  {row.cited && row.excerpt ? (
                    <blockquote className="mt-1.5 border-l-2 border-green-600/50 pl-3 text-xs leading-relaxed text-on-surface-variant dark:border-green-400/50">
                      “<HighlightedExcerpt text={row.excerpt} domain={domain} />”
                    </blockquote>
                  ) : null}
                  {!row.cited && row.namedInstead.length > 0 ? (
                    <p className="mt-1.5 text-xs text-on-surface-variant">
                      Named instead:{' '}
                      <span className="font-medium text-on-background">{row.namedInstead.join(', ')}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </article>
  );
}
