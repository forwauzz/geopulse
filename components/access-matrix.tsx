'use client';

/**
 * Access & Eligibility Matrix (spec C3) — the per-destination headline diagnostic.
 * Renders three visually distinct pieces:
 *   1. a scanner-block diagnosis card (only when our own fetch was blocked, spec C4),
 *   2. the eligibility matrix (Eligible / Blocked / Not tested per AI destination),
 *   3. the Training / IP decision panel — deliberately separated and framed as a
 *      business choice, never a failure.
 */

export type AccessMatrixData = {
  registryVersion: string;
  rows: {
    destination: string;
    label: string;
    status: 'eligible' | 'blocked' | 'not_tested';
    control: string;
    detail: string;
    fix?: string;
  }[];
  trainingPanel: {
    token: string;
    vendor: string;
    allowed: boolean | null;
    note: string;
  }[];
  diagnosis: {
    pageFetched: boolean;
    blockKind: string;
    rootCause: string | null;
    safelistSteps: string[];
    robotsTxtAvailable: boolean;
  };
};

function StatusPill({ status }: { status: 'eligible' | 'blocked' | 'not_tested' }) {
  if (status === 'eligible') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 font-label text-[0.65rem] font-bold uppercase tracking-widest text-green-800 dark:bg-green-500/15 dark:text-green-200">
        <span className="material-symbols-outlined text-sm" aria-hidden>check_circle</span>
        Eligible
      </span>
    );
  }
  if (status === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 font-label text-[0.65rem] font-bold uppercase tracking-widest text-red-800 dark:bg-red-500/15 dark:text-red-200">
        <span className="material-symbols-outlined text-sm" aria-hidden>block</span>
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-label text-[0.65rem] font-bold uppercase tracking-widest text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
      <span className="material-symbols-outlined text-sm" aria-hidden>help</span>
      Not tested
    </span>
  );
}

export function BlockedScanNotice({ matrix, url }: { matrix: AccessMatrixData; url: string }) {
  const d = matrix.diagnosis;
  if (d.pageFetched) return null;
  return (
    <section className="rounded-2xl border border-amber-300/50 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-2xl text-amber-700 dark:text-amber-300" aria-hidden>shield_question</span>
        <div>
          <h2 className="font-headline text-xl font-bold text-on-background">
            We could not test this site — and that is the finding
          </h2>
          <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
            {d.rootCause ??
              'The site did not answer our test request.'}{' '}
            The checks below are marked <strong>Not tested</strong>, not failed — we will not grade
            content we could not retrieve. The same layer that blocked us can silently block the AI
            crawlers that decide whether {url} appears in AI answers.
          </p>
          {d.safelistSteps.length > 0 && (
            <div className="mt-4">
              <p className="font-body text-sm font-semibold text-on-background">
                Hand these steps to whoever manages your firewall or hosting:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 font-body text-sm leading-6 text-on-surface-variant">
                {d.safelistSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function AccessMatrixView({ matrix }: { matrix: AccessMatrixData }) {
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
        Access &amp; eligibility
      </p>
      <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
        Where AI engines can currently see you
      </h2>
      <p className="mt-1 font-body text-sm text-on-surface-variant">
        Each AI destination is governed by a different control — this is what each one told us.
      </p>

      <ul className="mt-5 divide-y divide-outline-variant/15">
        {matrix.rows.map((row) => (
          <li key={row.destination} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-headline text-base font-semibold text-on-background">{row.label}</p>
              <StatusPill status={row.status} />
            </div>
            <p className="mt-1 font-body text-xs uppercase tracking-wide text-on-surface-variant/80">
              Controlled by: {row.control}
            </p>
            <p className="mt-1.5 font-body text-sm leading-6 text-on-surface-variant">{row.detail}</p>
            {row.fix && (
              <p className="mt-1.5 font-body text-sm leading-6 text-on-background">
                <span className="font-semibold">Fix:</span> {row.fix}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* Training / IP decision panel — a choice, never a failure. */}
      <div className="mt-6 rounded-xl border border-outline-variant/25 bg-surface-container-low p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-on-surface-variant" aria-hidden>balance</span>
          <h3 className="font-headline text-base font-semibold text-on-background">
            AI training access — your business decision, not part of your score
          </h3>
        </div>
        <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
          These bots collect content to train AI models. Blocking them protects your content from
          training; it does <strong>not</strong> hide you from AI search. Neither choice is a
          failure.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {matrix.trainingPanel.map((t) => (
            <li key={t.token} className="rounded-lg bg-surface-container-lowest px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-sm font-semibold text-on-background">{t.token}</span>
                <span className="font-body text-xs text-on-surface-variant">
                  {t.allowed === null ? 'Unknown' : t.allowed ? 'Allowed' : 'Blocked (opted out)'}
                </span>
              </div>
              <p className="mt-1 font-body text-xs leading-5 text-on-surface-variant">{t.note}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 font-body text-xs text-on-surface-variant/70">
        Bot registry version {matrix.registryVersion}. Verified against OpenAI, Anthropic,
        Perplexity, Google, and Bing crawler documentation.
      </p>
    </section>
  );
}
