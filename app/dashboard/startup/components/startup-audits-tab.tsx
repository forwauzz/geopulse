import Link from 'next/link';
import type {
  StartupWorkspaceRecommendation,
  StartupWorkspaceReport,
  StartupWorkspaceScan,
} from '@/lib/server/startup-dashboard-data';
import type {
  StartupAuditFilterState,
  StartupAuditRangePreset,
  StartupAuditRowModel,
  StartupAuditStatusFilter,
  StartupAuditsTabProps,
} from './startup-tab-types';
import { StartupAuditsTableClient } from './startup-audits-table-client';

function buildAuditsHref(
  workspaceId: string | null,
  next: {
    preset?: StartupAuditRangePreset;
    from?: string;
    to?: string;
    status?: StartupAuditStatusFilter;
  }
): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set('startupWorkspace', workspaceId);
  params.set('tab', 'audits');
  if (next.from || next.to) {
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
  } else if (next.preset && next.preset !== 'all') {
    params.set('range', next.preset);
  }
  if (next.status && next.status !== 'all') params.set('status', next.status);
  return `/dashboard/startup?${params.toString()}`;
}

function filterScans(
  scans: readonly StartupWorkspaceScan[],
  filter: StartupAuditFilterState
): StartupWorkspaceScan[] {
  const sorted = [...scans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (filter.from || filter.to) {
    return sorted.filter((scan) => {
      const day = scan.createdAt.slice(0, 10);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      return true;
    });
  }
  if (!filter.preset || filter.preset === 'all') return sorted;
  const days = filter.preset === '7d' ? 7 : filter.preset === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * 86400000;
  return sorted.filter((scan) => new Date(scan.createdAt).getTime() >= cutoff);
}

function reportForScan(
  reports: readonly StartupWorkspaceReport[],
  scanId: string
): StartupWorkspaceReport | undefined {
  return reports.find((report) => report.scanId === scanId);
}

function reportStatus(report: StartupWorkspaceReport | undefined): string {
  if (!report) return '—';
  const bits = [report.type];
  if (report.pdfUrl || report.pdfGeneratedAt) bits.push('PDF');
  if (report.emailDeliveredAt) bits.push('email');
  return bits.join(' · ');
}

function buildAuditRows(
  filtered: readonly StartupWorkspaceScan[],
  reports: readonly StartupWorkspaceReport[],
  recommendations: readonly StartupWorkspaceRecommendation[]
): StartupAuditRowModel[] {
  return filtered.map((scan) => {
    const report = reportForScan(reports, scan.id);
    const scanRecommendations = recommendations.filter((rec) => rec.scanId === scan.id);
    const recTitles = scanRecommendations.map((rec) => rec.title);
    const implementedTitles = scanRecommendations
      .filter((rec) => rec.status === 'validated')
      .map((rec) => rec.title);

    return {
      scanId: scan.id,
      createdAt: scan.createdAt,
      domain: scan.domain,
      url: scan.url,
      score: scan.score,
      letterGrade: scan.letterGrade,
      runSource: scan.runSource,
      reportStatus: reportStatus(report),
      pdfUrl: report?.pdfUrl ?? null,
      recCount: recTitles.length,
      implementedCount: implementedTitles.length,
      openCount: recTitles.length - implementedTitles.length,
      recTitles,
      implementedTitles,
    };
  });
}

function scoreDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

function trendBarClass(score: number | null): string {
  if (score == null) return 'bg-surface-container-high';
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-sky-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

function filterRowsByStatus(
  rows: readonly StartupAuditRowModel[],
  status: StartupAuditStatusFilter
): StartupAuditRowModel[] {
  if (status === 'implemented') return rows.filter((row) => row.implementedCount > 0);
  if (status === 'open') return rows.filter((row) => row.openCount > 0);
  return [...rows];
}

const PRESETS: { key: StartupAuditRangePreset; label: string }[] = [
  { key: '7d', label: 'Last 7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

const STATUS_FILTERS: { key: StartupAuditStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'implemented', label: 'Implemented' },
  { key: 'open', label: 'Open' },
];

export function StartupAuditsTab({ dashboard, auditFilter }: StartupAuditsTabProps) {
  const workspaceId = dashboard.selectedWorkspaceId;
  const scanned = filterScans(dashboard.scans, auditFilter);
  const rows = filterRowsByStatus(
    buildAuditRows(scanned, dashboard.reports, dashboard.recommendations),
    auditFilter.status
  );
  const trendRows = [...rows]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-8);
  const latestRow = rows[0] ?? null;
  const previousRow = rows[1] ?? null;
  const latestDelta = scoreDelta(latestRow?.score ?? null, previousRow?.score ?? null);
  const presetActive = (key: StartupAuditRangePreset) =>
    auditFilter.preset === key && !auditFilter.from && !auditFilter.to;
  const customActive = Boolean(auditFilter.from || auditFilter.to);
  const statusActive = (key: StartupAuditStatusFilter) => auditFilter.status === key;

  return (
    <article
      data-testid="startup-audits-tab"
      className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
    >
      <h2 className="text-lg font-semibold">Audit history</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        Startup scans for this workspace, newest first. Implemented recommendations are surfaced here as validated items.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Latest score</p>
          <p className="mt-2 text-3xl font-bold text-on-surface">
            {latestRow?.score != null ? latestRow.score : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {latestDelta == null
              ? 'Compare two scans to see a change.'
              : `Change vs previous scan: ${latestDelta > 0 ? '+' : ''}${latestDelta}`}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Validated items</p>
          <p className="mt-2 text-3xl font-bold text-on-surface">{latestRow?.implementedCount ?? 0}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Implemented recommendations linked to the latest run.
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Score trend</p>
          {trendRows.length > 0 ? (
            <div className="mt-3 flex items-end gap-2">
              {trendRows.map((row) => {
                const height = row.score == null ? 24 : Math.max(16, Math.min(72, row.score));
                return (
                  <div key={row.scanId} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={`w-full rounded-t-md ${trendBarClass(row.score)}`}
                      style={{ height }}
                      title={`${new Date(row.createdAt).toLocaleDateString()} · ${row.score ?? '—'}`}
                    />
                    <span className="text-[10px] text-on-surface-variant">
                      {new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-on-surface-variant">No score history in this range yet.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Range</span>
        {PRESETS.map(({ key, label }) => (
          <Link
            key={key}
            href={buildAuditsHref(workspaceId, {
              preset: key,
              status: auditFilter.status,
            })}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              presetActive(key)
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Status</span>
        {STATUS_FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={buildAuditsHref(workspaceId, {
              preset: auditFilter.preset ?? 'all',
              from: auditFilter.from ?? undefined,
              to: auditFilter.to ?? undefined,
              status: key,
            })}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              statusActive(key)
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        action="/dashboard/startup"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4"
      >
        <input type="hidden" name="tab" value="audits" />
        {workspaceId ? <input type="hidden" name="startupWorkspace" value={workspaceId} /> : null}
        <input type="hidden" name="status" value={auditFilter.status} />
        <label className="text-xs text-on-surface-variant">
          From
          <input
            type="date"
            name="from"
            defaultValue={auditFilter.from ?? ''}
            className="mt-1 block rounded-md border border-outline-variant bg-surface-container-low px-2 py-1.5 text-sm text-on-surface"
          />
        </label>
        <label className="text-xs text-on-surface-variant">
          To
          <input
            type="date"
            name="to"
            defaultValue={auditFilter.to ?? ''}
            className="mt-1 block rounded-md border border-outline-variant bg-surface-container-low px-2 py-1.5 text-sm text-on-surface"
          />
        </label>
        <button
          type="submit"
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            customActive
              ? 'bg-primary text-on-primary'
              : 'border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high'
          }`}
        >
          Apply dates
        </button>
        {customActive ? (
          <Link
            href={buildAuditsHref(workspaceId, { preset: 'all', status: auditFilter.status })}
            className="text-xs font-medium text-primary underline"
          >
            Clear custom range
          </Link>
        ) : null}
      </form>

      {dashboard.scans.length === 0 ? (
        <p className="mt-6 text-sm text-on-surface-variant">
          No audits yet.{' '}
          <Link
            href={workspaceId ? `/dashboard/new-scan?startupWorkspace=${workspaceId}` : '/dashboard/new-scan'}
            className="font-semibold text-primary underline"
          >
            Run a new scan
          </Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-on-surface-variant">
          No audits match this filter. Try a wider range, change the status filter, or clear custom dates.
        </p>
      ) : (
        <StartupAuditsTableClient rows={rows} />
      )}
    </article>
  );
}
