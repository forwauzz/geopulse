import Link from 'next/link';

const CARD_BG = ['bg-blog-card-a', 'bg-blog-card-b', 'bg-blog-card-c'] as const;

type BlogFeedCardProps = {
  readonly href: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly categoryHref: string;
  readonly categoryLabel: string;
  readonly readMinutes: number;
  readonly authorName: string;
  readonly authorHref: string;
  readonly dateLabel: string;
  readonly dateIso: string | null;
  readonly variantIndex: number;
};

export function BlogFeedCard({
  href,
  title,
  excerpt,
  categoryHref,
  categoryLabel,
  readMinutes,
  authorName,
  authorHref,
  dateLabel,
  dateIso,
  variantIndex,
}: BlogFeedCardProps) {
  const bg = CARD_BG[variantIndex % CARD_BG.length] ?? 'bg-blog-card-a';

  return (
    <article className={`rounded-2xl p-8 shadow-float ring-1 ring-gold/10 ${bg}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        <Link href={categoryHref} className="text-gold hover:text-primary hover:underline">
          {categoryLabel}
        </Link>
        <span aria-hidden>·</span>
        <span>{readMinutes} min read</span>
      </div>
      <h3 className="mt-3 font-sans text-xl font-bold leading-snug text-on-background md:text-2xl">
        <Link href={href} className="hover:text-primary">
          {title}
        </Link>
      </h3>
      {excerpt ? (
        <p className="mt-3 font-body text-sm leading-relaxed text-on-surface-variant md:text-base">{excerpt}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant">
        <Link href={authorHref} className="font-medium text-on-background underline decoration-gold/35 underline-offset-4 hover:text-primary">
          {authorName}
        </Link>
        <span aria-hidden>·</span>
        <time dateTime={dateIso ?? undefined}>{dateLabel}</time>
      </div>
    </article>
  );
}
