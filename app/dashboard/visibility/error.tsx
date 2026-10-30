'use client';

type DashboardVisibilityErrorProps = {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
};

export default function DashboardVisibilityError({ reset }: DashboardVisibilityErrorProps) {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-4xl items-center px-2 py-12 md:px-6">
      <section className="w-full rounded-3xl border border-outline-variant/35 bg-surface-container-lowest p-8 shadow-float md:p-12">
        <p className="font-label text-xs uppercase tracking-widest text-gold">
          Temporary interruption
        </p>
        <h1 className="mt-4 max-w-2xl font-headline text-4xl font-bold leading-tight text-on-background md:text-5xl">
          Your visibility workspace is temporarily unavailable.
        </h1>
        <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-on-surface-variant">
          We could not safely verify your current workspace data, so we have kept it closed instead
          of showing an empty setup or incomplete results. Your saved workspace has not been changed.
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
            href="/dashboard"
            className="inline-flex min-h-12 items-center px-2 py-3 font-body text-sm font-semibold text-primary hover:text-primary-dim hover:underline"
          >
            Return to dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
