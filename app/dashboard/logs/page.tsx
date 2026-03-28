import Link from 'next/link';
import { createAdminLogsData } from '@/lib/server/admin-logs-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    level?: string;
    event?: string;
  }>;
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildHref(level: string, event: string): string {
  const params = new URLSearchParams();
  if (level && level !== 'all') params.set('level', level);
  if (event && event !== 'all') params.set('event', event);
  const query = params.toString();
  return query ? `/dashboard/logs?${query}` : '/dashboard/logs';
}

export default async function AdminLogsPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const selectedLevel = sp.level ?? 'all';
  const selectedEvent = sp.event ?? 'all';

  const adminContext = await loadAdminPageContext('/dashboard/logs');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const logsData = createAdminLogsData(adminContext.adminDb);

  let logs;
  try {
    logs = await logsData.getRecentLogs({
      level: selectedLevel === 'all' ? null : selectedLevel,
      event: selectedEvent === 'all' ? null : selectedEvent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load admin logs.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Admin logs</h1>
        <p className="mt-4 text-error">{message}</p>
      </main>
    );
  }

  const eventOptions = Array.from(new Set(logs.map((row) => row.event))).sort();

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
            Admin
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
            Admin logs
          </h1>
          <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
            Recent structured application logs persisted for operator debugging. This page shows
            the latest internal events without requiring backend shell access.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          Back to dashboard
        </Link>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Recent entries
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {logs.length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Error logs
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {logs.filter((row) => row.level === 'error').length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
          <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
            Warning logs
          </p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {logs.filter((row) => row.level === 'warning').length}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-surface-container-lowest p-6 shadow-float">
        <div className="flex flex-wrap gap-3">
          {['all', 'error', 'warning', 'info'].map((level) => (
            <Link
              key={level}
              href={buildHref(level, selectedEvent)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedLevel === level
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-background'
              }`}
            >
              {level === 'all' ? 'All levels' : level}
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={buildHref(selectedLevel, 'all')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              selectedEvent === 'all'
                ? 'bg-tertiary text-on-primary'
                : 'bg-surface-container-high text-on-background'
            }`}
          >
            All events
          </Link>
          {eventOptions.map((event) => (
            <Link
              key={event}
              href={buildHref(selectedLevel, event)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedEvent === event
                  ? 'bg-tertiary text-on-primary'
                  : 'bg-surface-container-high text-on-background'
              }`}
            >
              {event}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
        <table className="min-w-[1040px] w-full border-collapse text-left font-body text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-on-surface-variant">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant" colSpan={4}>
                  No logs matched this filter.
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                  <td className="px-4 py-3 text-on-surface-variant">
                    {formatTs(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.level === 'error'
                          ? 'bg-error/15 text-error'
                          : row.level === 'warning'
                            ? 'bg-warning/15 text-on-background'
                            : 'bg-primary/15 text-primary'
                      }`}
                    >
                      {row.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-on-background">{row.event}</td>
                  <td className="px-4 py-3">
                    <pre className="max-w-3xl overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-background">
                      {JSON.stringify(row.data, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
