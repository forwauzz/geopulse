import Link from 'next/link';

type BlogHeroCardProps = {
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
  readonly heroImageUrl: string | null;
  readonly heroImageAlt: string;
};

export function BlogHeroCard({
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
  heroImageUrl,
  heroImageAlt,
}: BlogHeroCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl bg-blog-hero-tint shadow-float ring-1 ring-gold/15">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <div className="flex flex-col justify-center p-8 md:p-10 lg:p-12">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            <Link href={categoryHref} className="text-gold hover:text-primary hover:underline">
              {categoryLabel}
            </Link>
            <span aria-hidden>·</span>
            <span>{readMinutes} min read</span>
          </div>
          <h2 className="mt-4 font-sans text-3xl font-bold leading-tight text-on-background md:text-4xl">
            <Link href={href} className="hover:text-primary">
              {title}
            </Link>
          </h2>
          {excerpt ? (
            <p className="mt-4 font-body text-base leading-relaxed text-on-surface-variant md:text-lg">
              {excerpt}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-on-surface-variant">
            <Link href={authorHref} className="font-medium text-on-background underline decoration-gold/40 underline-offset-4 hover:text-primary">
              {authorName}
            </Link>
            <span aria-hidden>·</span>
            <time dateTime={dateIso ?? undefined}>{dateLabel}</time>
          </div>
          <div className="mt-6">
            <Link
              href={href}
              className="inline-flex rounded-full border border-primary/30 bg-surface-container-lowest px-5 py-2.5 font-sans text-sm font-semibold text-on-background transition hover:border-primary/50 hover:bg-surface-container-low"
            >
              Read article
            </Link>
          </div>
        </div>
        {heroImageUrl ? (
          <Link href={href} className="relative block min-h-[220px] overflow-hidden bg-surface-container lg:min-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote hero URLs; matches article cards */}
            <img
              src={heroImageUrl}
              alt={heroImageAlt}
              className="h-full min-h-[220px] w-full object-cover lg:absolute lg:inset-0 lg:min-h-full"
            />
          </Link>
        ) : (
          <div className="hidden min-h-[200px] bg-gradient-to-br from-blog-card-c to-blog-card-a lg:block" aria-hidden />
        )}
      </div>
    </article>
  );
}
