import { ScanForm } from '@/components/scan-form';

export type DashboardScanHeroProps = {
  readonly siteKey: string | null;
  readonly defaultUrl?: string;
  readonly agencyAccountId: string | null;
  readonly agencyClientId: string | null;
  readonly startupWorkspaceId: string | null;
  readonly scanDisabled: boolean;
  readonly startupAccessBlocked: boolean;
  readonly startupAccessTitle?: string;
  readonly startupAccessBody?: string;
  /** One line under the headline (active workspace / client context). */
  readonly contextLine: string | null;
};

export function DashboardScanHero({
  siteKey,
  defaultUrl,
  agencyAccountId,
  agencyClientId,
  startupWorkspaceId,
  scanDisabled,
  startupAccessBlocked,
  startupAccessTitle,
  startupAccessBody,
  contextLine,
}: DashboardScanHeroProps) {
  return (
    <section id="dashboard-scan" className="py-6">
      <div className="mx-auto max-w-2xl">
        {/* Heading */}
        <h2 className="font-headline text-2xl font-bold tracking-tight text-on-background sm:text-3xl">
          Audit any website
        </h2>
        {contextLine ? (
          <p className="mt-1 text-sm text-on-surface-variant">{contextLine}</p>
        ) : (
          <p className="mt-1 text-sm text-on-surface-variant">
            Free · under 30 seconds · no account required.
          </p>
        )}

        {/* Input */}
        <div className="mt-5">
          {startupAccessBlocked ? (
            <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low px-4 py-4 text-left text-sm text-on-surface-variant">
              <p className="font-semibold text-on-background">{startupAccessTitle}</p>
              <p className="mt-1">{startupAccessBody}</p>
            </div>
          ) : !siteKey ? (
            <p className="rounded-xl bg-error/10 px-4 py-3 text-left text-sm text-error" role="alert">
              Turnstile is not configured for this deployment.
            </p>
          ) : scanDisabled ? (
            <p className="rounded-xl bg-surface-container-low px-4 py-3 text-left text-sm text-on-surface-variant">
              Scan launch is disabled for this agency context. Ask GEO-Pulse admin to re-enable it, or switch
              account or client above.
            </p>
          ) : (
            <ScanForm
              variant="hero"
              siteKey={siteKey}
              defaultUrl={defaultUrl}
              agencyAccountId={agencyAccountId}
              agencyClientId={agencyClientId}
              startupWorkspaceId={startupWorkspaceId}
            />
          )}
        </div>
      </div>
    </section>
  );
}
