'use client';

/**
 * "Eligible is not the same as indexed" (spec C5) — tells the owner exactly how to
 * confirm real index status in Google Search Console and Bing Webmaster Tools.
 */
import { INDEXATION_GUIDANCE } from '@/lib/shared/indexation-guidance';

export function IndexationGuidanceCard() {
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
        Verify real index status
      </p>
      <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
        {INDEXATION_GUIDANCE.headline}
      </h2>
      <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
        {INDEXATION_GUIDANCE.explanation}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {INDEXATION_GUIDANCE.steps.map((block) => (
          <div key={block.destination} className="rounded-xl bg-surface-container-low p-4">
            <p className="font-body text-sm font-semibold text-on-background">{block.destination}</p>
            <p className="font-body text-xs text-on-surface-variant">{block.tool}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 font-body text-sm leading-6 text-on-surface-variant">
              {block.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-3 font-body text-xs text-on-surface-variant/80">{INDEXATION_GUIDANCE.caveat}</p>
    </section>
  );
}
