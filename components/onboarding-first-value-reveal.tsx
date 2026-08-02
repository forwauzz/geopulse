import Link from 'next/link';

export function OnboardingFirstValueReveal({
  clientId,
  agencyAccountId,
  clientName,
  baselineReady,
  reportReady,
}: {
  readonly clientId: string;
  readonly agencyAccountId: string;
  readonly clientName: string;
  readonly baselineReady: boolean;
  readonly reportReady: boolean;
}) {
  const primaryHref = `/dashboard/clients/${clientId}/report-preview?agencyAccount=${agencyAccountId}`;
  return (
    <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/12 via-surface-container-lowest to-tertiary/10 p-5 shadow-float sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">First useful result</p>
          <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
            {reportReady ? `See how ${clientName} looks to the client` : `Build ${clientName}'s starting point`}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            {reportReady
              ? 'The report preview is quality-gated, branded for the agency, and still held. Review it before deciding whether it should ever be shared.'
              : baselineReady
                ? 'The measurement is complete and the private report is being prepared. No placeholder numbers are shown.'
                : 'GEO-Pulse has saved the confirmed business and market. Complete the baseline to reveal the first client-ready proof.'}
          </p>
        </div>
        {reportReady ? (
          <div className="flex flex-col items-stretch gap-2 sm:min-w-64">
            <Link href={primaryHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary">
              Preview the private client report
              <span aria-hidden>→</span>
            </Link>
            <Link href={`/dashboard/clients/${clientId}/report-profile`} className="text-center text-sm font-semibold text-on-surface-variant hover:text-on-background">Report details</Link>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-background sm:max-w-64">
            Next: use the highlighted baseline action below.
          </p>
        )}
      </div>
    </section>
  );
}
