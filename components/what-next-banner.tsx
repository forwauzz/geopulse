import Link from 'next/link';

type WhatNextBannerProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
};

/**
 * Contextual guidance strip — always tells the user what to do next.
 * Used at the top of every dashboard home persona section.
 */
export function WhatNextBanner({ eyebrow, title, body, ctaLabel, ctaHref }: WhatNextBannerProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      {/* Icon */}
      <span
        className="material-symbols-outlined shrink-0 text-primary text-[20px]"
        aria-hidden
      >
        lightbulb
      </span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-on-surface">{title}</p>
        <p className="mt-0.5 text-sm text-on-surface-variant">{body}</p>
      </div>

      {/* CTA */}
      <Link
        href={ctaHref}
        className="shrink-0 self-start rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 sm:self-auto"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
