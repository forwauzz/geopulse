import Link from 'next/link';

export function BlogPromoStrip() {
  return (
    <aside className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-r from-blog-card-a via-background to-blog-card-b px-6 py-5 md:px-10">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-[repeating-linear-gradient(90deg,rgb(var(--color-gold)/0.25)_0px,rgb(var(--color-gold)/0.25)_2px,transparent_2px,transparent_5px)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-[repeating-linear-gradient(90deg,rgb(var(--color-gold)/0.25)_0px,rgb(var(--color-gold)/0.25)_2px,transparent_2px,transparent_5px)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-3 text-center md:flex-row md:justify-between md:text-left">
        <p className="font-sans text-sm font-medium text-on-background md:text-base">
          Ready to see how AI search reads your site? Run a free scan.
        </p>
        <Link
          href="/"
          className="inline-flex shrink-0 rounded-full bg-primary px-5 py-2.5 font-sans text-sm font-semibold text-on-primary transition hover:opacity-90"
        >
          Start free scan
        </Link>
      </div>
    </aside>
  );
}
