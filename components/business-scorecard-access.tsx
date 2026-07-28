import Link from 'next/link';
import { updateBusinessScorecardSharing } from '@/app/dashboard/visibility/actions';
import { ScorecardShareControls } from '@/components/scorecard-share-controls';
import type { CustomerVisibilityView } from '@/lib/server/customer-visibility-view';

function platformName(platform: string): string {
  if (platform === 'chatgpt') return 'ChatGPT';
  if (platform === 'gemini') return 'Gemini';
  if (platform === 'perplexity') return 'Perplexity';
  return platform;
}

export function BusinessScorecardAccess({
  view,
  appBaseUrl,
  status,
}: {
  readonly view: CustomerVisibilityView;
  readonly appBaseUrl: string;
  readonly status?: string;
}) {
  const scorecardUrl = view.shareToken
    ? `${appBaseUrl.replace(/\/+$/, '')}/visibility-scorecard/business/${view.workspaceId}?share=${view.shareToken}`
    : null;

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <article className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Shareable scorecard</p>
        <h2 className="mt-2 font-headline text-xl font-semibold text-on-background">Share your current AI visibility</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
          The private link always shows the latest measured visibility, buyer questions, competitors,
          evidence, readiness, and the newest full report.
        </p>
        {status ? (
          <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary" role="status">
            {status === 'disable'
              ? 'The previous scorecard link is now disabled.'
              : status === 'rotate'
                ? 'A new private scorecard link is ready. The previous link no longer works.'
                : status === 'enable'
                  ? 'Your private scorecard link is ready.'
                  : 'The scorecard setting could not be changed.'}
          </p>
        ) : null}
        {!view.canShareScorecard ? (
          <div className="mt-5 rounded-2xl border border-dashed border-outline-variant/30 p-5">
            <p className="text-sm text-on-surface-variant">Shareable live scorecards are included with the paid Business plan.</p>
            <Link href="/pricing#plans" className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
              View Business plan
            </Link>
          </div>
        ) : scorecardUrl ? (
          <div className="mt-5 space-y-4">
            <ScorecardShareControls scorecardUrl={scorecardUrl} />
            <div className="flex flex-wrap gap-2 border-t border-outline-variant/10 pt-4">
              <form action={updateBusinessScorecardSharing}>
                <input type="hidden" name="workspaceId" value={view.workspaceId} />
                <input type="hidden" name="mode" value="rotate" />
                <button type="submit" className="rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-semibold text-on-background">
                  Replace private link
                </button>
              </form>
              <form action={updateBusinessScorecardSharing}>
                <input type="hidden" name="workspaceId" value={view.workspaceId} />
                <input type="hidden" name="mode" value="disable" />
                <button type="submit" className="rounded-xl border border-error/25 px-3 py-2 text-xs font-semibold text-error">
                  Disable sharing
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={updateBusinessScorecardSharing} className="mt-5">
            <input type="hidden" name="workspaceId" value={view.workspaceId} />
            <input type="hidden" name="mode" value="enable" />
            <button type="submit" className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
              Create private scorecard link
            </button>
          </form>
        )}
      </article>

      <article className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Recurring reports</p>
        <h2 className="mt-2 font-headline text-xl font-semibold text-on-background">AI visibility report history</h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          Every completed provider measurement is retained here, including the PDF sent by email.
        </p>
        {view.reports.length > 0 ? (
          <div className="mt-5 divide-y divide-outline-variant/10 overflow-hidden rounded-2xl border border-outline-variant/10">
            {view.reports.map((report) => (
              <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-on-background">{platformName(report.platform)}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(report.generatedAt))}
                  </p>
                </div>
                {report.pdfUrl ? (
                  <Link href={report.pdfUrl} target="_blank" className="text-sm font-semibold text-primary hover:underline">
                    Open PDF
                  </Link>
                ) : <span className="text-xs text-on-surface-variant">Email delivery only</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-outline-variant/30 p-5 text-sm text-on-surface-variant">
            Your first recurring report will appear after the next completed visibility measurement.
          </p>
        )}
      </article>
    </section>
  );
}
