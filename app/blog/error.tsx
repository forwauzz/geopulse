'use client';

type BlogErrorProps = {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
};

export default function BlogError({ reset }: BlogErrorProps) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-6 py-16 md:px-10">
      <section className="w-full rounded-3xl border border-outline-variant/35 bg-surface-container-lowest p-8 shadow-float md:p-12">
        <p className="font-label text-xs uppercase tracking-widest text-gold">
          Temporary interruption
        </p>
        <h1 className="mt-4 max-w-2xl font-headline text-4xl font-bold leading-tight text-on-background md:text-5xl">
          The GEO-Pulse article library is temporarily unavailable.
        </h1>
        <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-on-surface-variant">
          We have kept this page closed instead of showing incomplete or stale editorial content.
          You can retry now or continue to the public MSP overview while the content service
          recovers.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/solutions/msps"
            className="inline-flex min-h-12 items-center rounded-xl border border-outline-variant/45 bg-surface-container px-5 py-3 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-high"
          >
            View the MSP overview
          </a>
          <a
            href="/"
            className="inline-flex min-h-12 items-center px-2 py-3 font-body text-sm font-semibold text-primary hover:text-primary-dim hover:underline"
          >
            Return home
          </a>
        </div>
      </section>
    </main>
  );
}
