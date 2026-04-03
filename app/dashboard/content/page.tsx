import Link from 'next/link';
import {
  importContentMachineDrafts,
  publishReadyArticles,
  seedTopicPagesFromClusters,
  updateContentDestinationConfig,
} from './actions';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';
import { evaluateContentDestinationHealth } from '@/lib/server/content-destination-health';
import { buildContentLaunchReadiness } from '@/lib/server/content-launch-readiness';
import { buildContentPublishQualityTrendSummary } from '@/lib/server/content-publish-check-history';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string): string {
  switch (status) {
    case 'published':
      return 'bg-primary/15 text-primary';
    case 'approved':
      return 'bg-tertiary/15 text-tertiary';
    case 'review':
      return 'bg-warning/20 text-on-background';
    case 'failed':
    case 'archived':
      return 'bg-error/15 text-error';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
}

function availabilityTone(status: string): string {
  switch (status) {
    case 'available':
      return 'bg-primary/15 text-primary';
    case 'plan_blocked':
      return 'bg-warning/20 text-on-background';
    case 'api_unavailable':
    case 'disabled':
      return 'bg-error/15 text-error';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
}

export default async function ContentAdminPage() {
  const adminContext = await loadAdminPageContext('/dashboard/content');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const contentAdminData = createContentAdminData(adminContext.adminDb);
  const destinationAdminData = createContentDestinationAdminData(adminContext.adminDb);
  const distributionFlags = resolveDistributionEngineFlags(adminContext.env);

  try {
    const [env, items, destinations, publishTrendRows] = await Promise.all([
      getPaymentApiEnv(),
      contentAdminData.getRecentContentItems(),
      destinationAdminData.getDestinations(),
      contentAdminData.getRecentPublishCheckTrendRows(),
    ]);
    const launchReadiness = await buildContentLaunchReadiness(contentAdminData);
    const publishQualityTrend = buildContentPublishQualityTrendSummary(publishTrendRows);
    const resolvedDestinations = destinations.map((destination) => ({
      ...destination,
      health: evaluateContentDestinationHealth(destination, env),
    }));
    const readyToPublishCount = launchReadiness.articles.filter(
      (article) => article.status !== 'published' && article.readinessPassed
    ).length;
    const publishedThisWeekCount = items.filter((item) => {
      if (item.status !== 'published' || !item.published_at) return false;
      const publishedAt = new Date(item.published_at).getTime();
      return Date.now() - publishedAt <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const destinationPushReadyCount = resolvedDestinations.filter(
      (destination) => destination.enabled && destination.health.readyToPush
    ).length;
    const blockedArticleCount = launchReadiness.articles.filter(
      (article) => article.status !== 'published' && !article.readinessPassed
    ).length;
    const nextBlockedArticles = launchReadiness.articles
      .filter((article) => article.status !== 'published' && !article.readinessPassed)
      .slice(0, 3);

    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
              Admin
            </p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
              Content machine
            </h1>
            <p className="mt-1 max-w-2xl font-body text-on-surface-variant">
              Canonical site-first content inventory, with downstream delivery status for newsletters
              and later syndication targets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={importContentMachineDrafts}>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
              >
                Import local drafts
              </button>
            </form>
            <form action={seedTopicPagesFromClusters}>
              <button
                type="submit"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Seed topic pages
              </button>
            </form>
            <form action={publishReadyArticles}>
              <button
                type="submit"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Publish ready articles
              </button>
            </form>
            <Link
              href="/dashboard/attribution"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Attribution
            </Link>
            <Link
              href="/dashboard/logs"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Logs
            </Link>
            {distributionFlags.uiEnabled ? (
              <Link
                href="/dashboard/distribution"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Distribution engine
              </Link>
            ) : null}
            <Link
              href="/dashboard/content/launch"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Launch readiness
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Account
            </Link>
          </div>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Items
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {items.length}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Published
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {items.filter((item) => item.status === 'published').length}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Newsletter pushes
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {items.reduce((sum, item) => sum + item.delivery_count, 0)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              CTA
            </p>
            <p className="mt-1 font-headline text-xl font-bold text-on-background">Free scan</p>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          <strong className="text-on-background">Import behavior:</strong> the import button reads
          markdown files from <code>PLAYBOOK/content-machine-drafts</code> and upserts stable
          content records by derived <code>content_id</code>. It is safe to rerun when draft files
          change.
        </div>
        <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          <strong className="text-on-background">Topic-page seeding:</strong> the seed button creates
          or refreshes one canonical <code>research_note</code> record per article topic cluster so
          topic-page intro copy can be edited from the existing content admin flow.
        </div>
        <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          <strong className="text-on-background">Publish-ready batch action:</strong> the publish
          button promotes all non-published article rows that already satisfy the existing publish
          checks. Current eligible inventory: <code>{readyToPublishCount}</code>.
        </div>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">
                Weekly operator view
              </h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                Use this as the once-a-week control panel for publishing, destination pushes, and
                launch progress without needing CLI work.
              </p>
            </div>
            <Link
              href="/dashboard/content/launch"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Open launch checklist
            </Link>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Ready to publish
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {readyToPublishCount}
              </p>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                Articles that already pass editorial publish checks.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Published this week
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {publishedThisWeekCount}
              </p>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                Recently published canonical pieces on the GEO-Pulse site.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Destinations ready
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {destinationPushReadyCount}
              </p>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                Enabled downstream destinations that can accept pushes today.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Launch status
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {launchReadiness.summary.meetsLaunchThreshold ? 'Ready' : 'In progress'}
              </p>
              <p className="mt-2 font-body text-xs text-on-surface-variant">
                {launchReadiness.summary.readyArticleCount} ready articles,{' '}
                {launchReadiness.summary.publishedTopicPageCount} published topic pages,{' '}
                {launchReadiness.summary.connectedPublishedTopicCount} connected topics.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr,0.95fr]">
            <div className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float">
              <h3 className="font-headline text-lg font-semibold text-on-background">
                Weekly checklist
              </h3>
              <div className="mt-4 space-y-4 font-body text-sm text-on-surface-variant">
                <div>
                  <p className="font-medium text-on-background">1. Publish canonical content</p>
                  <p className="mt-1">
                    {readyToPublishCount > 0
                      ? `${readyToPublishCount} article${readyToPublishCount === 1 ? '' : 's'} can be published now from this page.`
                      : 'No article is currently publish-ready, so the next step is draft/import or editorial cleanup.'}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-on-background">2. Review blocked articles</p>
                  <p className="mt-1">
                    {blockedArticleCount > 0
                      ? `${blockedArticleCount} article${blockedArticleCount === 1 ? '' : 's'} are still blocked by editorial readiness checks.`
                      : 'No non-published articles are currently blocked by the editorial checklist.'}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-on-background">3. Push downstream only after canonical publish</p>
                  <p className="mt-1">
                    {destinationPushReadyCount > 0
                      ? `${destinationPushReadyCount} destination${destinationPushReadyCount === 1 ? '' : 's'} are ready for newsletter or syndication pushes.`
                      : 'No downstream destination is currently ready to receive pushes.'}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-on-background">4. Check launch threshold</p>
                  <p className="mt-1">
                    {launchReadiness.summary.meetsLaunchThreshold
                      ? 'The current published inventory meets the launch threshold for the content machine.'
                      : 'The content machine still needs more connected published inventory before it is fully launch-ready.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float">
              <h3 className="font-headline text-lg font-semibold text-on-background">
                Attention needed
              </h3>
              {nextBlockedArticles.length === 0 ? (
                <p className="mt-4 font-body text-sm text-on-surface-variant">
                  No immediate editorial blockers. Use this week for publishing, downstream pushes,
                  attribution review, or benchmark work.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {nextBlockedArticles.map((article) => (
                    <div
                      key={article.content_id}
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3"
                    >
                      <Link
                        href={`/dashboard/content/${article.content_id}`}
                        className="font-body text-sm font-semibold text-on-background hover:text-primary"
                      >
                        {article.title}
                      </Link>
                      <p className="mt-2 font-body text-xs uppercase tracking-widest text-on-surface-variant">
                        Missing checks
                      </p>
                      <p className="mt-1 font-body text-sm text-on-surface-variant">
                        {article.failedChecks.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">
                Publish quality trend
              </h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                Compact cross-article quality view from persisted publish-check snapshots.
              </p>
            </div>
            <p className="font-body text-xs text-on-surface-variant">
              Last check snapshot: {formatDateTime(publishQualityTrend.latest_checked_at)}
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Articles with snapshots
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {publishQualityTrend.articles_with_history}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Currently failing
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {publishQualityTrend.failing_articles}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Regressions
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {publishQualityTrend.regressions}
              </p>
            </div>
            <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
              <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                Improvements
              </p>
              <p className="mt-1 font-headline text-2xl font-bold text-on-background">
                {publishQualityTrend.improvements}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1fr]">
            <div className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float">
              <h3 className="font-headline text-lg font-semibold text-on-background">
                Top failure patterns
              </h3>
              {publishQualityTrend.top_failed_keys.length === 0 ? (
                <p className="mt-4 font-body text-sm text-on-surface-variant">
                  No failing check patterns in recent snapshots.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {publishQualityTrend.top_failed_keys.map((pattern) => (
                    <div
                      key={pattern.key}
                      className="flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2"
                    >
                      <span className="font-body text-sm text-on-background">
                        {formatLabel(pattern.key)}
                      </span>
                      <span className="font-body text-xs text-on-surface-variant">
                        {pattern.count} article{pattern.count === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float">
              <h3 className="font-headline text-lg font-semibold text-on-background">
                Regression flags
              </h3>
              {publishQualityTrend.regression_flags.length === 0 ? (
                <p className="mt-4 font-body text-sm text-on-surface-variant">
                  No regression flags in recent snapshots.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {publishQualityTrend.regression_flags.map((flag) => (
                    <div
                      key={`${flag.content_id}:${flag.checked_at}`}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-3"
                    >
                      <Link
                        href={`/dashboard/content/${flag.content_id}`}
                        className="font-body text-sm font-semibold text-on-background hover:text-primary"
                      >
                        {flag.title}
                      </Link>
                      <p className="mt-1 font-body text-xs text-on-surface-variant">
                        Failed checks {flag.previous_failed_count} → {flag.failed_count}
                      </p>
                      <p className="mt-1 font-body text-xs text-on-surface-variant">
                        New failures:{' '}
                        {flag.newly_failed_keys.length > 0
                          ? flag.newly_failed_keys.map((key) => formatLabel(key)).join(', ')
                          : 'None'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">
                Distribution destinations
              </h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                GEO-Pulse stays canonical. These destinations are downstream feature flags and
                plan-constraint records, so we can enable providers without making the system depend
                on a single outlet.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
            <table className="min-w-[1180px] w-full border-collapse text-left font-body text-sm">
              <thead className="bg-surface-container-low">
                <tr className="text-on-surface-variant">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Capabilities</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Availability</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Control</th>
                </tr>
              </thead>
              <tbody>
                {destinations.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-on-surface-variant" colSpan={7}>
                      No destinations configured yet.
                    </td>
                  </tr>
                ) : (
                  resolvedDestinations.map((destination) => (
                    <tr
                      key={destination.id}
                      className="border-t border-outline-variant/10 align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-background">
                          {destination.display_name}
                        </div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {destination.destination_key}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatLabel(destination.destination_type)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-xs text-on-surface-variant">
                          <div>
                            API publish:{' '}
                            <span className="text-on-background">
                              {destination.supports_api_publish ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div>
                            Scheduling:{' '}
                            <span className="text-on-background">
                              {destination.supports_scheduling ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div>
                            Public archive:{' '}
                            <span className="text-on-background">
                              {destination.supports_public_archive ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{destination.plan_tier ?? '-'}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {destination.requires_paid_plan ? 'Paid plan required' : 'Free tier possible'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${availabilityTone(destination.health.availabilityStatus)}`}
                          >
                            {formatLabel(destination.health.availabilityStatus)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${destination.enabled ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                          >
                            {destination.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {destination.health.availabilityReason ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <form action={updateContentDestinationConfig} className="space-y-2">
                          <input type="hidden" name="destinationId" value={destination.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={destination.enabled ? 'false' : 'true'}
                          />
                          <input
                            type="hidden"
                            name="availabilityStatus"
                            value={
                              destination.enabled
                                ? 'disabled'
                                : destination.availability_status === 'disabled'
                                  ? 'not_configured'
                                  : destination.availability_status
                            }
                          />
                          <input
                            type="hidden"
                            name="availabilityReason"
                            value={
                              destination.enabled
                                ? 'Disabled manually from the content admin dashboard.'
                                : destination.availability_status === 'disabled'
                                  ? 'Re-enabled from the content admin dashboard. Credentials or plan checks may still be pending.'
                                  : destination.availability_reason ?? ''
                            }
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs font-medium text-on-background transition hover:bg-surface-container-high"
                          >
                            {destination.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
            <table className="min-w-[1080px] w-full border-collapse text-left font-body text-sm">
              <thead className="bg-surface-container-low">
                <tr className="text-on-surface-variant">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Persona</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3 text-right">Deliveries</th>
                  <th className="px-4 py-3">Latest downstream</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-on-surface-variant" colSpan={8}>
                      No content items are stored yet. The planning drafts exist in PLAYBOOK, but
                      nothing has been imported into the canonical content tables.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-outline-variant/10 align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/content/${item.content_id}`}
                          className="font-medium text-on-background hover:text-primary"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {item.content_id} / {item.slug}
                        </div>
                        {item.canonical_url ? (
                          <a
                            href={item.canonical_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs font-medium text-tertiary hover:underline"
                          >
                            View canonical URL
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{formatLabel(item.content_type)}</td>
                      <td className="px-4 py-3">{item.target_persona ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone(item.status)}`}
                        >
                          {formatLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>{item.topic_cluster ?? '-'}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {item.primary_problem ?? '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-on-background">{item.delivery_count}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {item.published_delivery_count} published
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{item.latest_delivery_destination ?? '-'}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {item.latest_delivery_status
                            ? formatLabel(item.latest_delivery_status)
                            : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{formatDateTime(item.updated_at)}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          Published: {formatDateTime(item.published_at)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const missingTable =
      /content_items|content_distribution_deliveries|content_distribution_destinations|relation .* does not exist/i.test(
        message
      );

    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Content machine</h1>
        <p className="mt-4 text-error">
          Could not load content inventory.
          <br />
          {message}
        </p>
        {missingTable ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
            Your database is missing the content-machine foundation migration. Run{' '}
            <code>npm run db:migrate</code> or apply{' '}
            <code>supabase/migrations/016_content_machine_foundation.sql</code> and{' '}
            <code>supabase/migrations/017_content_distribution_destinations.sql</code>.
          </div>
        ) : null}
      </main>
    );
  }
}
