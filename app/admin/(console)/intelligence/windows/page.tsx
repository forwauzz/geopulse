import { IntelligencePageFrame, IntelligenceWindowsView } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Promise<{ lane?: string; window?: string }>;
};

export default async function AdminIntelligenceWindowsPage({ searchParams }: Props) {
  const filters = (await searchParams) ?? {};
  const context = await loadAdminPageContext('/admin/intelligence/windows');
  if (!context.ok) {
    return (
      <IntelligencePageFrame
        title="Window health"
        description="Coverage and anomaly gates before any benchmark headline."
        status="error"
        message={context.message}
      >
        <IntelligenceWindowsView rows={[]} runs={[]} />
      </IntelligencePageFrame>
    );
  }
  const data = createIntelligenceAdminData(context.adminDb);
  const [windows, runs] = await Promise.all([
    data.getWindows(filters.lane),
    filters.lane || filters.window
      ? data.getRuns({ laneId: filters.lane || undefined, windowId: filters.window || undefined })
      : Promise.resolve({ status: 'ready' as const, data: [], message: null }),
  ]);
  const status = windows.status !== 'ready' ? windows.status : runs.status;
  return (
    <IntelligencePageFrame
      title="Window health"
      description="Completeness, freshness, missing cells, and anomalies first. Select a canonical window to drill into its runs and evidence."
      status={status}
      message={windows.message ?? runs.message}
    >
      <IntelligenceWindowsView rows={windows.data} runs={runs.data} />
    </IntelligencePageFrame>
  );
}
