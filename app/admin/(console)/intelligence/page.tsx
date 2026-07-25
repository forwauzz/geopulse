import {
  IntelligenceOverviewView,
  IntelligencePageFrame,
} from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData, type IntelligenceOverview } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

const EMPTY: IntelligenceOverview = {
  domainCount: 0, runCount: 0, evidenceCount: 0, qualityCount: 0,
  eligibleWindowCount: 0, ineligibleWindowCount: 0, openAlertCount: 0,
  interventionCount: 0,
  latestObservedAt: null, recentSourceKinds: [],
};

export default async function AdminIntelligencePage() {
  const context = await loadAdminPageContext('/admin/intelligence');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getOverview()
    : { status: 'error' as const, data: EMPTY, message: context.message };
  return (
    <IntelligencePageFrame
      title="Intelligence control room"
      description="One internal view of what GEO-Pulse is collecting, what is analytically safe, and how every derived claim traces back to source evidence."
      status={result.status}
      message={result.message}
    >
      <IntelligenceOverviewView overview={result.data} />
    </IntelligencePageFrame>
  );
}
