import {
  IntelligenceCommercialReadinessView,
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
  const contextMessage = context.ok ? null : context.message;
  const data = context.ok ? createIntelligenceAdminData(context.adminDb) : null;
  const [result, readiness] = data
    ? await Promise.all([data.getOverview(), data.getCommercialReadiness('msp_it')])
    : [
        { status: 'error' as const, data: EMPTY, message: contextMessage },
        { status: 'error' as const, data: null, message: contextMessage },
      ];
  const status = result.status === 'ready' ? readiness.status : result.status;
  const message = result.message ?? readiness.message;
  return (
    <IntelligencePageFrame
      title="Intelligence control room"
      description="One internal view of what GEO-Pulse is collecting, what is analytically safe, and how every derived claim traces back to source evidence."
      status={status}
      message={message}
    >
      <IntelligenceCommercialReadinessView readiness={readiness.data} />
      <IntelligenceOverviewView overview={result.data} />
    </IntelligencePageFrame>
  );
}
