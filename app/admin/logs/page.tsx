import Link from 'next/link';
import { createAdminLogsData } from '@/lib/server/admin-logs-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{
    level?: string;
    event?: string;
    q?: string;
    limit?: string;
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

function buildHref(level: string, event: string, q: string, limit: string): string {
  const params = new URLSearchParams();
  if (level && level !== 'all') params.set('level', level);
  if (event && event !== 'all') params.set('event', event);
  if (q.trim()) params.set('q', q.trim());
  if (limit && limit !== '200') params.set('limit', limit);
  const query = params.toString();
  return query ? `/admin/logs?${query}` : '/admin/logs';
}

function summarizePayload(data: Record<string, unknown>): string {
  const keys = [
    'scanId', 'paymentId', 'scanRunId', 'runId', 'agencyAccountId',
    'agencyClientId', 'stripeSessionId', 'message', 'reason', 'status',
  ] as const;
  return keys
    .map((key) => {
      const value = data[key];
      if (value == null || value === '') return null;
      return `${key}: ${String(value)}`;
    })
    .filter((v): v is string => !!v)
    .join(' | ');
}

export default async function AdminLogsPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const selectedLevel = sp.level ?? 'all';
  const selectedEvent = sp.event ?? 'all';
  const selectedQuery = sp.q ?? '';
  const selectedLimit = ['100', '200', '500'].includes(sp.limit ?? '') ? (sp.limit as string) : '200';

  const adminContext = await loadAdminPageContext('/admin');
  if (!adminContext.ok) {
    return <p className="text-sm text-error">{adminContext.message}</p>;
  }

  const logsData = createAdminLogsData(adminContext.adminDb);
  let logs;
  try {
    logs = await logsData.getRecentLogs({
      level: selectedLevel === 'all' ? null : selectedLevel,
      event: selectedEvent === 'all' ? null : selectedEvent,
      query: selectedQuery,
      limit: Number(selectedLimit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load admin logs.';
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">System Logs</h1>
        <p className="text-sm text-error">{message}</p>
      </div>
    );
  }

  const eventOptions = Array.from(new Set(logs.map((row) => row.event))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Admin Console
        </p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">System Logs</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Recent structured application logs for operator debugging.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-container-lowest p-5">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Total entries</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">{logs.length}</p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Errors</p>
          <p className="mt-2 font-headline text-3xl font-bold text-error">
            {logs.filter((r) => r.level === 'error').length}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-5">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant">Warnings</p>
          <p className="mt-2 font-headline text-3xl font-bold text-on-background">
            {logs.filter((r) => r.level === 'warning').length}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl bg-surface-container-lowest p-5">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            name="q"
            defaultValue={selectedQuery}
            placeholder="Search scan id, payment id, message..."
            className="min-h-[44px] flex-1 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm text-on-background outline-none transition focus:border-primary"
          />
          <select
            name="limit"
            defaultValue={selectedLimit}
            className="min-h-[44px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm text-on-background outline-none"
          >
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
            <option value="500">500 rows</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90"
          >
            Search
          </button>
          <Link
            href="/admin/logs"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-medium text-on-background transition hover:bg-surface-container-high"
          >
            Clear
          </Link>
        </form>

        {/* Level filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          {['all', 'error', 'warning', 'info'].map((level) => (
            <Link
              key={level}
              href={buildHref(level, selectedEvent, selectedQuery, selectedLimit)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedLevel === level
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-background hover:bg-surface'
              }`}
            >
              {level === 'all' ? 'All levels' : level}
            </Link>
          ))}
        </div>

        {/* Event filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={buildHref(selectedLevel, 'all', selectedQuery, selectedLimit)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              selectedEvent === 'all'
                ? 'bg-tertiary text-on-primary'
                : 'bg-surface-container-high text-on-background hover:bg-surface'
            }`}
          >
            All events
          </Link>
          {eventOptions.map((event) => (
            <Link
              key={event}
              href={buildHref(selectedLevel, event, selectedQuery, selectedLimit)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedEvent === event
                  ? 'bg-tertiary text-on-primary'
                  : 'bg-surface-container-high text-on-background hover:bg-surface'
              }`}
            >
              {event}
            </Link>
          ))}
        </div>
      </div>

      {/* Logs table */}
      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-on-surface-variant">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Key fields</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant" colSpan={5}>
                  No logs matched this filter.
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant/10 align-top">
                  <td className="px-4 py-3 text-on-surface-variant">{formatTs(row.created_at)}</td>
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
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {summarizePayload(row.data) || '—'}
                  </td>
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
      </div>
    </div>
  );
}
