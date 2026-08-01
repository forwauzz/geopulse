import { AgencyReportView } from '@/components/agency-report-view';
import { applyReportSettingsToSnapshot, type AgencyReportSnapshotV2 } from '@/lib/server/agency-report-snapshot';
import type { ReportSettings } from '@/lib/server/report-settings';

/** The preview and client share page intentionally use the same snapshot-driven renderer. */
export function ReportPreviewPage({
  snapshot,
  settings,
  brandName,
  brandColor,
}: {
  readonly snapshot: AgencyReportSnapshotV2 | null;
  readonly settings: ReportSettings;
  readonly brandName: string;
  readonly brandColor: string;
}) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-lowest p-6 text-center">
        <p className="font-headline text-base font-semibold text-on-background">No canonical report yet</p>
        <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">The preview will appear after one complete multi-engine snapshot is stored. No placeholder metrics are invented.</p>
      </div>
    );
  }
  return (
    <AgencyReportView
      snapshot={applyReportSettingsToSnapshot(snapshot, settings)}
      agencyName={brandName}
      brandColor={brandColor}
      compact
    />
  );
}
