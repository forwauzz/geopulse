import { IntelligencePageFrame, IntelligenceQualityView } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

export default async function AdminIntelligenceQualityPage() {
  const context = await loadAdminPageContext('/admin/intelligence/quality');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getQuality()
    : { status: 'error' as const, data: { classifications: [], alerts: [] }, message: context.message };
  return (
    <IntelligencePageFrame
      title="Quality and quarantine"
      description="Derived quality is separate from original source status. This first release is inspect-only and contains no cleanup, quarantine, release, or deletion controls."
      status={result.status}
      message={result.message}
    >
      <IntelligenceQualityView
        classifications={result.data.classifications}
        alerts={result.data.alerts}
      />
    </IntelligencePageFrame>
  );
}
