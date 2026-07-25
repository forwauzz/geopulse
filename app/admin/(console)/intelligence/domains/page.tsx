import { IntelligenceDomainsView, IntelligencePageFrame } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

export default async function AdminIntelligenceDomainsPage() {
  const context = await loadAdminPageContext('/admin/intelligence/domains');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getDomains()
    : { status: 'error' as const, data: [], message: context.message };
  return (
    <IntelligencePageFrame
      title="Domain measurement timeline"
      description="Eligible canonical-domain observations with freshness, coverage, model mode, and explicit compatibility labels."
      status={result.status}
      message={result.message}
    >
      <IntelligenceDomainsView rows={result.data} />
    </IntelligencePageFrame>
  );
}
