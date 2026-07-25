import { IntelligencePageFrame, IntelligencePatternsView } from '@/components/intelligence-admin-view';
import { createIntelligenceAdminData } from '@/lib/intelligence/admin-data';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

export default async function AdminIntelligencePatternsPage() {
  const context = await loadAdminPageContext('/admin/intelligence/patterns');
  const result = context.ok
    ? await createIntelligenceAdminData(context.adminDb).getPatterns()
    : { status: 'error' as const, data: [], message: context.message };
  return (
    <IntelligencePageFrame
      title="Intervention patterns"
      description="Read-only compatible before/after associations. Governed learning is not active, and this page never presents correlation as causation."
      status={result.status}
      message={result.message}
    >
      <IntelligencePatternsView rows={result.data} />
    </IntelligencePageFrame>
  );
}
