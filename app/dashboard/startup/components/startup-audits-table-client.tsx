'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import type { StartupAuditRowModel } from './startup-tab-types';

function normTitle(title: string): string {
  return title.trim().toLowerCase();
}

function scoreDeltaClass(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return 'text-on-surface-variant';
  if (delta > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (delta < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-on-surface-variant';
}

function recCountDeltaClass(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return 'text-on-surface-variant';
  if (delta < 0) return 'text-emerald-600 dark:text-emerald-400';
  if (delta > 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-on-surface-variant';
}

function implCountDeltaClass(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return 'text-on-surface-variant';
  if (delta > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (delta < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-on-surface-variant';
}

type Props = { readonly rows: readonly StartupAuditRowModel[] };

function executionBadgeClass(status: StartupAuditRowModel['executionStatus']): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'failed':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    case 'executing':
    case 'planning':
    case 'plan_ready':
    case 'waiting_manual':
    case 'received':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
    case 'cancelled':
      return 'bg-surface-container-high text-on-surface-variant';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
}

function executionLabel(status: StartupAuditRowModel['executionStatus']): string {
  switch (status) {
    case 'received':
      return 'Received';
    case 'planning':
      return 'Planning';
    case 'plan_ready':
      return 'Plan ready';
    case 'executing':
      return 'Executing';
    case 'waiting_manual':
      return 'Waiting manual';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Not started';
  }
}

export function StartupAuditsTableClient({ rows }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [showDelta, setShowDelta] = useState(false);

  const rowById = useMemo(() => new Map(rows.map((row) => [row.scanId, row])), [rows]);

  const toggle = useCallback((id: string) => {
    setShowDelta(false);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((pickedId) => pickedId !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }, []);

  const clearComparison = useCallback(() => {
    setPicked([]);
    setShowDelta(false);
  }, []);

  const runCompare = useCallback(() => {
    if (picked.length === 2) setShowDelta(true);
  }, [picked.length]);

  const auditA = picked[0] ? rowById.get(picked[0]) : undefined;
  const auditB = picked[1] ? rowById.get(picked[1]) : undefined;

  let scoreDelta: number | null = null;
  let recDelta: number | null = null;
  let implDelta: number | null = null;
  let newInB: string[] = [];
  let onlyInA: string[] = [];

  if (auditA && auditB && showDelta) {
    if (auditA.score != null && auditB.score != null) {
      scoreDelta = auditB.score - auditA.score;
    }
    recDelta = auditB.recCount - auditA.recCount;
    implDelta = auditB.implementedCount - auditA.implementedCount;

    const setA = new Set(auditA.recTitles.map(normTitle));
    const setB = new Set(auditB.recTitles.map(normTitle));
    newInB = auditB.recTitles.filter((title) => !setA.has(normTitle(title))).slice(0, 3);
    onlyInA = auditA.recTitles.filter((title) => !setB.has(normTitle(title))).slice(0, 3);
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-xs text-on-surface-variant">
        Compare: select up to two audits, then <span className="font-medium text-on-surface">Compare</span>. First selected = Audit A,
        second = Audit B.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={picked.length !== 2}
          onClick={runCompare}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Compare selected
        </button>
        <button
          type="button"
          onClick={clearComparison}
          className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high"
        >
          Clear selection
        </button>
        <span className="text-xs text-on-surface-variant">{picked.length}/2 selected</span>
      </div>

      {showDelta && auditA && auditB ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Comparison</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-on-surface-variant">Audit A</p>
              <p className="mt-1 font-medium text-on-surface">{auditA.domain}</p>
              <p className="text-xs text-on-surface-variant">{new Date(auditA.createdAt).toLocaleString()}</p>
              <p className="mt-2">
                Score: <span className="font-semibold">{auditA.score ?? '—'}</span> · Grade:{' '}
                <span className="font-semibold">{auditA.letterGrade ?? '—'}</span>
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">Recommendations: {auditA.recCount}</p>
              <p className="mt-1 text-xs text-on-surface-variant">Implemented: {auditA.implementedCount}</p>
            </div>
            <div className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-on-surface-variant">Audit B</p>
              <p className="mt-1 font-medium text-on-surface">{auditB.domain}</p>
              <p className="text-xs text-on-surface-variant">{new Date(auditB.createdAt).toLocaleString()}</p>
              <p className="mt-2">
                Score: <span className="font-semibold">{auditB.score ?? '—'}</span> · Grade:{' '}
                <span className="font-semibold">{auditB.letterGrade ?? '—'}</span>
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">Recommendations: {auditB.recCount}</p>
              <p className="mt-1 text-xs text-on-surface-variant">Implemented: {auditB.implementedCount}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-outline-variant pt-4 text-sm">
            <p>
              Score delta (B - A):{' '}
              <span className={`font-semibold ${scoreDeltaClass(scoreDelta)}`}>
                {scoreDelta == null ? '—' : scoreDelta > 0 ? `+${scoreDelta}` : String(scoreDelta)}
              </span>
            </p>
            <p>
              Recommendations delta (B - A):{' '}
              <span className={`font-semibold ${recCountDeltaClass(recDelta)}`}>
                {recDelta == null ? '—' : recDelta > 0 ? `+${recDelta}` : String(recDelta)}
              </span>
            </p>
            <p>
              Implemented delta (B - A):{' '}
              <span className={`font-semibold ${implCountDeltaClass(implDelta)}`}>
                {implDelta == null ? '—' : implDelta > 0 ? `+${implDelta}` : String(implDelta)}
              </span>
            </p>
            {newInB.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Titles in B not in A (sample)
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-on-surface">
                  {newInB.map((title, index) => (
                    <li key={`b-${index}-${normTitle(title).slice(0, 48)}`}>{title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {onlyInA.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Titles in A not in B (sample)
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-on-surface">
                  {onlyInA.map((title, index) => (
                    <li key={`a-${index}-${normTitle(title).slice(0, 48)}`}>{title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="w-10 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Cmp
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Date</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Domain</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Score</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Grade</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Report</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Execution</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Source</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Impl.</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((scan) => (
              <tr key={scan.scanId} className="border-b border-outline-variant last:border-0">
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={picked.includes(scan.scanId)}
                    onChange={() => toggle(scan.scanId)}
                    aria-label={`Select audit ${scan.domain} for comparison`}
                    className="h-4 w-4 rounded border-outline-variant"
                  />
                </td>
                <td className="px-3 py-2 text-on-surface">{new Date(scan.createdAt).toLocaleString()}</td>
                <td className="max-w-[140px] truncate px-3 py-2 text-on-surface" title={scan.url}>
                  {scan.domain}
                </td>
                <td className="px-3 py-2 text-on-surface">{scan.score != null ? `${scan.score}` : '—'}</td>
                <td className="px-3 py-2 text-on-surface">{scan.letterGrade ?? '—'}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs text-on-surface-variant" title={scan.reportStatus}>
                  {scan.reportStatus}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${executionBadgeClass(scan.executionStatus)}`}
                    >
                      {executionLabel(scan.executionStatus)}
                    </span>
                    {scan.executionSummary ? (
                      <p className="max-w-[180px] truncate" title={scan.executionSummary}>
                        {scan.executionSummary}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">{scan.runSource}</td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">
                  {scan.implementedCount > 0 ? (
                    <div className="space-y-1">
                      <p className="font-medium text-on-surface">Validated {scan.implementedCount}</p>
                      {scan.implementedTitles.length > 0 ? (
                        <p className="max-w-[160px] truncate" title={scan.implementedTitles.join(' · ')}>
                          {scan.implementedTitles[0]}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span>None yet</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-on-surface-variant">{scan.openCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
