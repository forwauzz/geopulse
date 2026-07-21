'use client';

/**
 * Off-site / local / entity module (spec C8) — per-engine levers beyond the website.
 */
import { OFFSITE_MODULE } from '@/lib/shared/offsite-guidance';

const ENGINE_TONE: Record<string, string> = {
  ChatGPT: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200',
  Copilot: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
  Gemini: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200',
  'Google AI Overviews': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200',
  Perplexity: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200',
};

function EngineChip({ engine }: { engine: string }) {
  const tone = ENGINE_TONE[engine] ?? 'bg-surface-container-high text-on-surface-variant';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest ${tone}`}>
      {engine}
    </span>
  );
}

export function OffsiteModuleCard() {
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
        Off-site signals
      </p>
      <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
        {OFFSITE_MODULE.headline}
      </h2>
      <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">{OFFSITE_MODULE.intro}</p>

      <ul className="mt-5 space-y-4">
        {OFFSITE_MODULE.levers.map((lever) => (
          <li key={lever.id} className="rounded-xl bg-surface-container-low p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-body text-sm font-semibold text-on-background">{lever.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {lever.engines.map((e) => (
                  <EngineChip key={e} engine={e} />
                ))}
              </div>
            </div>
            <p className="mt-1 font-body text-xs text-on-surface-variant/80">Owner: {lever.ownerRole}</p>
            <p className="mt-1.5 font-body text-sm leading-6 text-on-background">{lever.what}</p>
            <p className="mt-1 font-body text-sm leading-6 text-on-surface-variant">{lever.why}</p>
            {lever.stat && (
              <p className="mt-1.5 font-body text-xs leading-5 text-on-surface-variant/80">
                {lever.stat.claim} — <em>{lever.stat.source}</em>
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 font-body text-xs leading-5 text-on-surface-variant/80">
        {OFFSITE_MODULE.reviewsNote}
      </p>
    </section>
  );
}
