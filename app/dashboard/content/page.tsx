import Link from 'next/link';
import { updateContentDestinationConfig } from './actions';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { createContentDestinationAdminData } from '@/lib/server/content-destination-admin-data';

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

  try {
    const [items, destinations] = await Promise.all([
      contentAdminData.getRecentContentItems(),
      destinationAdminData.getDestinations(),
    ]);

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
            <Link
              href="/dashboard/attribution"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Attribution
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
                  destinations.map((destination) => (
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
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${availabilityTone(destination.availability_status)}`}
                          >
                            {formatLabel(destination.availability_status)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${destination.enabled ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                          >
                            {destination.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {destination.availability_reason ?? '-'}
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
                        <div className="font-medium text-on-background">{item.title}</div>
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
