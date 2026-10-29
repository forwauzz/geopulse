'use client';

type ClientSummaryErrorProps = {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
};

export default function ClientSummaryError({ reset }: ClientSummaryErrorProps) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-6 py-16 md:px-10">
      <section className="w-full rounded-3xl border border-outline-variant/35 bg-surface-container-lowest p-8 shadow-float md:p-12">
        <p className="font-label text-xs uppercase tracking-widest text-gold">
          Temporary interruption
        </p>
        <h1 className="mt-4 max-w-2xl font-headline text-4xl font-bold leading-tight text-on-background md:text-5xl">
          This client report is temporarily unavailable.
        </h1>
        <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-on-surface-variant">
          We could not safely verify the current report data, so we have kept the report closed
          instead of showing an incomplete or missing result. Please retry shortly.
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
            href="/"
            className="inline-flex min-h-12 items-center px-2 py-3 font-body text-sm font-semibold text-primary hover:text-primary-dim hover:underline"
          >
            Return to GEO-Pulse
          </a>
        </div>
      </section>
    </main>
  );
}
