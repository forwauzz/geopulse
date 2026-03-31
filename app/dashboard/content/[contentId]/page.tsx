import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';
import { evaluateContentDestinationHealth } from '@/lib/server/content-destination-health';
import { pushContentItemToDestination, updateContentItem } from '../actions';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ contentId: string }>;
};

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

const STATUS_OPTIONS = ['idea', 'brief', 'draft', 'review', 'approved', 'published', 'archived'];

export default async function ContentItemDetailPage({ params }: Props) {
  const { contentId } = await params;
  const adminContext = await loadAdminPageContext(`/dashboard/content/${contentId}`);
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const contentAdminData = createContentAdminData(adminContext.adminDb);
  const destinationAdminData = createContentDestinationAdminData(adminContext.adminDb);
  const [env, item, destinations] = await Promise.all([
    getPaymentApiEnv(),
    contentAdminData.getContentItemDetail(contentId),
    destinationAdminData.getDestinations(),
  ]);
  if (!item) notFound();

  const publishableDestinations = destinations
    .map((destination) => ({
      ...destination,
      health: evaluateContentDestinationHealth(destination, env),
    }))
    .filter(
      (destination) =>
        destination.destination_type === 'newsletter' && destination.supports_api_publish
    );

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Content item
          </h1>
          <p className="mt-1 font-body text-on-surface-variant">
            {item.content_id} / {item.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/content"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Back to content
          </Link>
          <Link
            href="/dashboard/logs"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Logs
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Type
          </p>
          <p className="mt-1 font-headline text-xl font-bold text-on-background">
            {formatLabel(item.content_type)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Status
          </p>
          <p className="mt-1 font-headline text-xl font-bold text-on-background">
            {formatLabel(item.status)}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Updated
          </p>
          <p className="mt-1 font-body text-sm text-on-background">{formatDateTime(item.updated_at)}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Deliveries
          </p>
          <p className="mt-1 font-headline text-xl font-bold text-on-background">
            {item.deliveries.length}
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <form action={updateContentItem} className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
          <input type="hidden" name="contentId" value={item.content_id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Title</span>
              <input
                name="title"
                defaultValue={item.title}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Slug</span>
              <input
                name="slug"
                defaultValue={item.slug}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Status</span>
              <select
                name="status"
                defaultValue={item.status}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Target persona</span>
              <input
                name="targetPersona"
                defaultValue={item.target_persona ?? ''}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Primary problem</span>
              <input
                name="primaryProblem"
                defaultValue={item.primary_problem ?? ''}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Topic cluster</span>
              <input
                name="topicCluster"
                defaultValue={item.topic_cluster ?? ''}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Canonical URL</span>
              <input
                name="canonicalUrl"
                defaultValue={item.canonical_url ?? ''}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-background outline-none"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Brief markdown</span>
              <textarea
                name="briefMarkdown"
                defaultValue={item.brief_markdown ?? ''}
                rows={14}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-mono text-xs text-on-background outline-none"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">Draft markdown</span>
              <textarea
                name="draftMarkdown"
                defaultValue={item.draft_markdown ?? ''}
                rows={22}
                className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-mono text-xs text-on-background outline-none"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Save content item
            </button>
            {item.canonical_url ? (
              <a
                href={item.canonical_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Open canonical URL
              </a>
            ) : null}
          </div>
        </form>

        <div className="space-y-6">
          <section className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
            <h2 className="font-headline text-lg font-semibold text-on-background">Push draft</h2>
            <div className="mt-4 space-y-3">
              {publishableDestinations.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No API-capable destinations are configured yet.
                </p>
              ) : (
                publishableDestinations.map((destination) => (
                  <form
                    key={destination.id}
                    action={pushContentItemToDestination}
                    className="rounded-xl bg-surface-container-low p-4"
                  >
                    <input type="hidden" name="contentId" value={item.content_id} />
                    <input type="hidden" name="destinationId" value={destination.id} />
                    <p className="text-sm font-medium text-on-background">{destination.display_name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {destination.enabled ? 'Enabled' : 'Disabled'} /{' '}
                      {formatLabel(destination.health.availabilityStatus)}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {destination.health.availabilityReason ?? 'Ready to push.'}
                    </p>
                    <button
                      type="submit"
                      disabled={!destination.health.readyToPush}
                      className="mt-3 rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {destination.health.readyToPush ? 'Push draft' : 'Push unavailable'}
                    </button>
                  </form>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
            <h2 className="font-headline text-lg font-semibold text-on-background">Metadata</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">CTA</p>
                <p className="mt-1 text-on-background">{formatLabel(item.cta_goal)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Source type</p>
                <p className="mt-1 text-on-background">{formatLabel(item.source_type)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Source links</p>
                <ul className="mt-2 space-y-1 text-on-surface-variant">
                  {item.source_links.length === 0 ? (
                    <li>-</li>
                  ) : (
                    item.source_links.map((sourceLink) => <li key={sourceLink}>{sourceLink}</li>)
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant">Published</p>
                <p className="mt-1 text-on-background">{formatDateTime(item.published_at)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-lowest p-6 shadow-float">
            <h2 className="font-headline text-lg font-semibold text-on-background">Deliveries</h2>
            <div className="mt-4 space-y-3">
              {item.deliveries.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No downstream deliveries yet.</p>
              ) : (
                item.deliveries.map((delivery) => (
                  <div key={delivery.id} className="rounded-xl bg-surface-container-low p-4">
                    <p className="text-sm font-medium text-on-background">
                      {delivery.destination_name} / {formatLabel(delivery.destination_type)}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {formatLabel(delivery.status)} / {formatDateTime(delivery.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
