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
  StartupAuditsTabProps,
} from './startup-tab-types';
import { StartupAuditsTableClient } from './startup-audits-table-client';

function buildAuditsHref(
  workspaceId: string | null,
  next: { preset?: StartupAuditRangePreset; from?: string; to?: string }
): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set('startupWorkspace', workspaceId);
  p.set('tab', 'audits');
  if (next.from || next.to) {
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
  } else if (next.preset && next.preset !== 'all') {
    p.set('range', next.preset);
  }
  return `/dashboard/startup?${p.toString()}`;
}

function filterScans(scans: readonly StartupWorkspaceScan[], filter: StartupAuditFilterState): StartupWorkspaceScan[] {
  const sorted = [...scans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (filter.from || filter.to) {
    return sorted.filter((s) => {
      const d = s.createdAt.slice(0, 10);
      if (filter.from && d < filter.from) return false;
      if (filter.to && d > filter.to) return false;
      return true;
    });
  }
  if (!filter.preset || filter.preset === 'all') return sorted;
  const days = filter.preset === '7d' ? 7 : filter.preset === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * 86400000;
  return sorted.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
}

function reportForScan(reports: readonly StartupWorkspaceReport[], scanId: string): StartupWorkspaceReport | undefined {
  return reports.find((r) => r.scanId === scanId);
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
    const recTitles = recommendations.filter((r) => r.scanId === scan.id).map((r) => r.title);
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
      recTitles,
    };
  });
}

const PRESETS: { key: StartupAuditRangePreset; label: string }[] = [
  { key: '7d', label: 'Last 7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

export function StartupAuditsTab({ dashboard, auditFilter }: StartupAuditsTabProps) {
  const wid = dashboard.selectedWorkspaceId;
  const filtered = filterScans(dashboard.scans, auditFilter);
  const presetActive = (key: StartupAuditRangePreset) =>
    auditFilter.preset === key && !auditFilter.from && !auditFilter.to;
  const customActive = Boolean(auditFilter.from || auditFilter.to);

  return (
    <article
      data-testid="startup-audits-tab"
      className="rounded-2xl border border-outline-variant bg-surface-container p-5 lg:col-span-2"
    >
      <h2 className="text-lg font-semibold">Audit history</h2>
      <p className="mt-1 text-sm text-on-surface-variant">Startup scans for this workspace, newest first. Filters use URL params.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Range</span>
        {PRESETS.map(({ key, label }) => (
          <Link
            key={key}
            href={buildAuditsHref(wid, { preset: key })}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              presetActive(key) ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form method="get" action="/dashboard/startup" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <input type="hidden" name="tab" value="audits" />
        {wid ? <input type="hidden" name="startupWorkspace" value={wid} /> : null}
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
            customActive ? 'bg-primary text-on-primary' : 'border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high'
          }`}
        >
          Apply dates
        </button>
        {customActive ? (
          <Link
            href={buildAuditsHref(wid, { preset: 'all' })}
            className="text-xs font-medium text-primary underline"
          >
            Clear custom range
          </Link>
        ) : null}
      </form>

      {dashboard.scans.length === 0 ? (
        <p className="mt-6 text-sm text-on-surface-variant">
          No audits yet.{' '}
          <Link href={wid ? `/dashboard/new-scan?startupWorkspace=${wid}` : '/dashboard/new-scan'} className="font-semibold text-primary underline">
            Run a new scan
          </Link>
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-sm text-on-surface-variant">No audits match this filter. Try a wider range or clear custom dates.</p>
      ) : (
        <StartupAuditsTableClient
          rows={buildAuditRows(filtered, dashboard.reports, dashboard.recommendations)}
        />
      )}
    </article>
  );
}
